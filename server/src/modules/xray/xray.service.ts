import { Injectable } from '@nestjs/common';
import { Node } from '../nodes/entities/node.entity';
import { Device } from '../devices/entities/device.entity';
import { XrayNodeClient } from './xray-node.client';

/** Один вариант подключения (через CDN или напрямую). */
export interface ConnectionVariant {
  /** 'cdn' — VLESS+XHTTP+TLS через NGENIX (обход блокировок).
   *  'direct' — VLESS+Vision+Reality мимо CDN (ниже пинг, IP блокируем). */
  mode: 'cdn' | 'direct';
  protocol: 'vless';
  uuid: string;
  address: string;
  port: number;
  encryption: 'none';
  /** 'tls' для CDN, 'reality' для прямого. */
  security: 'tls' | 'reality';
  sni: string;
  /** 'xhttp' для CDN, 'tcp' для прямого. */
  network: 'xhttp' | 'tcp';
  // CDN (xhttp):
  wsPath: string;
  wsHost: string;
  // direct (reality):
  flow: string;
  publicKey: string;
  shortId: string;
  fingerprint: string;
  /** Готовая vless:// ссылка (для импорта в happ/v2rayng). */
  uri: string;
}

/**
 * Конфигурация подключения устройства. Верхнеуровневые поля = CDN-вариант
 * (обратная совместимость со старым клиентом); cdn/direct — для нового клиента
 * с тумблером. direct = null, если у узла не настроен прямой режим.
 */
export interface VlessConnection {
  protocol: 'vless';
  uuid: string;
  address: string;
  port: number;
  encryption: 'none';
  security: 'tls';
  sni: string;
  network: 'ws';
  wsPath: string;
  wsHost: string;
  uri: string;
  cdn: ConnectionVariant;
  direct: ConnectionVariant | null;
}

const REALITY_FLOW = 'xtls-rprx-vision';
const REALITY_FP = 'chrome';

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

  /** Собирает конфигурацию подключения для клиента (CDN + опционально прямой). */
  buildConnection(node: Node, device: Device): VlessConnection {
    const cdn = this.buildCdnVariant(node, device);
    const direct = this.buildDirectVariant(node, device);
    return {
      // Верхний уровень = CDN (обратная совместимость со старым клиентом).
      protocol: 'vless',
      uuid: cdn.uuid,
      address: cdn.address,
      port: cdn.port,
      encryption: 'none',
      security: 'tls',
      sni: cdn.sni,
      network: 'ws',
      wsPath: cdn.wsPath,
      wsHost: cdn.wsHost,
      uri: cdn.uri,
      cdn,
      direct,
    };
  }

  /** CDN-вариант: VLESS + XHTTP + TLS через NGENIX. */
  private buildCdnVariant(node: Node, device: Device): ConnectionVariant {
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
      `#${encodeURIComponent(node.name + ' • CDN')}`;

    return {
      mode: 'cdn',
      protocol: 'vless',
      uuid: device.xrayUuid,
      address: node.cdnDomain,
      port: node.port,
      encryption: 'none',
      security: 'tls',
      sni: node.sni,
      network: 'xhttp',
      wsPath: node.wsPath,
      wsHost: node.cdnDomain,
      flow: '',
      publicKey: '',
      shortId: '',
      fingerprint: '',
      uri,
    };
  }

  /** Прямой вариант: VLESS + XTLS-Vision + Reality мимо CDN. null если не настроен. */
  private buildDirectVariant(node: Node, device: Device): ConnectionVariant | null {
    if (!node.directHost || !node.directPublicKey) return null;
    const sni = node.directSni || 'www.microsoft.com';
    const shortId = node.directShortId || '';
    const uri =
      `vless://${device.xrayUuid}@${node.directHost}:${node.directPort}` +
      `?encryption=none&security=reality&sni=${encodeURIComponent(sni)}` +
      `&fp=${REALITY_FP}&pbk=${encodeURIComponent(node.directPublicKey)}` +
      (shortId ? `&sid=${encodeURIComponent(shortId)}` : '') +
      `&type=tcp&flow=${REALITY_FLOW}` +
      `#${encodeURIComponent(node.name + ' • Direct')}`;

    return {
      mode: 'direct',
      protocol: 'vless',
      uuid: device.xrayUuid,
      address: node.directHost,
      port: node.directPort,
      encryption: 'none',
      security: 'reality',
      sni,
      network: 'tcp',
      wsPath: '',
      wsHost: '',
      flow: REALITY_FLOW,
      publicKey: node.directPublicKey,
      shortId,
      fingerprint: REALITY_FP,
      uri,
    };
  }

  private emailFor(device: Device): string {
    // Уникальная метка клиента в Xray (для статистики/идентификации).
    return `${device.userId}.${device.id}@vpncdn`;
  }
}
