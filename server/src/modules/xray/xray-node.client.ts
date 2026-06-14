import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { Node } from '../nodes/entities/node.entity';

/**
 * Клиент управляющего агента Xray на узле.
 * Агент (см. xray/agent) предоставляет HTTP API для динамического
 * добавления/удаления VLESS-клиентов в работающий Xray без рестарта.
 *
 * Если у узла не настроен apiUrl (dev-режим), операции логируются и
 * пропускаются — система остаётся работоспособной для разработки.
 */
@Injectable()
export class XrayNodeClient {
  private readonly logger = new Logger(XrayNodeClient.name);

  async addClient(node: Node, uuid: string, email: string): Promise<void> {
    if (!node.apiUrl) {
      this.logger.warn(`Узел ${node.name}: apiUrl не задан — addClient(${email}) пропущен`);
      return;
    }
    try {
      await axios.post(
        `${node.apiUrl.replace(/\/$/, '')}/clients`,
        { uuid, email },
        { headers: this.authHeader(node), timeout: 10000 },
      );
      this.logger.log(`Узел ${node.name}: клиент ${email} добавлен`);
    } catch (e) {
      this.logger.error(`Узел ${node.name}: ошибка addClient — ${this.msg(e)}`);
      throw e;
    }
  }

  async removeClient(node: Node, uuid: string, email: string): Promise<void> {
    if (!node.apiUrl) {
      this.logger.warn(`Узел ${node.name}: apiUrl не задан — removeClient(${email}) пропущен`);
      return;
    }
    try {
      await axios.delete(`${node.apiUrl.replace(/\/$/, '')}/clients/${uuid}`, {
        headers: this.authHeader(node),
        timeout: 10000,
      });
      this.logger.log(`Узел ${node.name}: клиент ${email} удалён`);
    } catch (e) {
      // Удаление идемпотентно — ошибку не пробрасываем, чтобы не блокировать БД.
      this.logger.error(`Узел ${node.name}: ошибка removeClient — ${this.msg(e)}`);
    }
  }

  /** Трафик по пользователям с узла (дельта с прошлого опроса). */
  async getStats(node: Node): Promise<Array<{ email: string; uplink: number; downlink: number }>> {
    if (!node.apiUrl) return [];
    const { data } = await axios.get(`${node.apiUrl.replace(/\/$/, '')}/stats`, {
      headers: this.authHeader(node),
      timeout: 10000,
    });
    return Array.isArray(data) ? data : [];
  }

  /** Метрики нагрузки узла (CPU/RAM, %). */
  async getMetrics(node: Node): Promise<{ cpuPercent: number; memPercent: number } | null> {
    if (!node.apiUrl) return null;
    const { data } = await axios.get(`${node.apiUrl.replace(/\/$/, '')}/metrics`, {
      headers: this.authHeader(node),
      timeout: 10000,
    });
    return data ?? null;
  }

  private authHeader(node: Node): Record<string, string> {
    return node.apiSecret ? { Authorization: `Bearer ${node.apiSecret}` } : {};
  }

  private msg(e: unknown): string {
    return axios.isAxiosError(e) ? JSON.stringify(e.response?.data ?? e.message) : String(e);
  }
}
