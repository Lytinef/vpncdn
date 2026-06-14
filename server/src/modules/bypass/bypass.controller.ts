import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BypassService } from './bypass.service';

@ApiTags('bypass')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('bypass')
export class BypassController {
  constructor(private readonly bypass: BypassService) {}

  /** Список приложений/доменов РФ для обхода VPN (берётся клиентом). */
  @Get()
  list() {
    return this.bypass.getActiveList();
  }
}
