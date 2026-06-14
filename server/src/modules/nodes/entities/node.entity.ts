import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Device } from '../../devices/entities/device.entity';

/**
 * VPN-узел = origin-сервер с Xray (VLESS+WS+TLS) за NGENIX CDN.
 * Клиент подключается на cdnDomain (домен в CDN), CDN проксирует на origin.
 */
@Entity('nodes')
export class Node {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 64 })
  name: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  region: string | null;

  /** Реальный адрес origin-сервера (для управления Xray, не для клиента). */
  @Column({ type: 'varchar', length: 255 })
  originHost: string;

  /** Домен в NGENIX, на который коннектится клиент. */
  @Index()
  @Column({ type: 'varchar', length: 255 })
  cdnDomain: string;

  /** SNI для TLS (обычно = cdnDomain). */
  @Column({ type: 'varchar', length: 255 })
  sni: string;

  /** Порт подключения через CDN (как правило 443). */
  @Column({ type: 'int', default: 443 })
  port: number;

  /** WebSocket path, согласованный с конфигом Xray и правилами NGENIX. */
  @Column({ type: 'varchar', length: 128, default: '/ws' })
  wsPath: string;

  /** URL API управления Xray на узле (добавление/удаление пользователей). */
  @Column({ type: 'varchar', length: 255, nullable: true })
  apiUrl: string | null;

  /** Секрет для API управления узлом. */
  @Column({ type: 'varchar', length: 255, nullable: true })
  apiSecret: string | null;

  /** Максимум активных устройств на узле. */
  @Column({ type: 'int', default: 1000 })
  capacity: number;

  @Index()
  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @OneToMany(() => Device, (d) => d.node)
  devices: Device[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
