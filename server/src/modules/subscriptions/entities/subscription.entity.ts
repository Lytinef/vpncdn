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
import { Plan } from './plan.entity';

export enum SubscriptionStatus {
  /** Создана, ждёт первого успешного платежа. */
  PENDING = 'pending',
  /** Активна, доступ есть. */
  ACTIVE = 'active',
  /** Продление не прошло — grace-период до отключения. */
  PAST_DUE = 'past_due',
  /** Отменена пользователем — активна до конца периода, дальше не продлевается. */
  CANCELED = 'canceled',
  /** Период закончился, доступа нет. */
  EXPIRED = 'expired',
}

/**
 * Подписка пользователя.
 *  - Отмена: cancelAtPeriodEnd=true, autoRenew=false → доступ до currentPeriodEnd.
 *  - Смена тарифа со следующего периода: nextPlan заполняется, применяется при продлении.
 *  - Автосписание: autoRenew=true + сохранённый PaymentMethod.
 */
@Entity('subscriptions')
export class Subscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @ManyToOne(() => User, (u) => u.subscriptions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: string;

  @ManyToOne(() => Plan, { eager: true })
  @JoinColumn({ name: 'planId' })
  plan: Plan;

  @Column()
  planId: string;

  /** Тариф, на который перейти со следующего периода (смена тарифа). */
  @ManyToOne(() => Plan, { eager: true, nullable: true })
  @JoinColumn({ name: 'nextPlanId' })
  nextPlan: Plan | null;

  @Column({ nullable: true })
  nextPlanId: string | null;

  @Index()
  @Column({ type: 'enum', enum: SubscriptionStatus, default: SubscriptionStatus.PENDING })
  status: SubscriptionStatus;

  @Column({ type: 'timestamptz', nullable: true })
  currentPeriodStart: Date | null;

  @Index()
  @Column({ type: 'timestamptz', nullable: true })
  currentPeriodEnd: Date | null;

  /** Включено автопродление (рекуррентное списание). */
  @Column({ type: 'boolean', default: true })
  autoRenew: boolean;

  /** Помечена на отмену в конце периода. */
  @Column({ type: 'boolean', default: false })
  cancelAtPeriodEnd: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  canceledAt: Date | null;

  /** Сколько раз подряд не прошло продление (для grace-логики). */
  @Column({ type: 'int', default: 0 })
  failedRenewals: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
