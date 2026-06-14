import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { Node } from './entities/node.entity';
import { Device } from '../devices/entities/device.entity';

@Injectable()
export class NodesService {
  constructor(
    @InjectRepository(Node)
    private readonly nodes: Repository<Node>,
    @InjectRepository(Device)
    private readonly devices: Repository<Device>,
  ) {}

  findAll(): Promise<Node[]> {
    return this.nodes.find({ order: { createdAt: 'ASC' } });
  }

  async findById(id: string): Promise<Node> {
    const node = await this.nodes.findOne({ where: { id } });
    if (!node) throw new NotFoundException('Узел не найден');
    return node;
  }

  create(data: Partial<Node>): Promise<Node> {
    return this.nodes.save(this.nodes.create(data));
  }

  async update(id: string, data: Partial<Node>): Promise<Node> {
    await this.nodes.update(id, data as QueryDeepPartialEntity<Node>);
    return this.findById(id);
  }

  async remove(id: string): Promise<void> {
    await this.nodes.delete(id);
  }

  /** Кол-во активных устройств на узле (для оценки нагрузки). */
  countDevices(nodeId: string): Promise<number> {
    return this.devices.count({ where: { nodeId, isActive: true } });
  }

  /** Выбирает наименее загруженный активный узел с запасом ёмкости. */
  async pickLeastLoaded(): Promise<Node> {
    const active = await this.nodes.find({ where: { isActive: true } });
    if (!active.length) {
      throw new ServiceUnavailableException('Нет доступных VPN-узлов');
    }
    const withLoad = await Promise.all(
      active.map(async (node) => {
        const count = await this.countDevices(node.id);
        return { node, count, free: node.capacity - count };
      }),
    );
    const candidates = withLoad.filter((x) => x.free > 0);
    if (!candidates.length) {
      throw new ServiceUnavailableException('Все узлы заполнены');
    }
    candidates.sort((a, b) => b.free - a.free);
    return candidates[0].node;
  }

  /** Статистика по узлам для админки. */
  async stats(): Promise<Array<{ node: Node; devices: number }>> {
    const all = await this.findAll();
    return Promise.all(
      all.map(async (node) => ({ node, devices: await this.countDevices(node.id) })),
    );
  }
}
