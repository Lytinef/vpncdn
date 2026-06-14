import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminUser } from './entities/admin-user.entity';
import { User } from '../users/entities/user.entity';
import { Subscription } from '../subscriptions/entities/subscription.entity';
import { Payment } from '../payments/entities/payment.entity';
import { Device } from '../devices/entities/device.entity';
import { Node } from '../nodes/entities/node.entity';
import { UsersModule } from '../users/users.module';
import { NodesModule } from '../nodes/nodes.module';
import { BypassModule } from '../bypass/bypass.module';
import { AccountModule } from '../account/account.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { DevicesModule } from '../devices/devices.module';
import { AdminAuthService } from './admin-auth.service';
import { AdminService } from './admin.service';
import { AdminJwtStrategy } from './strategies/admin-jwt.strategy';
import { AdminController } from './admin.controller';
import { AdminNodesController } from './admin-nodes.controller';
import { AdminBypassController } from './admin-bypass.controller';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({}),
    TypeOrmModule.forFeature([AdminUser, User, Subscription, Payment, Device, Node]),
    UsersModule,
    NodesModule,
    BypassModule,
    AccountModule,
    SubscriptionsModule,
    DevicesModule,
  ],
  providers: [AdminAuthService, AdminService, AdminJwtStrategy],
  controllers: [AdminController, AdminNodesController, AdminBypassController],
})
export class AdminModule {}
