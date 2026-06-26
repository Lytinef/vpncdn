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
  /** Узел предлагает прямой режим AmneziaWG (нативный) — клиент покажет тумблер
   *  и пойдёт по awg-потоку (POST /devices/:id/awg). */
  directAwg: boolean;
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

  /** Провижининг клиента по uuid+email напрямую (SOS-режим, без сущности Device). */
  provisionRaw(node: Node, uuid: string, email: string): Promise<void> {
    return this.nodeClient.addClient(node, uuid, email);
  }

  deprovisionRaw(node: Node, uuid: string, email: string): Promise<void> {
    return this.nodeClient.removeClient(node, uuid, email);
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
      directAwg:
        node.directProtocol === 'awg' && !!node.directApiUrl && !!node.directHost,
    };
  }

  /**
   * CDN-вариант для произвольного uuid (переиспользуется обычными устройствами и
   * SOS-режимом). Провижининг клиента на узле — отдельно у вызывающего.
   */
  buildCdnConnection(node: Node, xrayUuid: string, label = 'CDN'): ConnectionVariant {
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
      `vless://${xrayUuid}@${node.cdnDomain}:${node.port}` +
      `?encryption=none&security=tls&sni=${encodeURIComponent(node.sni)}` +
      `&type=xhttp&host=${encodeURIComponent(node.cdnDomain)}` +
      `&path=${encodeURIComponent(node.wsPath)}&mode=auto&extra=${xmuxExtra}` +
      `#${encodeURIComponent(node.name + ' • ' + label)}`;
    return {
      mode: 'cdn',
      protocol: 'vless',
      uuid: xrayUuid,
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

  /** CDN-вариант: VLESS + XHTTP + TLS через NGENIX. */
  private buildCdnVariant(node: Node, device: Device): ConnectionVariant {
    return this.buildCdnConnection(node, device.xrayUuid, 'CDN');
  }

  /**
   * Прямой вариант для нативного приложения. Сейчас прямой режим — AmneziaWG,
   * и его конфиг провижинится отдельно (devices.getAwgConfig / бот, а для
   * нативного клиента — по pubkey устройства). В синхронном buildConnection
   * awg не собираем → direct=null; тумблер «Напрямую» в приложении использует
   * awg через отдельный поток.
   */
  private buildDirectVariant(_node: Node, _device: Device): ConnectionVariant | null {
    return null;
  }

  private emailFor(device: Device): string {
    // Уникальная метка клиента в Xray (для статистики/идентификации).
    return `${device.userId}.${device.id}@vpncdn`;
  }
}
