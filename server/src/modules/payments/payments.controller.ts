import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaymentsService } from './payments.service';
import { PaymentMethodsService } from './payment-methods.service';
import { CheckoutDto } from './dto/checkout.dto';

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly methods: PaymentMethodsService,
  ) {}

  /** Старт покупки подписки — возвращает confirmation_url для оплаты. */
  @Post('checkout')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  checkout(@CurrentUser('id') userId: string, @Body() dto: CheckoutDto) {
    return this.payments.createCheckout(userId, dto.planCode);
  }

  /** История платежей. */
  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  history(@CurrentUser('id') userId: string) {
    return this.payments.listForUser(userId);
  }

  /** Проверка статуса платежа (после возврата с оплаты). */
  @Get(':id/sync')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  sync(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.payments.syncPayment(userId, id);
  }

  /** Список сохранённых способов оплаты. */
  @Get('methods')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async listMethods(@CurrentUser('id') userId: string) {
    const items = await this.methods.list(userId);
    return items.map((m) => ({
      id: m.id,
      title: m.title,
      cardLast4: m.cardLast4,
      cardType: m.cardType,
      isDefault: m.isDefault,
    }));
  }

  /** Удаление сохранённого способа оплаты. */
  @Delete('methods/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMethod(@CurrentUser('id') userId: string, @Param('id') id: string) {
    await this.methods.remove(userId, id);
  }

  /**
   * Вебхук YooKassa (публичный). Статус перепроверяется через API,
   * поэтому подделка тела не приводит к выдаче доступа.
   */
  @Post('yookassa/webhook')
  @HttpCode(HttpStatus.OK)
  async webhook(@Body() body: any) {
    await this.payments.handleWebhook(body);
    return { ok: true };
  }
}
