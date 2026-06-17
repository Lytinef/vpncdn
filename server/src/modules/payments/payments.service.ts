import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Repository } from 'typeorm';
import { PAYMENT_SUCCEEDED, PaymentSucceededEvent } from '../../common/events';
import { Payment, PaymentPurpose, PaymentStatus } from './entities/payment.entity';
import { PlanCode } from '../subscriptions/entities/plan.entity';
import { SubscriptionStatus } from '../subscriptions/entities/subscription.entity';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { YookassaClient, YkPayment } from './yookassa.client';
import { PaymentMethodsService } from './payment-methods.service';
import { kopecksToRubles } from '../../common/money';

const STATUS_MAP: Record<YkPayment['status'], PaymentStatus> = {
  pending: PaymentStatus.PENDING,
  waiting_for_capture: PaymentStatus.WAITING_FOR_CAPTURE,
  succeeded: PaymentStatus.SUCCEEDED,
  canceled: PaymentStatus.CANCELED,
};

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectRepository(Payment)
    private readonly payments: Repository<Payment>,
    private readonly yookassa: YookassaClient,
    private readonly methods: PaymentMethodsService,
    private readonly subscriptions: SubscriptionsService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Старт покупки подписки: создаём pending-подписку и первичный платёж
   * с сохранением карты. Возвращаем confirmation_url для оплаты.
   */
  async createCheckout(userId: string, planCode: PlanCode, returnUrl?: string) {
    const sub = await this.subscriptions.createPending(userId, planCode);
    const plan = sub.plan;

    const payment = this.payments.create({
      userId,
      subscriptionId: sub.id,
      amountKopecks: plan.priceKopecks,
      status: PaymentStatus.PENDING,
      purpose: PaymentPurpose.INITIAL,
      isRecurring: false,
      description: `Подписка «${plan.name}» — ${kopecksToRubles(plan.priceKopecks)} ₽`,
    });
    await this.payments.save(payment);

    const yk = await this.yookassa.createInitialPayment({
      amountKopecks: plan.priceKopecks,
      description: payment.description!,
      metadata: { paymentId: payment.id, userId, subscriptionId: sub.id },
      returnUrl,
    });

    payment.yookassaPaymentId = yk.id;
    payment.status = STATUS_MAP[yk.status];
    payment.confirmationUrl = yk.confirmation?.confirmation_url ?? null;
    payment.raw = yk as unknown as Record<string, unknown>;
    await this.payments.save(payment);

    return {
      paymentId: payment.id,
      confirmationUrl: payment.confirmationUrl,
      amountRub: kopecksToRubles(plan.priceKopecks),
    };
  }

  /**
   * Рекуррентное продление подписки по сохранённой карте.
   * Вызывается воркером очереди.
   */
  async chargeRenewal(subscriptionId: string): Promise<void> {
    const sub = await this.subscriptions.getById(subscriptionId);
    if (!sub) return;
    if (!sub.autoRenew) {
      this.logger.log(`Подписка ${subscriptionId}: автопродление выключено — пропуск`);
      return;
    }

    // План на новый период (с учётом запланированной смены тарифа).
    const plan = sub.nextPlan ?? sub.plan;
    const method = await this.methods.getDefault(sub.userId);
    if (!method) {
      this.logger.warn(`Подписка ${subscriptionId}: нет сохранённой карты — past_due`);
      await this.subscriptions.markPastDue(subscriptionId);
      return;
    }

    const payment = this.payments.create({
      userId: sub.userId,
      subscriptionId: sub.id,
      paymentMethodId: method.id,
      amountKopecks: plan.priceKopecks,
      status: PaymentStatus.PENDING,
      purpose: PaymentPurpose.RENEWAL,
      isRecurring: true,
      description: `Продление подписки «${plan.name}»`,
    });
    await this.payments.save(payment);

    let yk: YkPayment;
    try {
      yk = await this.yookassa.createRecurringPayment({
        amountKopecks: plan.priceKopecks,
        paymentMethodId: method.yookassaPaymentMethodId,
        description: payment.description!,
        metadata: { paymentId: payment.id, userId: sub.userId, subscriptionId: sub.id },
      });
    } catch (e) {
      this.logger.error(`Рекуррент по ${subscriptionId} не прошёл: ${String(e)}`);
      payment.status = PaymentStatus.FAILED;
      await this.payments.save(payment);
      await this.subscriptions.markPastDue(subscriptionId);
      return;
    }

    payment.yookassaPaymentId = yk.id;
    payment.raw = yk as unknown as Record<string, unknown>;
    await this.payments.save(payment);

    // Если YooKassa сразу подтвердила — финализируем; иначе ждём вебхук.
    await this.applyYkStatus(payment, yk);
  }

  /** Обработка вебхука YooKassa: статус берём из API (доверяем не телу, а API). */
  async handleWebhook(body: any): Promise<void> {
    const ykId: string | undefined = body?.object?.id;
    if (!ykId) {
      this.logger.warn('Вебхук без object.id — игнор');
      return;
    }
    // Перепроверяем статус прямым запросом к API.
    const yk = await this.yookassa.getPayment(ykId);
    const payment = await this.findByYkId(ykId, yk.metadata?.paymentId);
    if (!payment) {
      this.logger.warn(`Вебхук: платёж ${ykId} не найден в БД`);
      return;
    }
    await this.applyYkStatus(payment, yk);
  }

  /** Применяет статус YooKassa к платежу и подписке (идемпотентно). */
  private async applyYkStatus(payment: Payment, yk: YkPayment): Promise<void> {
    const newStatus = STATUS_MAP[yk.status];
    const wasSucceeded = payment.status === PaymentStatus.SUCCEEDED;
    payment.status = newStatus;
    payment.raw = yk as unknown as Record<string, unknown>;
    if (yk.captured_at) payment.capturedAt = new Date(yk.captured_at);
    await this.payments.save(payment);

    if (yk.status === 'succeeded' && !wasSucceeded) {
      await this.onPaymentSucceeded(payment, yk);
    } else if (yk.status === 'canceled') {
      await this.onPaymentFailed(payment);
    }
  }

  private async onPaymentSucceeded(payment: Payment, yk: YkPayment): Promise<void> {
    // Сохраняем способ оплаты для будущих автосписаний.
    if (yk.payment_method?.saved) {
      const method = await this.methods.saveFromYookassa(payment.userId, yk.payment_method);
      if (method) {
        payment.paymentMethodId = method.id;
        await this.payments.save(payment);
      }
    }

    if (!payment.subscriptionId) return;
    if (payment.purpose === PaymentPurpose.INITIAL) {
      await this.subscriptions.activateInitial(payment.subscriptionId);
      this.logger.log(`Платёж ${payment.id}: подписка активирована`);
    } else if (payment.purpose === PaymentPurpose.RENEWAL) {
      await this.subscriptions.renewAfterPayment(payment.subscriptionId);
      this.logger.log(`Платёж ${payment.id}: подписка продлена`);
    }

    // Уведомляем подписчиков (Telegram-бот шлёт пользователю подтверждение).
    this.events.emit(PAYMENT_SUCCEEDED, {
      userId: payment.userId,
      subscriptionId: payment.subscriptionId,
      purpose: payment.purpose,
    } satisfies PaymentSucceededEvent);
  }

  private async onPaymentFailed(payment: Payment): Promise<void> {
    if (payment.purpose === PaymentPurpose.RENEWAL && payment.subscriptionId) {
      await this.subscriptions.markPastDue(payment.subscriptionId);
    }
  }

  private findByYkId(ykId: string, paymentId?: string): Promise<Payment | null> {
    if (paymentId) {
      return this.payments.findOne({ where: { id: paymentId } });
    }
    return this.payments.findOne({ where: { yookassaPaymentId: ykId } });
  }

  /** История платежей пользователя. */
  async listForUser(userId: string) {
    const items = await this.payments.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 100,
    });
    return items.map((p) => ({
      id: p.id,
      amountRub: kopecksToRubles(p.amountKopecks),
      status: p.status,
      purpose: p.purpose,
      description: p.description,
      createdAt: p.createdAt,
    }));
  }

  /** Синхронизация статуса платежа по запросу клиента (после возврата с оплаты). */
  async syncPayment(userId: string, paymentId: string) {
    const payment = await this.payments.findOne({ where: { id: paymentId, userId } });
    if (!payment) throw new BadRequestException('Платёж не найден');
    if (payment.yookassaPaymentId && payment.status !== PaymentStatus.SUCCEEDED) {
      const yk = await this.yookassa.getPayment(payment.yookassaPaymentId);
      await this.applyYkStatus(payment, yk);
    }
    const sub = await this.subscriptions.getById(payment.subscriptionId ?? '');
    return {
      status: payment.status,
      subscriptionStatus: sub?.status ?? SubscriptionStatus.PENDING,
    };
  }
}
