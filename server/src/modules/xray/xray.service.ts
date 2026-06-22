import { Injectable } from '@nestjs/common';
import { Node } from '../nodes/entities/node.entity';
import { Device } from '../devices/entities/device.entity';
import { XrayNodeClient } from './xray-node.client';

/** Структурированная конфигурация подключения для нативного ядра клиента. */
export interface VlessConnection {
  protocol: 'vless';
  uuid: string;
  /** Домен в NGENIX, к которому подключается клиент. */
  address: string;
  port: number;
  encryption: 'none';
  security: 'tls';
  sni: string;
  network: 'ws';
  wsPath: string;
  /** Host-заголовок WebSocket (как правило = address). */
  wsHost: string;
  /** Готовая vless:// ссылка (для импорта/отладки). */
  uri: string;
}

@Injectable()
export class XrayService {
  constructor(private readonly nodeClient: XrayNodeClient) {}

  /** Регистрирует устройство как VLESS-клиента на узле. */
  async provisionDevice(node: Node, device: Device): Promise<void> {
    await this.nodeClient.addClient(node, device.xrayUuid, this.emailFor(device));
  }

  /** Снимает доступ устройства на узле. */
  async deprovisionDevice(node: Node, device: Device): Promise<void> {
    await this.nodeClient.removeClient(node, device.xrayUuid, this.emailFor(device));
  }

  /** Трафик по пользователям с узла (дельта). */
  fetchStats(node: Node) {
    return this.nodeClient.getStats(node);
  }

  /** Метрики нагрузки узла. */
  fetchMetrics(node: Node) {
    return this.nodeClient.getMetrics(node);
  }

  /** Собирает конфигурацию подключения для клиента. */
  buildConnection(node: Node, device: Device): VlessConnection {
    // Транспорт — XHTTP (как на origin за NGENIX); ws-ссылка не подключится.
    // xmux в ссылке — чтобы happ/v2rayng (iPhone) тоже использовали несколько
    // параллельных соединений (меньше всплесков пинга/обрывов). Клиенты без
    // поддержки extra просто игнорируют параметр.
    const xmuxExtra = encodeURIComponent(
      JSON.stringify({
        xmux: {
          maxConcurrency: '16-32',
          maxConnections: 0,
          hMaxRequestTimes: '600-900',
          hKeepAlivePeriod: 30,
        },
      }),
    );
    const uri =
      `vless://${device.xrayUuid}@${node.cdnDomain}:${node.port}` +
      `?encryption=none&security=tls&sni=${encodeURIComponent(node.sni)}` +
      `&type=xhttp&host=${encodeURIComponent(node.cdnDomain)}` +
      `&path=${encodeURIComponent(node.wsPath)}&mode=auto&extra=${xmuxExtra}` +
      `#${encodeURIComponent(node.name)}`;

    return {
      protocol: 'vless',
      uuid: device.xrayUuid,
      address: node.cdnDomain,
      port: node.port,
      encryption: 'none',
      security: 'tls',
      sni: node.sni,
      network: 'ws',
      wsPath: node.wsPath,
      wsHost: node.cdnDomain,
      uri,
    };
  }

  private emailFor(device: Device): string {
    // Уникальная метка клиента в Xray (для статистики/идентификации).
    return `${device.userId}.${device.id}@vpncdn`;
  }
}
