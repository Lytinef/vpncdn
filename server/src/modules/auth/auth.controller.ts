import { Body, Controller, Headers, Post, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthService, TokenPair } from './auth.service';
import { RefreshDto } from './dto/refresh.dto';
import { CodeLoginDto } from './dto/code-login.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Вход по одноразовому коду из бота (сборки без Telegram-входа). */
  @Post('code')
  @HttpCode(HttpStatus.OK)
  loginCode(
    @Body() dto: CodeLoginDto,
    @Headers('user-agent') userAgent?: string,
  ): Promise<TokenPair> {
    return this.auth.loginWithCode(dto.code, { userAgent, platform: dto.platform });
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
