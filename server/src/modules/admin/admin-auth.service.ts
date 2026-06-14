import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { AdminConfig } from '../../config/configuration';
import { AdminUser } from './entities/admin-user.entity';

export interface AdminTokenPayload {
  sub: string;
  role: string;
  type: 'admin';
}

@Injectable()
export class AdminAuthService {
  private readonly cfg: AdminConfig;

  constructor(
    config: ConfigService,
    private readonly jwt: JwtService,
    @InjectRepository(AdminUser)
    private readonly admins: Repository<AdminUser>,
  ) {
    this.cfg = config.get<AdminConfig>('admin')!;
  }

  async login(email: string, password: string) {
    const admin = await this.admins.findOne({ where: { email: email.toLowerCase().trim() } });
    if (!admin || !admin.isActive) {
      throw new UnauthorizedException('Неверный логин или пароль');
    }
    const ok = await bcrypt.compare(password, admin.passwordHash);
    if (!ok) throw new UnauthorizedException('Неверный логин или пароль');

    admin.lastLoginAt = new Date();
    await this.admins.save(admin);

    const token = await this.jwt.signAsync(
      { sub: admin.id, role: admin.role, type: 'admin' },
      { secret: this.cfg.jwtSecret, expiresIn: this.cfg.jwtTtl },
    );
    return { token, admin: this.serialize(admin) };
  }

  async validate(adminId: string): Promise<AdminUser> {
    const admin = await this.admins.findOne({ where: { id: adminId } });
    if (!admin || !admin.isActive) throw new UnauthorizedException('Доступ запрещён');
    return admin;
  }

  serialize(admin: AdminUser) {
    return { id: admin.id, email: admin.email, role: admin.role, lastLoginAt: admin.lastLoginAt };
  }
}
