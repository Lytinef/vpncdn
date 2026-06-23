import { Injectable } from '@nestjs/common';
import { Node } from '../nodes/entities/node.entity';
import { Device } from '../devices/entities/device.entity';
import { XrayNodeClient } from './xray-node.client';

/** Один вариант подключения (через CDN или напрямую). */
export interface ConnectionVariant {
  /** 'cdn' — VLESS+XHTTP+TLS через NGENIX (обход блокировок).
   *  'direct' — мимо CDN (ниже пинг, IP блокируем): hysteria2 или reality. */
  mode: 'cdn' | 'direct';
  /** 'vless' (cdn/reality) | 'hysteria2' (прямой по UDP/QUIC). */
  protocol: 'vless' | 'hysteria2';
  uuid: string;
  address: string;
  port: number;
  encryption: 'none';
  /** 'tls' для CDN, 'reality' для reality-прямого, 'tls' для hysteria2. */
  security: 'tls' | 'reality';
  sni: string;
  /** 'xhttp' для CDN, 'tcp' для reality, 'udp' для hysteria2. */
  network: 'xhttp' | 'tcp' | 'udp';
  // CDN (xhttp):
  wsPath: string;
  wsHost: string;
  // direct/reality:
  flow: string;
  publicKey: string;
  shortId: string;
  fingerprint: string;
  // direct/hysteria2:
  /** Пароль hysteria2 (= uuid). */
  auth: string;
  /** pinSHA256 сертификата hysteria2 (self-signed). */
  certPin: string;
  /** Пропустить проверку CA (self-signed; защита через certPin). */
  insecure: boolean;
  /** Готовая ссылка (vless:// или hysteria2://) для импорта. */
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
      auth: '',
      certPin: '',
      insecure: false,
      uri,
    };
  }

  /** Прямой вариант мимо CDN: hysteria2 (по умолчанию) или reality. null если не настроен. */
  private buildDirectVariant(node: Node, device: Device): ConnectionVariant | null {
    if (!node.directHost) return null;
    if (node.directProtocol === 'reality') return this.buildRealityVariant(node, device);
    return this.buildHysteria2Variant(node, device);
  }

  /** Прямой через Hysteria2 (UDP/QUIC). Пароль = uuid.
   *  Сервер на настоящем LE-серте (api.lytinef.ru) → insecure/pin не нужны,
   *  конфиг принимают все клиенты (happ/Hiddify/NekoBox). Если у узла задан
   *  directCertPin — режим self-signed (insecure+pin) для совместимости. */
  private buildHysteria2Variant(node: Node, device: Device): ConnectionVariant | null {
    const sni = node.directSni || 'api.lytinef.ru';
    const certPin = node.directCertPin || '';
    const selfSigned = certPin.length > 0;
    let uri =
      `hysteria2://${encodeURIComponent(device.xrayUuid)}@${node.directHost}:${node.directPort}` +
      `?sni=${encodeURIComponent(sni)}`;
    if (selfSigned) {
      uri += `&insecure=1&pinSHA256=${encodeURIComponent(certPin)}`;
    }
    uri += `#${encodeURIComponent(node.name + ' • Direct')}`;

    return {
      mode: 'direct',
      protocol: 'hysteria2',
      uuid: device.xrayUuid,
      address: node.directHost!,
      port: node.directPort,
      encryption: 'none',
      security: 'tls',
      sni,
      network: 'udp',
      wsPath: '',
      wsHost: '',
      flow: '',
      publicKey: '',
      shortId: '',
      fingerprint: '',
      auth: device.xrayUuid,
      certPin,
      insecure: selfSigned,
      uri,
    };
  }

  /** Прямой через VLESS + XTLS-Vision + Reality (TCP). */
  private buildRealityVariant(node: Node, device: Device): ConnectionVariant | null {
    const publicKey = node.directPublicKey;
    if (!publicKey) return null;
    const sni = node.directSni || 'www.microsoft.com';
    const shortId = node.directShortId || '';
    const uri =
      `vless://${device.xrayUuid}@${node.directHost}:${node.directPort}` +
      `?encryption=none&security=reality&sni=${encodeURIComponent(sni)}` +
      `&fp=${REALITY_FP}&pbk=${encodeURIComponent(publicKey)}` +
      (shortId ? `&sid=${encodeURIComponent(shortId)}` : '') +
      `&type=tcp&flow=${REALITY_FLOW}` +
      `#${encodeURIComponent(node.name + ' • Direct')}`;

    return {
      mode: 'direct',
      protocol: 'vless',
      uuid: device.xrayUuid,
      address: node.directHost!,
      port: node.directPort,
      encryption: 'none',
      security: 'reality',
      sni,
      network: 'tcp',
      wsPath: '',
      wsHost: '',
      flow: REALITY_FLOW,
      publicKey,
      shortId,
      fingerprint: REALITY_FP,
      auth: '',
      certPin: '',
      insecure: false,
      uri,
    };
  }

  private emailFor(device: Device): string {
    // Уникальная метка клиента в Xray (для статистики/идентификации).
    return `${device.userId}.${device.id}@vpncdn`;
  }
}
