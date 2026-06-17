import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import * as crypto from 'crypto';
import { JwtConfig } from '../../config/configuration';
import { UsersService } from '../users/users.service';
import { Session } from './entities/session.entity';
import { LoginCodeService } from './login-code.service';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

interface RefreshPayload {
  sub: string;
  sid: string;
  type: 'refresh';
}

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly jwtCfg: JwtConfig;

  constructor(
    config: ConfigService,
    private readonly jwt: JwtService,
    private readonly users: UsersService,
    private readonly loginCodes: LoginCodeService,
    @InjectRepository(Session)
    private readonly sessions: Repository<Session>,
  ) {
    this.jwtCfg = config.get<JwtConfig>('jwt')!;
  }

  /** Вход по одноразовому коду из бота (для сторовых сборок без Telegram-входа). */
  async loginWithCode(
    code: string,
    meta: { userAgent?: string; platform?: string },
  ): Promise<TokenPair> {
    const userId = await this.loginCodes.redeem(code);
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException('Пользователь не найден');
    if (user.isBlocked) throw new UnauthorizedException('Аккаунт заблокирован');
    return this.issueTokens(user.id, meta);
  }

  private async issueTokens(
    userId: string,
    meta: { userAgent?: string; platform?: string },
  ): Promise<TokenPair> {
    const session = this.sessions.create({
      userId,
      userAgent: meta.userAgent?.slice(0, 256) ?? null,
      platform: meta.platform ?? null,
      refreshTokenHash: 'pending',
      expiresAt: new Date(Date.now() + this.jwtCfg.refreshTtl * 1000),
    });
    await this.sessions.save(session);

    const accessToken = await this.jwt.signAsync(
      { sub: userId, type: 'access' },
      { secret: this.jwtCfg.accessSecret, expiresIn: this.jwtCfg.accessTtl },
    );
    const refreshToken = await this.jwt.signAsync(
      { sub: userId, sid: session.id, type: 'refresh' },
      { secret: this.jwtCfg.refreshSecret, expiresIn: this.jwtCfg.refreshTtl },
    );

    session.refreshTokenHash = sha256(refreshToken);
    await this.sessions.save(session);

    return { accessToken, refreshToken, expiresIn: this.jwtCfg.accessTtl };
  }

  /** Ротация токенов по refresh-токену. */
  async refresh(refreshToken: string): Promise<TokenPair> {
    let payload: RefreshPayload;
    try {
      payload = await this.jwt.verifyAsync<RefreshPayload>(refreshToken, {
        secret: this.jwtCfg.refreshSecret,
      });
    } catch {
      throw new UnauthorizedException('Недействительный refresh-токен');
    }
    if (payload.type !== 'refresh') throw new UnauthorizedException('Неверный тип токена');

    const session = await this.sessions.findOne({ where: { id: payload.sid } });
    if (!session || session.revokedAt || session.userId !== payload.sub) {
      throw new UnauthorizedException('Сессия недействительна');
    }
    if (session.expiresAt < new Date()) {
      throw new UnauthorizedException('Сессия истекла');
    }
    if (session.refreshTokenHash !== sha256(refreshToken)) {
      // Повторное использование старого токена — отзываем сессию (защита от кражи).
      session.revokedAt = new Date();
      await this.sessions.save(session);
      throw new UnauthorizedException('Refresh-токен уже использован');
    }

    // Ротация: текущую сессию отзываем, выдаём новую пару.
    session.revokedAt = new Date();
    await this.sessions.save(session);
    return this.issueTokens(session.userId, {
      userAgent: session.userAgent ?? undefined,
      platform: session.platform ?? undefined,
    });
  }

  /** Выход — отзыв одной сессии по refresh-токену. */
  async logout(refreshToken: string): Promise<void> {
    try {
      const payload = await this.jwt.verifyAsync<RefreshPayload>(refreshToken, {
        secret: this.jwtCfg.refreshSecret,
      });
      await this.sessions.update(
        { id: payload.sid, userId: payload.sub },
        { revokedAt: new Date() },
      );
    } catch {
      // Молча игнорируем — выход идемпотентен.
    }
  }

  /** Отзыв всех сессий пользователя (например, при удалении аккаунта). */
  async logoutAll(userId: string): Promise<void> {
    await this.sessions.update(
      { userId, revokedAt: undefined },
      { revokedAt: new Date() },
    );
  }

  /** Периодическая чистка истёкших сессий. */
  async purgeExpired(): Promise<number> {
    const res = await this.sessions.delete({ expiresAt: LessThan(new Date()) });
    return res.affected ?? 0;
  }
}
