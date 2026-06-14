import { Controller, Delete, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AccountService } from './account.service';

@ApiTags('account')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users/me')
export class AccountController {
  constructor(private readonly account: AccountService) {}

  /** Профиль и сводка состояния. */
  @Get()
  me(@CurrentUser('id') userId: string) {
    return this.account.getMe(userId);
  }

  /** Выход со всех устройств. */
  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logoutAll(@CurrentUser('id') userId: string) {
    await this.account.logoutAll(userId);
  }

  /** Удаление аккаунта (без возврата средств). */
  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser('id') userId: string) {
    await this.account.deleteAccount(userId);
  }
}
