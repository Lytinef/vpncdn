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
import { Node } from '../../nodes/entities/node.entity';

export enum DevicePlatform {
  ANDROID = 'android',
  IOS = 'ios',
  WINDOWS = 'windows',
}

/**
 * Устройство пользователя. Количество активных устройств ограничено
 * deviceLimit активного тарифа. Каждому устройству выдаётся свой VLESS UUID.
 */
@Entity('devices')
export class Device {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @ManyToOne(() => User, (u) => u.devices, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: string;

  @ManyToOne(() => Node, (n) => n.devices, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'nodeId' })
  node: Node | null;

  @Column({ nullable: true })
  nodeId: string | null;

  @Column({ type: 'varchar', length: 128 })
  name: string;

  @Column({ type: 'enum', enum: DevicePlatform })
  platform: DevicePlatform;

  /** Стабильный идентификатор устройства от клиента (для повторного входа). */
  @Index()
  @Column({ type: 'varchar', length: 128, nullable: true })
  hardwareId: string | null;

  /** VLESS UUID этого устройства на узле. */
  @Index({ unique: true })
  @Column({ type: 'uuid' })
  xrayUuid: string;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  lastSeenAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
