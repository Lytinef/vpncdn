import { PaymentPurpose } from '../modules/payments/entities/payment.entity';

/**
 * Доменные события (через @nestjs/event-emitter). Используются для развязки
 * модулей: например, платежи не знают про Telegram-бот, а просто публикуют факт
 * успешной оплаты — бот подписывается и уведомляет пользователя.
 */

export const PAYMENT_SUCCEEDED = 'payment.succeeded';

export interface PaymentSucceededEvent {
  userId: string;
  subscriptionId: string | null;
  purpose: PaymentPurpose;
}
