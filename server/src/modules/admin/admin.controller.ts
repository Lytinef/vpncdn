import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminAuthService } from './admin-auth.service';
import { AdminService } from './admin.service';
import { AdminJwtGuard } from './guards/admin-jwt.guard';
import { CurrentAdmin, AuthAdmin } from '../../common/decorators/current-admin.decorator';
import { AdminLoginDto } from './dto/admin-login.dto';
import { PaymentStatus } from '../payments/entities/payment.entity';

@ApiTags('admin')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminAuth: AdminAuthService,
    private readonly admin: AdminService,
  ) {}

  @Post('auth/login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: AdminLoginDto) {
    return this.adminAuth.login(dto.email, dto.password);
  }

  @Get('auth/me')
  @ApiBearerAuth()
  @UseGuards(AdminJwtGuard)
  me(@CurrentAdmin() admin: AuthAdmin) {
    return admin;
  }

  @Get('stats')
  @ApiBearerAuth()
  @UseGuards(AdminJwtGuard)
  dashboard() {
    return this.admin.dashboard();
  }

  @Get('users')
  @ApiBearerAuth()
  @UseGuards(AdminJwtGuard)
  listUsers(
    @Query('search') search?: string,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    return this.admin.listUsers({ search, page: Number(page), limit: Number(limit) });
  }

  @Get('users/:id')
  @ApiBearerAuth()
  @UseGuards(AdminJwtGuard)
  getUser(@Param('id') id: string) {
    return this.admin.getUser(id);
  }

  @Post('users/:id/block')
  @ApiBearerAuth()
  @UseGuards(AdminJwtGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  block(@Param('id') id: string) {
    return this.admin.setBlocked(id, true);
  }

  @Post('users/:id/unblock')
  @ApiBearerAuth()
  @UseGuards(AdminJwtGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  unblock(@Param('id') id: string) {
    return this.admin.setBlocked(id, false);
  }

  @Delete('users/:id')
  @ApiBearerAuth()
  @UseGuards(AdminJwtGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteUser(@Param('id') id: string) {
    return this.admin.deleteUser(id);
  }

  @Get('payments')
  @ApiBearerAuth()
  @UseGuards(AdminJwtGuard)
  listPayments(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('status') status?: PaymentStatus,
  ) {
    return this.admin.listPayments({ page: Number(page), limit: Number(limit), status });
  }
}
