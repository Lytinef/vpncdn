import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminJwtGuard } from '../admin/guards/admin-jwt.guard';
import { AppPlatform } from './entities/app-version.entity';
import { AppVersionService } from './app-version.service';
import { UpdateAppVersionDto } from './dto/update-app-version.dto';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminJwtGuard)
@Controller('admin/app-versions')
export class AdminAppVersionController {
  constructor(private readonly versions: AppVersionService) {}

  @Get()
  list() {
    return this.versions.list();
  }

  @Put(':platform')
  upsert(@Param('platform') platform: string, @Body() dto: UpdateAppVersionDto) {
    if (!(Object.values(AppPlatform) as string[]).includes(platform)) {
      throw new BadRequestException('Неизвестная платформа');
    }
    return this.versions.upsert(platform as AppPlatform, dto);
  }
}
