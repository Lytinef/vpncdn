import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Реестр всех, кто КОГДА-ЛИБО получал пробный период, по Telegram-id. Переживает
 * удаление аккаунта (нет FK на users), поэтому триал выдаётся один раз на
 * Telegram-аккаунт навсегда — защита от «удалил аккаунт → создал заново → новый
 * триал». В админ-панели не отображается.
 */
@Entity('trial_ledger')
export class TrialLedger {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'bigint' })
  telegramId: string;

  @CreateDateColumn()
  createdAt: Date;
}
