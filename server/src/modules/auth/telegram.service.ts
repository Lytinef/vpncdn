import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { TelegramConfig } from '../../config/configuration';

export interface TelegramProfile {
  id: number | string;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number | string;
  hash: string;
}

/**
 * Проверка подписи Telegram Login Widget.
 * https://core.telegram.org/widgets/login#checking-authorization
 *  secret_key = SHA256(bot_token)
 *  hmac_sha256(data_check_string, secret_key) === hash
 */
@Injectable()
export class TelegramService {
  private readonly cfg: TelegramConfig;

  constructor(config: ConfigService) {
    this.cfg = config.get<TelegramConfig>('telegram')!;
  }

  verifyLogin(data: TelegramProfile): TelegramProfile {
    if (!this.cfg.botToken) {
      throw new BadRequestException('TELEGRAM_BOT_TOKEN не настроен');
    }
    const { hash, ...fields } = data;
    if (!hash) throw new UnauthorizedException('Отсутствует подпись Telegram');

    const dataCheckString = Object.keys(fields)
      .filter((k) => fields[k] !== undefined && fields[k] !== null)
      .sort()
      .map((k) => `${k}=${fields[k]}`)
      .join('\n');

    const secretKey = crypto.createHash('sha256').update(this.cfg.botToken).digest();
    const computed = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    const valid =
      computed.length === hash.length &&
      crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(hash));
    if (!valid) {
      throw new UnauthorizedException('Неверная подпись Telegram');
    }

    const authDate = Number(data.auth_date);
    const ageSeconds = Math.floor(Date.now() / 1000) - authDate;
    if (!Number.isFinite(authDate) || ageSeconds > this.cfg.authTtl) {
      throw new UnauthorizedException('Данные авторизации устарели');
    }

    return data;
  }
}
