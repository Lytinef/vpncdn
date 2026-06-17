import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum AppPlatform {
  ANDROID = 'android',
  IOS = 'ios',
  WINDOWS = 'windows',
}

/**
 * Актуальная версия клиента по платформам. Управляется из админ-панели,
 * читается клиентом при старте для показа баннера «доступна новая версия».
 * Сравнение — по числовому build (versionCode) для надёжности.
 */
@Entity('app_versions')
export class AppVersion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'enum', enum: AppPlatform })
  platform: AppPlatform;

  /** Версия для показа, напр. "1.2.0". */
  @Column({ type: 'varchar', length: 32 })
  latestVersion: string;

  /** Числовой build/versionCode — основа сравнения. */
  @Column({ type: 'int', default: 1 })
  latestBuild: number;

  /** Минимальный поддерживаемый build; ниже — обязательное обновление. 0 — не принуждать. */
  @Column({ type: 'int', default: 0 })
  minBuild: number;

  /** Ссылка на обновление (TG-канал/стор/APK). */
  @Column({ type: 'text', nullable: true })
  updateUrl: string | null;

  /** Что нового. */
  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
