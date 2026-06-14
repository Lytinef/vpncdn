import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Subscription } from '../../subscriptions/entities/subscription.entity';
import { PaymentMethod } from './payment-method.entity';

export enum PaymentStatus {
  PENDING = 'pending',
  WAITING_FOR_CAPTURE = 'waiting_for_capture',
  SUCCEEDED = 'succeeded',
  CANCELED = 'canceled',
  FAILED = 'failed',
}

export enum PaymentPurpose {
  /** Первичная покупка подписки. */
  INITIAL = 'initial',
  /** Автопродление (рекуррент). */
  RENEWAL = 'renewal',
  /** Смена тарифа (доплата/новый период). */
  PLAN_CHANGE = 'plan_change',
}

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @ManyToOne(() => User, (u) => u.payments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: string;

  @ManyToOne(() => Subscription, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'subscriptionId' })
  subscription: Subscription | null;

  @Column({ nullable: true })
  subscriptionId: string | null;

  @ManyToOne(() => PaymentMethod, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'paymentMethodId' })
  paymentMethod: PaymentMethod | null;

  @Column({ nullable: true })
  paymentMethodId: string | null;

  /** id платежа в YooKassa. */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 128, nullable: true })
  yookassaPaymentId: string | null;

  /** Сумма в копейках. */
  @Column({ type: 'int' })
  amountKopecks: number;

  @Column({ type: 'varchar', length: 3, default: 'RUB' })
  currency: string;

  @Index()
  @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.PENDING })
  status: PaymentStatus;

  @Column({ type: 'enum', enum: PaymentPurpose, default: PaymentPurpose.INITIAL })
  purpose: PaymentPurpose;

  /** Рекуррентное (автоматическое) списание без участия пользователя. */
  @Column({ type: 'boolean', default: false })
  isRecurring: boolean;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** URL подтверждения для редиректа пользователя (confirmation_url). */
  @Column({ type: 'text', nullable: true })
  confirmationUrl: string | null;

  /** Сырой payload последнего обновления от YooKassa (для аудита). */
  @Column({ type: 'jsonb', nullable: true })
  raw: Record<string, unknown> | null;

  @Column({ type: 'timestamptz', nullable: true })
  capturedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
