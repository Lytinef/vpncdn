import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { DevicesService } from './devices.service';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { Device } from './entities/device.entity';

const serialize = (d: Device) => ({
  id: d.id,
  name: d.name,
  platform: d.platform,
  isActive: d.isActive,
  lastSeenAt: d.lastSeenAt,
  createdAt: d.createdAt,
});

@ApiTags('devices')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('devices')
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Get()
  async list(@CurrentUser('id') userId: string) {
    const items = await this.devices.listForUser(userId);
    return items.map(serialize);
  }

  /** Регистрация текущего устройства (в рамках лимита тарифа). */
  @Post()
  async register(@CurrentUser('id') userId: string, @Body() dto: RegisterDeviceDto) {
    const device = await this.devices.register(userId, dto);
    return serialize(device);
  }

  /** Конфигурация VLESS-подключения для устройства. */
  @Get(':id/connection')
  connection(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.devices.getConnection(userId, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser('id') userId: string, @Param('id') id: string) {
    await this.devices.remove(userId, id);
  }
}
