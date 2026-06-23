import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { Node } from '../nodes/entities/node.entity';

export interface AwgPeerConfig {
  address: string;
  publicKey: string;
  serverPublicKey: string;
  listenPort: number;
  mtu: number;
  params: Record<string, string | number>;
  /** Приватный ключ — только когда пара сгенерирована на сервере (бот/внешние). */
  privateKey?: string;
}

/**
 * Клиент API провижининга AmneziaWG-пиров (см. awg/api.js).
 * node.directApiUrl — адрес сервиса (напр. http://awg:8091), авторизация —
 * тем же секретом, что и агент узла (node.apiSecret).
 */
@Injectable()
export class AwgClient {
  private readonly logger = new Logger(AwgClient.name);

  private base(node: Node): string {
    return (node.directApiUrl || '').replace(/\/$/, '');
  }
  private auth(node: Node) {
    return { Authorization: `Bearer ${node.apiSecret ?? ''}` };
  }

  /** Добавляет пира. publicKey не задан → сервер сгенерит пару и вернёт privateKey. */
  async addPeer(node: Node, publicKey?: string): Promise<AwgPeerConfig> {
    const { data } = await axios.post(
      `${this.base(node)}/awg/peers`,
      publicKey ? { publicKey } : {},
      { headers: this.auth(node), timeout: 10000 },
    );
    return data as AwgPeerConfig;
  }

  async removePeer(node: Node, publicKey: string): Promise<void> {
    if (!node.directApiUrl || !publicKey) return;
    try {
      await axios.delete(`${this.base(node)}/awg/peers/${encodeURIComponent(publicKey)}`, {
        headers: this.auth(node),
        timeout: 10000,
      });
    } catch (e) {
      this.logger.warn(`awg removePeer ${publicKey}: ${(e as Error).message}`);
    }
  }
}
