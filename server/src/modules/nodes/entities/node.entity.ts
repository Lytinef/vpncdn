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

  // ── Прямой режим (мимо CDN) ──
  // directProtocol='hysteria2' (UDP/QUIC, устойчив к потерям) или 'reality'
  // (VLESS+Vision+Reality, TCP). Если directHost задан — клиент получает второй
  // конфиг для прямого подключения (ниже пинг, но IP блокируем). Иначе — только CDN.

  /** Протокол прямого режима: 'hysteria2' | 'reality'. */
  @Column({ type: 'varchar', length: 16, default: 'hysteria2' })
  directProtocol: string;

  /** Адрес origin для прямого подключения клиента (IP или домен). */
  @Column({ type: 'varchar', length: 255, nullable: true })
  directHost: string | null;

  /** Порт прямого режима (Reality-инбаунд). */
  @Column({ type: 'int', default: 2053 })
  directPort: number;

  /** Публичный ключ Reality (pbk в ссылке). */
  @Column({ type: 'varchar', length: 255, nullable: true })
  directPublicKey: string | null;

  /** shortId Reality (sid в ссылке). */
  @Column({ type: 'varchar', length: 64, nullable: true })
  directShortId: string | null;

  /** SNI/serverName прямого режима (домен маскировки Reality/TLS). */
  @Column({ type: 'varchar', length: 255, nullable: true })
  directSni: string | null;

  /** pinSHA256 сертификата для Hysteria2 (self-signed, защита от MITM). */
  @Column({ type: 'varchar', length: 128, nullable: true })
  directCertPin: string | null;

  /** URL API провижининга AmneziaWG-пиров (directProtocol='awg'), напр. http://awg:8091. */
  @Column({ type: 'varchar', length: 255, nullable: true })
  directApiUrl: string | null;

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

  /** Последние метрики нагрузки узла (обновляются поллером). */
  @Column({ type: 'int', nullable: true })
  cpuPercent: number | null;

  @Column({ type: 'int', nullable: true })
  memPercent: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  metricsAt: Date | null;

  @OneToMany(() => Device, (d) => d.node)
  devices: Device[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
