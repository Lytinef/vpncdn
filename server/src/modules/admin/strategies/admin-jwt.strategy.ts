import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AdminConfig } from '../../../config/configuration';
import { AdminAuthService, AdminTokenPayload } from '../admin-auth.service';

@Injectable()
export class AdminJwtStrategy extends PassportStrategy(Strategy, 'admin-jwt') {
  constructor(
    config: ConfigService,
    private readonly adminAuth: AdminAuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<AdminConfig>('admin')!.jwtSecret,
    });
  }

  async validate(payload: AdminTokenPayload) {
    if (payload.type !== 'admin') throw new UnauthorizedException('Неверный тип токена');
    const admin = await this.adminAuth.validate(payload.sub);
    return { id: admin.id, role: admin.role, email: admin.email };
  }
}
