import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { PlanCode } from '../../subscriptions/entities/plan.entity';

export class AdminGrantSubscriptionDto {
  @IsEnum(PlanCode)
  planCode: PlanCode;

  /** Длительность в днях (по умолчанию — durationDays тарифа). */
  @IsOptional()
  @IsInt()
  @Min(1)
  days?: number;
}

export class AdminExtendDto {
  @IsInt()
  @Min(1)
  days: number;
}

export class AdminChangePlanDto {
  @IsEnum(PlanCode)
  planCode: PlanCode;

  /** true — сменить немедленно; false/опущено — со следующего периода. */
  @IsOptional()
  immediate?: boolean;
}
