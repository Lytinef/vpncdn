import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Одноразовый код входа в приложение. Выдаётся ботом, обменивается клиентом на
 * JWT через POST /auth/code. Короткий TTL, единоразовое использование.
 */
@Entity('login_codes')
export class LoginCode {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 12 })
  code: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  usedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
