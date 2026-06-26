import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Постоянный код входа в приложение (один на пользователя). Выдаётся ботом,
 * обменивается клиентом на JWT через POST /auth/code. Не одноразовый и без TTL —
 * привязан к аккаунту; меняется кнопкой «сменить код» в боте (regenerate).
 * Поля expiresAt/usedAt вестигиальны (nullable, не используются).
 */
@Entity('login_codes')
export class LoginCode {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 12 })
  code: string;

  @Index({ unique: true })
  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  usedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
