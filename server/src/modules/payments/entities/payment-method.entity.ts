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

/**
 * Сохранённый способ оплаты YooKassa для автосписаний.
 * Появляется после первого платежа с save_payment_method=true.
 */
@Entity('payment_methods')
export class PaymentMethod {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @ManyToOne(() => User, (u) => u.paymentMethods, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: string;

  /** payment_method.id из YooKassa — используется для рекуррента. */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 128 })
  yookassaPaymentMethodId: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  title: string | null;

  @Column({ type: 'varchar', length: 4, nullable: true })
  cardLast4: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  cardType: string | null;

  @Column({ type: 'boolean', default: true })
  isDefault: boolean;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
