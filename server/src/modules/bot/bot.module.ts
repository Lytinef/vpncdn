import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { PaymentsModule } from '../payments/payments.module';
import { DevicesModule } from '../devices/devices.module';
import { AuthModule } from '../auth/auth.module';
import { BotService } from './bot.service';

/**
 * Telegram-бот как личный кабинет: подписка, оплата (redirect YooKassa), смена
 * тарифа, автопродление, устройства. Использует существующие доменные сервисы.
 */
@Module({
  imports: [UsersModule, SubscriptionsModule, PaymentsModule, DevicesModule, AuthModule],
  providers: [BotService],
})
export class BotModule {}
