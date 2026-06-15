import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { TelegramConfig, AlertsConfig } from '../../config/configuration';
import { Node } from '../nodes/entities/node.entity';

interface NodeAlertState {
  cpuHigh: boolean;
  memHigh: boolean;
  down: boolean;
  downStreak: number;
}

/**
 * Алёрты по нагрузке узлов в Telegram. Без спама: сообщение только при смене
 * состояния (пересечение порога), с гистерезисом на возврат в норму.
 */
@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);
  private readonly state = new Map<string, NodeAlertState>();
  private readonly tg: TelegramConfig;
  private readonly cfg: AlertsConfig;
  /** Сколько подряд неудачных опросов до алёрта «узел недоступен». */
  private readonly downStreakLimit = 3;

  constructor(config: ConfigService) {
    this.tg = config.get<TelegramConfig>('telegram')!;
    this.cfg = config.get<AlertsConfig>('alerts')!;
  }

  private getState(nodeId: string): NodeAlertState {
    let s = this.state.get(nodeId);
    if (!s) {
      s = { cpuHigh: false, memHigh: false, down: false, downStreak: 0 };
      this.state.set(nodeId, s);
    }
    return s;
  }

  async sendTelegram(text: string): Promise<void> {
    if (!this.tg.botToken || !this.cfg.telegramChatId) return; // алёрты выключены
    try {
      await axios.post(
        `https://api.telegram.org/bot${this.tg.botToken}/sendMessage`,
        { chat_id: this.cfg.telegramChatId, text, parse_mode: 'HTML' },
        { timeout: 10000 },
      );
    } catch (e) {
      this.logger.warn(`Telegram-алёрт не отправлен: ${String(e)}`);
    }
  }

  /** metrics=null → узел недоступен. */
  async evaluate(
    node: Node,
    metrics: { cpuPercent: number; memPercent: number } | null,
  ): Promise<void> {
    const s = this.getState(node.id);

    if (!metrics) {
      s.downStreak++;
      if (s.downStreak >= this.downStreakLimit && !s.down) {
        s.down = true;
        await this.sendTelegram(`🔴 Узел <b>${node.name}</b> недоступен (агент не отвечает).`);
      }
      return;
    }

    if (s.down) {
      s.down = false;
      await this.sendTelegram(`🟢 Узел <b>${node.name}</b> снова доступен.`);
    }
    s.downStreak = 0;

    await this.checkMetric(node, 'CPU', metrics.cpuPercent, this.cfg.cpuPercent, s, 'cpuHigh');
    await this.checkMetric(node, 'RAM', metrics.memPercent, this.cfg.memPercent, s, 'memHigh');
  }

  private async checkMetric(
    node: Node,
    label: string,
    value: number,
    threshold: number,
    s: NodeAlertState,
    key: 'cpuHigh' | 'memHigh',
  ): Promise<void> {
    const clear = threshold - 10; // гистерезис, чтобы не «дребезжало» у порога
    if (value >= threshold && !s[key]) {
      s[key] = true;
      await this.sendTelegram(
        `⚠️ Узел <b>${node.name}</b>: ${label} <b>${value}%</b> (порог ${threshold}%). ` +
          `Возможно, пора усиливать сервер или добавить узел.`,
      );
    } else if (value < clear && s[key]) {
      s[key] = false;
      await this.sendTelegram(`✅ Узел <b>${node.name}</b>: ${label} в норме (${value}%).`);
    }
  }
}
