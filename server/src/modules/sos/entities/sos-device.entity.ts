import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * SOS-доступ: экстренное CDN-подключение без авторизации, по hardwareId
 * устройства, с жёстким лимитом трафика (100 МБ суммарно за всё время).
 * Нужно, чтобы пользователь без интернета мог достучаться до бота/оплаты.
 */
@Entity('sos_devices')
export class SosDevice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Стабильный идентификатор устройства от клиента. */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 128 })
  hardwareId: string;

  /** Узел, на котором провижинится SOS-клиент. */
  @Column({ type: 'uuid', nullable: true })
  nodeId: string | null;

  /** VLESS UUID SOS-клиента на узле. */
  @Column({ type: 'uuid' })
  xrayUuid: string;

  /** Накопленный трафик (uplink+downlink) в байтах. */
  @Column({ type: 'bigint', default: 0 })
  usedBytes: string;

  /** Лимит исчерпан — доступ снят, повторно не выдаём. */
  @Index()
  @Column({ type: 'boolean', default: false })
  blocked: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  lastSeenAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
