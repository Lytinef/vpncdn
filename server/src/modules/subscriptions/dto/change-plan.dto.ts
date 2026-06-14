import { IsEnum } from 'class-validator';
import { PlanCode } from '../entities/plan.entity';

export class ChangePlanDto {
  @IsEnum(PlanCode)
  planCode: PlanCode;
}
