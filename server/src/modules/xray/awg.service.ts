import { Injectable } from '@nestjs/common';
import { Node } from '../nodes/entities/node.entity';
import { AwgClient } from './awg.client';

export interface AwgConfig {
  /** Публичный ключ выданного пира (сохранить на устройстве для снятия). */
  publicKey: string;
  /** Полный текст .conf для AmneziaWG / AmneziaVPN. */
  confText: string;
}

/** Прямой режим через AmneziaWG 2.0: провижининг пира + сборка .conf. */
@Injectable()
export class AwgService {
  constructor(private readonly client: AwgClient) {}

  get enabled(): (node: Node) => boolean {
    return (node) => node.directProtocol === 'awg' && !!node.directApiUrl && !!node.directHost;
  }

  /** Выдаёт нового пира (ключи генерит сервер) и собирает .conf для внешних клиентов. */
  async buildConfig(node: Node): Promise<AwgConfig> {
    const c = await this.client.addPeer(node); // без publicKey → privateKey в ответе
    const p = c.params;
    const endpoint = `${node.directHost}:${c.listenPort}`;
    const confText = [
      '[Interface]',
      `PrivateKey = ${c.privateKey}`,
      `Address = ${c.address}/32`,
      'DNS = 1.1.1.1',
      `MTU = ${c.mtu}`,
      `Jc = ${p.jc}`,
      `Jmin = ${p.jmin}`,
      `Jmax = ${p.jmax}`,
      `S1 = ${p.s1}`,
      `S2 = ${p.s2}`,
      `S3 = ${p.s3}`,
      `S4 = ${p.s4}`,
      `H1 = ${p.h1}`,
      `H2 = ${p.h2}`,
      `H3 = ${p.h3}`,
      `H4 = ${p.h4}`,
      `I1 = ${p.i1}`,
      '',
      '[Peer]',
      `PublicKey = ${c.serverPublicKey}`,
      'AllowedIPs = 0.0.0.0/0, ::/0',
      `Endpoint = ${endpoint}`,
      'PersistentKeepalive = 25',
      '',
    ].join('\n');
    return { publicKey: c.publicKey, confText };
  }

  removePeer(node: Node, publicKey: string): Promise<void> {
    return this.client.removePeer(node, publicKey);
  }
}
