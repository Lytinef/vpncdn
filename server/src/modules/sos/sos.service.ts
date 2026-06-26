import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { SosDevice } from './entities/sos-device.entity';
import { NodesService } from '../nodes/nodes.service';
import { XrayService, ConnectionVariant } from '../xray/xray.service';
import { Node } from '../nodes/entities/node.entity';

/** Жёсткий лимит SOS-трафика: 100 МБ суммарно за всё время на устройство. */
export const SOS_LIMIT_BYTES = 100 * 1024 * 1024;

@Injectable()
export class SosService {
  private readonly logger = new Logger(SosService.name);

  constructor(
    @InjectRepository(SosDevice) private readonly repo: Repository<SosDevice>,
    private readonly nodes: NodesService,
    private readonly xray: XrayService,
  ) {}

  /** SOS-email клиента на узле (`sos.<sosDeviceId>@vpncdn`). */
  private emailFor(sos: SosDevice): string {
    return `sos.${sos.id}@vpncdn`;
  }

  /** Выдаёт экстренное CDN-подключение по hardwareId, если лимит не исчерпан. */
  async connect(hardwareId: string): Promise<ConnectionVariant> {
    const hw = (hardwareId || '').trim();
    if (!hw) throw new BadRequestException('Нет идентификатора устройства');

    let sos = await this.repo.findOne({ where: { hardwareId: hw } });
    if (sos && (sos.blocked || Number(sos.usedBytes) >= SOS_LIMIT_BYTES)) {
      throw new ForbiddenException('Лимит SOS-доступа (100 МБ) исчерпан');
    }

    const node = (await this.nodes.findAll()).find((n) => n.isActive);
    if (!node) throw new ServiceUnavailableException('Нет доступных узлов');

    if (!sos) {
      sos = await this.repo.save(
        this.repo.create({ hardwareId: hw, xrayUuid: uuidv4(), nodeId: node.id }),
      );
    } else if (sos.nodeId !== node.id) {
      await this.repo.update(sos.id, { nodeId: node.id });
      sos.nodeId = node.id;
    }

    await this.xray.provisionRaw(node, sos.xrayUuid, this.emailFor(sos));
    await this.repo.update(sos.id, { lastSeenAt: new Date() });
    this.logger.log(`SOS-доступ выдан устройству ${hw} (использовано ${sos.usedBytes} б)`);
    return this.xray.buildCdnConnection(node, sos.xrayUuid, 'SOS');
  }

  /**
   * Учёт SOS-трафика (вызывается поллером статистики). Накопив 100 МБ —
   * снимает клиента с узла и блокирует устройство.
   */
  async applyStats(node: Node, sosId: string, deltaBytes: number): Promise<void> {
    if (deltaBytes <= 0) return;
    const sos = await this.repo.findOne({ where: { id: sosId } });
    if (!sos || sos.blocked) return;
    const used = Number(sos.usedBytes) + deltaBytes;
    const over = used >= SOS_LIMIT_BYTES;
    await this.repo.update(sos.id, { usedBytes: String(used), blocked: over });
    if (over) {
      await this.xray
        .deprovisionRaw(node, sos.xrayUuid, this.emailFor(sos))
        .catch(() => undefined);
      this.logger.log(`SOS-лимит исчерпан устройством ${sos.hardwareId} — доступ снят`);
    }
  }
}
