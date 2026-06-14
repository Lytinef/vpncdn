import { Body, Controller, Headers, Post, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthService, TokenPair } from './auth.service';
import { TelegramLoginDto } from './dto/telegram-login.dto';
import { RefreshDto } from './dto/refresh.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Вход через Telegram Login Widget / Mini App. */
  @Post('telegram')
  @HttpCode(HttpStatus.OK)
  loginTelegram(
    @Body() dto: TelegramLoginDto,
    @Headers('user-agent') userAgent?: string,
  ): Promise<TokenPair> {
    const { platform, ...profile } = dto;
    return this.auth.loginWithTelegram(profile, { userAgent, platform });
  }

  /** Обновление пары токенов. */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshDto): Promise<TokenPair> {
    return this.auth.refresh(dto.refreshToken);
  }

  /** Выход — отзыв текущей сессии. */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body() dto: RefreshDto): Promise<void> {
    await this.auth.logout(dto.refreshToken);
  }
}
