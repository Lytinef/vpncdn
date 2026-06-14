import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum BypassType {
  /** Android-приложение по package name (com.example.app). */
  APP = 'app',
  /** Домен/сайт (sberbank.ru). */
  DOMAIN = 'domain',
}

/**
 * Запись списка обхода VPN: приложения и сайты (как правило РФ — банки,
 * госуслуги, стриминги), которые блокируют доступ через VPN.
 * При включённом обходе их трафик идёт мимо туннеля.
 * Список редактируется в админке и отдаётся клиенту.
 */
@Entity('bypass_entries')
@Index(['type', 'value'], { unique: true })
export class BypassEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: BypassType })
  type: BypassType;

  /** package name для app или домен для domain. */
  @Column({ type: 'varchar', length: 255 })
  value: string;

  @Column({ type: 'varchar', length: 128 })
  title: string;

  /** Категория для группировки в UI (bank, gov, streaming, ...). */
  @Column({ type: 'varchar', length: 64, nullable: true })
  category: string | null;

  @Index()
  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
