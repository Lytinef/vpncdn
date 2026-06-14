import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SubscriptionsService } from './subscriptions.service';
import { ChangePlanDto } from './dto/change-plan.dto';
import { serializePlan, serializeSubscription } from './subscriptions.serializer';

@ApiTags('subscriptions')
@Controller()
export class SubscriptionsController {
  constructor(private readonly subs: SubscriptionsService) {}

  /** Список доступных тарифов (публично — показывается до входа). */
  @Get('plans')
  async listPlans() {
    const plans = await this.subs.listActivePlans();
    return plans.map(serializePlan);
  }

  /** Текущее состояние подписки пользователя. */
  @Get('subscription')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async current(@CurrentUser('id') userId: string) {
    const sub = await this.subs.getActive(userId);
    return { subscription: serializeSubscription(sub) };
  }

  /** Отмена подписки (доступ сохраняется до конца оплаченного периода). */
  @Post('subscription/cancel')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async cancel(@CurrentUser('id') userId: string) {
    const sub = await this.subs.cancelAtPeriodEnd(userId);
    return { subscription: serializeSubscription(sub) };
  }

  /** Возобновление отменённой подписки до конца периода. */
  @Post('subscription/resume')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async resume(@CurrentUser('id') userId: string) {
    const sub = await this.subs.resume(userId);
    return { subscription: serializeSubscription(sub) };
  }

  /** Смена тарифа со следующего периода. */
  @Post('subscription/change-plan')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async changePlan(@CurrentUser('id') userId: string, @Body() dto: ChangePlanDto) {
    const sub = await this.subs.changePlan(userId, dto.planCode);
    return { subscription: serializeSubscription(sub) };
  }
}
