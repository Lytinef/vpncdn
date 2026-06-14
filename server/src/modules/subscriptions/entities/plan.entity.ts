import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum PlanCode {
  START = 'start',
  STANDARD = 'standard',
  FAMILY = 'family',
}

/**
 * Тариф. Цена хранится в копейках для точности (YooKassa оперирует "149.00").
 *  - start:    1 устройство, 149 ₽
 *  - standard: 3 устройства, 249 ₽
 *  - family:   6 устройств,  349 ₽
 */
@Entity('plans')
export class Plan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'enum', enum: PlanCode })
  code: PlanCode;

  @Column({ type: 'varchar', length: 64 })
  name: string;

  @Column({ type: 'int' })
  priceKopecks: number;

  @Column({ type: 'int' })
  deviceLimit: number;

  @Column({ type: 'int', default: 30 })
  durationDays: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
