import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Node } from '../nodes/entities/node.entity';
import { Device } from '../devices/entities/device.entity';
import { NodesService } from '../nodes/nodes.service';
import { XrayService } from '../xray/xray.service';

/**
 * Раз в минуту опрашивает активные узлы:
 *  - /metrics → нагрузка узла (CPU/RAM) в Node;
 *  - /stats → дельта трафика по пользователям, накапливается в Device.
 */
@Injectable()
export class StatsPollerService {
  private readonly logger = new Logger(StatsPollerService.name);

  constructor(
    @InjectRepository(Node) private readonly nodes: Repository<Node>,
    @InjectRepository(Device) private readonly devices: Repository<Device>,
    private readonly nodesService: NodesService,
    private readonly xray: XrayService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async poll(): Promise<void> {
    const all = await this.nodesService.findAll();
    for (const node of all) {
      if (!node.isActive || !node.apiUrl) continue;
      await this.pollNode(node).catch((e) =>
        this.logger.warn(`Узел ${node.name}: опрос не удался — ${e.message}`),
      );
    }
  }

  private async pollNode(node: Node): Promise<void> {
    const metrics = await this.xray.fetchMetrics(node);
    if (metrics) {
      await this.nodes.update(node.id, {
        cpuPercent: metrics.cpuPercent,
        memPercent: metrics.memPercent,
        metricsAt: new Date(),
      });
    }

    const stats = await this.xray.fetchStats(node);
    for (const s of stats) {
      const deviceId = this.deviceIdFromEmail(s.email);
      if (!deviceId) continue;
      const up = Math.max(0, Math.round(s.uplink || 0));
      const down = Math.max(0, Math.round(s.downlink || 0));
      if (up === 0 && down === 0) continue;
      await this.devices
        .createQueryBuilder()
        .update()
        .set({
          uplinkBytes: () => `"uplinkBytes" + ${up}`,
          downlinkBytes: () => `"downlinkBytes" + ${down}`,
        })
        .where('id = :id', { id: deviceId })
        .execute()
        .catch(() => undefined);
    }
  }

  /** email = `${userId}.${deviceId}@vpncdn`. */
  private deviceIdFromEmail(email: string): string | null {
    const local = (email || '').split('@')[0];
    const parts = local.split('.');
    return parts.length === 2 ? parts[1] : null;
  }
}
