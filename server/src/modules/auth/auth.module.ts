import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../users/users.module';
import { Session } from './entities/session.entity';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { TelegramLoginPageController } from './telegram-login-page.controller';
import { TelegramService } from './telegram.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({}),
    TypeOrmModule.forFeature([Session]),
    UsersModule,
  ],
  controllers: [AuthController, TelegramLoginPageController],
  providers: [AuthService, TelegramService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
