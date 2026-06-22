import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminAuthService } from './admin-auth.service';
import { AdminService } from './admin.service';
import { AdminJwtGuard } from './guards/admin-jwt.guard';
import { CurrentAdmin, AuthAdmin } from '../../common/decorators/current-admin.decorator';
import { AdminLoginDto } from './dto/admin-login.dto';
import { PaymentStatus } from '../payments/entities/payment.entity';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { serializeSubscription } from '../subscriptions/subscriptions.serializer';
import { DevicesService } from '../devices/devices.service';
import { BotService } from '../bot/bot.service';
import {
  AdminGrantSubscriptionDto,
  AdminExtendDto,
  AdminChangePlanDto,
} from './dto/subscription.dto';
import { AdminBroadcastDto } from './dto/broadcast.dto';

@ApiTags('admin')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminAuth: AdminAuthService,
    private readonly admin: AdminService,
    private readonly subscriptions: SubscriptionsService,
    private readonly devices: DevicesService,
    private readonly bot: BotService,
  ) {}

  /** Массовая рассылка всем пользователям бота. */
  @Post('broadcast')
  @ApiBearerAuth()
  @UseGuards(AdminJwtGuard)
  broadcast(@Body() dto: AdminBroadcastDto) {
    return this.bot.broadcast(dto.text);
  }

  @Post('auth/login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: AdminLoginDto) {
    return this.adminAuth.login(dto.email, dto.password);
  }

  @Get('auth/me')
  @ApiBearerAuth()
  @UseGuards(AdminJwtGuard)
  me(@CurrentAdmin() admin: AuthAdmin) {
    return admin;
  }

  @Get('stats')
  @ApiBearerAuth()
  @UseGuards(AdminJwtGuard)
  dashboard() {
    return this.admin.dashboard();
  }

  @Get('users')
  @ApiBearerAuth()
  @UseGuards(AdminJwtGuard)
  listUsers(
    @Query('search') search?: string,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    return this.admin.listUsers({ search, page: Number(page), limit: Number(limit) });
  }

  @Get('users/:id')
  @ApiBearerAuth()
  @UseGuards(AdminJwtGuard)
  getUser(@Param('id') id: string) {
    return this.admin.getUser(id);
  }

  @Post('users/:id/block')
  @ApiBearerAuth()
  @UseGuards(AdminJwtGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  block(@Param('id') id: string) {
    return this.admin.setBlocked(id, true);
  }

  @Post('users/:id/unblock')
  @ApiBearerAuth()
  @UseGuards(AdminJwtGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  unblock(@Param('id') id: string) {
    return this.admin.setBlocked(id, false);
  }

  @Delete('users/:id')
  @ApiBearerAuth()
  @UseGuards(AdminJwtGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteUser(@Param('id') id: string) {
    return this.admin.deleteUser(id);
  }

  // ── управление подпиской пользователя ──

  /** Выдать/обновить подписку вручную (без оплаты). */
  @Post('users/:id/subscription/grant')
  @ApiBearerAuth()
  @UseGuards(AdminJwtGuard)
  async grantSubscription(@Param('id') id: string, @Body() dto: AdminGrantSubscriptionDto) {
    const sub = await this.subscriptions.adminGrant(id, dto.planCode, dto.days);
    return serializeSubscription(sub);
  }

  /** Продлить текущий период на N дней. */
  @Post('users/:id/subscription/extend')
  @ApiBearerAuth()
  @UseGuards(AdminJwtGuard)
  async extendSubscription(@Param('id') id: string, @Body() dto: AdminExtendDto) {
    const sub = await this.subscriptions.adminExtend(id, dto.days);
    return serializeSubscription(sub);
  }

  /** Сменить тариф (немедленно или со следующего периода). */
  @Post('users/:id/subscription/change-plan')
  @ApiBearerAuth()
  @UseGuards(AdminJwtGuard)
  async changeUserPlan(@Param('id') id: string, @Body() dto: AdminChangePlanDto) {
    const sub = dto.immediate
      ? await this.subscriptions.adminChangePlanNow(id, dto.planCode)
      : await this.subscriptions.changePlan(id, dto.planCode);
    return serializeSubscription(sub);
  }

  /** Отменить подписку (доступ до конца периода). */
  @Post('users/:id/subscription/cancel')
  @ApiBearerAuth()
  @UseGuards(AdminJwtGuard)
  async cancelSubscription(@Param('id') id: string) {
    const sub = await this.subscriptions.cancelAtPeriodEnd(id);
    return serializeSubscription(sub);
  }

  /** Возобновить отменённую подписку. */
  @Post('users/:id/subscription/resume')
  @ApiBearerAuth()
  @UseGuards(AdminJwtGuard)
  async resumeSubscription(@Param('id') id: string) {
    const sub = await this.subscriptions.resume(id);
    return serializeSubscription(sub);
  }

  /** Отзыв (удаление) устройства пользователя — снимает доступ на узле. */
  @Delete('users/:id/devices/:deviceId')
  @ApiBearerAuth()
  @UseGuards(AdminJwtGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeDevice(@Param('id') id: string, @Param('deviceId') deviceId: string) {
    await this.devices.remove(id, deviceId);
  }

  @Get('payments')
  @ApiBearerAuth()
  @UseGuards(AdminJwtGuard)
  listPayments(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('status') status?: PaymentStatus,
  ) {
    return this.admin.listPayments({ page: Number(page), limit: Number(limit), status });
  }
}
