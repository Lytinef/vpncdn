import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AppPlatform } from './entities/app-version.entity';
import { AppVersionService } from './app-version.service';

/** Публичная проверка версии клиента (без авторизации). */
@ApiTags('app')
@Controller('app')
export class AppVersionController {
  constructor(private readonly versions: AppVersionService) {}

  @Get('version')
  check(@Query('platform') platform?: string, @Query('build') build?: string) {
    const p = (Object.values(AppPlatform) as string[]).includes(platform ?? '')
      ? (platform as AppPlatform)
      : AppPlatform.ANDROID;
    const b = Number.parseInt(build ?? '0', 10);
    return this.versions.check(p, Number.isFinite(b) ? b : 0);
  }
}
