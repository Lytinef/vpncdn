import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Device } from './entities/device.entity';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { NodesService } from '../nodes/nodes.service';
import { XrayService, VlessConnection } from '../xray/xray.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';

@Injectable()
export class DevicesService {
  private readonly logger = new Logger(DevicesService.name);

  constructor(
    @InjectRepository(Device)
    private readonly devices: Repository<Device>,
    private readonly nodes: NodesService,
    private readonly xray: XrayService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  listForUser(userId: string): Promise<Device[]> {
    return this.devices.find({
      where: { userId, isActive: true },
      order: { createdAt: 'ASC' },
    });
  }

  countActive(userId: string): Promise<number> {
    return this.devices.count({ where: { userId, isActive: true } });
  }

  /**
   * Регистрирует устройство в рамках лимита тарифа.
   * Повторный вход с тем же hardwareId переиспользует существующее устройство.
   */
  async register(userId: string, dto: RegisterDeviceDto): Promise<Device> {
    const limit = await this.subscriptions.getEffectiveDeviceLimit(userId);
    if (limit <= 0) {
      throw new BadRequestException('Нет активной подписки');
    }

    // Повторная регистрация известного устройства.
    if (dto.hardwareId) {
      const existing = await this.devices.findOne({
        where: { userId, hardwareId: dto.hardwareId },
      });
      if (existing) {
        existing.isActive = true;
        existing.name = dto.name;
        existing.platform = dto.platform;
        await this.devices.save(existing);
        await this.ensureProvisioned(existing);
        return existing;
      }
    }

    const active = await this.countActive(userId);
    if (active >= limit) {
      throw new ForbiddenException(
        `Достигнут лимит устройств для вашего тарифа (${limit}). Удалите устройство или смените тариф.`,
      );
    }

    const node = await this.nodes.pickLeastLoaded();
    const device = this.devices.create({
      userId,
      nodeId: node.id,
      node,
      name: dto.name,
      platform: dto.platform,
      hardwareId: dto.hardwareId ?? null,
      xrayUuid: uuidv4(),
      isActive: true,
      lastSeenAt: new Date(),
    });
    await this.devices.save(device);
    await this.xray.provisionDevice(node, device);
    this.logger.log(`Устройство ${device.id} зарегистрировано на узле ${node.name}`);
    return device;
  }

  /** Возвращает конфигурацию подключения, проверяя доступ по подписке. */
  async getConnection(userId: string, deviceId: string): Promise<VlessConnection> {
    const sub = await this.subscriptions.getActive(userId);
    if (!this.subscriptions.hasAccess(sub)) {
      throw new ForbiddenException('Нет активной подписки');
    }
    const device = await this.getOwned(userId, deviceId);
    const node = await this.ensureNode(device);
    await this.devices.update(device.id, { lastSeenAt: new Date() });
    return this.xray.buildConnection(node, device);
  }

  async remove(userId: string, deviceId: string): Promise<void> {
    const device = await this.getOwned(userId, deviceId);
    if (device.nodeId) {
      const node = await this.nodes.findById(device.nodeId).catch(() => null);
      if (node) await this.xray.deprovisionDevice(node, device);
    }
    await this.devices.delete(device.id);
    this.logger.log(`Устройство ${deviceId} удалено`);
  }

  /** Отзыв всех устройств пользователя (удаление аккаунта). */
  async revokeAllForUser(userId: string): Promise<void> {
    const list = await this.devices.find({ where: { userId } });
    for (const device of list) {
      if (device.nodeId) {
        const node = await this.nodes.findById(device.nodeId).catch(() => null);
        if (node) await this.xray.deprovisionDevice(node, device);
      }
    }
    // Сами записи удалятся каскадом при удалении пользователя.
  }

  private async getOwned(userId: string, deviceId: string): Promise<Device> {
    const device = await this.devices.findOne({ where: { id: deviceId, userId } });
    if (!device) throw new NotFoundException('Устройство не найдено');
    return device;
  }

  /** Гарантирует, что устройство привязано к активному узлу. */
  private async ensureNode(device: Device) {
    if (device.nodeId) {
      const node = await this.nodes.findById(device.nodeId).catch(() => null);
      if (node && node.isActive) return node;
    }
    // Узел пропал/выключен — переназначаем.
    const node = await this.nodes.pickLeastLoaded();
    device.nodeId = node.id;
    device.node = node;
    await this.devices.save(device);
    await this.xray.provisionDevice(node, device);
    return node;
  }

  private async ensureProvisioned(device: Device): Promise<void> {
    if (!device.nodeId) {
      await this.ensureNode(device);
      return;
    }
    const node = await this.nodes.findById(device.nodeId).catch(() => null);
    if (node) await this.xray.provisionDevice(node, device);
  }
}
