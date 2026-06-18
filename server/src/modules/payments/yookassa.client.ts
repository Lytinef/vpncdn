import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { YookassaConfig } from '../../config/configuration';
import { toYookassaAmount } from '../../common/money';

export interface YkAmount {
  value: string;
  currency: string;
}

export interface YkPaymentMethod {
  type: string;
  id: string;
  saved: boolean;
  title?: string;
  card?: { last4?: string; card_type?: string };
}

export interface YkPayment {
  id: string;
  status: 'pending' | 'waiting_for_capture' | 'succeeded' | 'canceled';
  paid: boolean;
  amount: YkAmount;
  confirmation?: { type: string; confirmation_url?: string };
  payment_method?: YkPaymentMethod;
  metadata?: Record<string, string>;
  captured_at?: string;
  cancellation_details?: { party: string; reason: string };
}

/** Низкоуровневый клиент YooKassa API. */
@Injectable()
export class YookassaClient {
  private readonly logger = new Logger(YookassaClient.name);
  private readonly http: AxiosInstance;
  private readonly cfg: YookassaConfig;

  constructor(config: ConfigService) {
    this.cfg = config.get<YookassaConfig>('yookassa')!;
    this.http = axios.create({
      baseURL: 'https://api.yookassa.ru/v3',
      auth: { username: this.cfg.shopId, password: this.cfg.secretKey },
      timeout: 20000,
    });
  }

  /**
   * Первичный платёж с сохранением способа оплаты (для будущих автосписаний).
   * Возвращает confirmation_url для редиректа пользователя.
   */
  async createInitialPayment(params: {
    amountKopecks: number;
    description: string;
    metadata: Record<string, string>;
    returnUrl?: string;
    receiptEmail?: string;
  }): Promise<YkPayment> {
    return this.request({
      amount: toYookassaAmount(params.amountKopecks),
      capture: true,
      save_payment_method: true,
      confirmation: {
        type: 'redirect',
        return_url: params.returnUrl ?? this.cfg.returnUrl,
      },
      description: params.description,
      metadata: params.metadata,
    });
  }

  /** Рекуррентный платёж по сохранённому способу (без участия пользователя). */
  async createRecurringPayment(params: {
    amountKopecks: number;
    paymentMethodId: string;
    description: string;
    metadata: Record<string, string>;
  }): Promise<YkPayment> {
    return this.request({
      amount: toYookassaAmount(params.amountKopecks),
      capture: true,
      payment_method_id: params.paymentMethodId,
      description: params.description,
      metadata: params.metadata,
    });
  }

  async getPayment(id: string): Promise<YkPayment> {
    try {
      const { data } = await this.http.get<YkPayment>(`/payments/${id}`);
      return data;
    } catch (e) {
      this.logger.error(`Ошибка получения платежа ${id}: ${this.errMsg(e)}`);
      throw new ServiceUnavailableException('YooKassa недоступна');
    }
  }

  /** Полный/частичный возврат платежа (для бесплатной привязки карты). */
  async refund(paymentId: string, amountKopecks: number): Promise<void> {
    try {
      await this.http.post(
        '/refunds',
        { payment_id: paymentId, amount: toYookassaAmount(amountKopecks) },
        { headers: { 'Idempotence-Key': uuidv4() } },
      );
    } catch (e) {
      this.logger.error(`Ошибка возврата по платежу ${paymentId}: ${this.errMsg(e)}`);
      throw new ServiceUnavailableException('Не удалось вернуть платёж');
    }
  }

  private async request(body: Record<string, unknown>): Promise<YkPayment> {
    try {
      const { data } = await this.http.post<YkPayment>('/payments', body, {
        headers: { 'Idempotence-Key': uuidv4() },
      });
      return data;
    } catch (e) {
      this.logger.error(`Ошибка создания платежа: ${this.errMsg(e)}`);
      throw new ServiceUnavailableException('Не удалось создать платёж в YooKassa');
    }
  }

  private errMsg(e: unknown): string {
    if (axios.isAxiosError(e)) {
      return JSON.stringify(e.response?.data ?? e.message);
    }
    return String(e);
  }
}
