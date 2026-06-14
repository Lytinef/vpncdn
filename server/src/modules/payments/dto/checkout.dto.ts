import { IsEnum } from 'class-validator';
import { PlanCode } from '../../subscriptions/entities/plan.entity';

export class CheckoutDto {
  @IsEnum(PlanCode)
  planCode: PlanCode;
}
