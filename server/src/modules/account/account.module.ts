import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { DevicesModule } from '../devices/devices.module';
import { AuthModule } from '../auth/auth.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { AccountService } from './account.service';
import { AccountController } from './account.controller';

@Module({
  imports: [UsersModule, DevicesModule, AuthModule, SubscriptionsModule],
  providers: [AccountService],
  controllers: [AccountController],
  exports: [AccountService],
})
export class AccountModule {}
