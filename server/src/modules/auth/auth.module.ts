import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../users/users.module';
import { Session } from './entities/session.entity';
import { LoginCode } from './entities/login-code.entity';
import { AuthService } from './auth.service';
import { LoginCodeService } from './login-code.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({}),
    TypeOrmModule.forFeature([Session, LoginCode]),
    UsersModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, LoginCodeService, JwtStrategy],
  exports: [AuthService, LoginCodeService],
})
export class AuthModule {}
