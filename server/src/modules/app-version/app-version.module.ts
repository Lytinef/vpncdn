import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppVersion } from './entities/app-version.entity';
import { AppVersionService } from './app-version.service';
import { AppVersionController } from './app-version.controller';
import { AdminAppVersionController } from './admin-app-version.controller';

/**
 * Актуальная версия клиента по платформам: публичная проверка для клиента +
 * управление из админ-панели. Админ-эндпоинт защищён admin-jwt стратегией,
 * которая регистрируется в AdminModule (всегда загружен).
 */
@Module({
  imports: [TypeOrmModule.forFeature([AppVersion])],
  providers: [AppVersionService],
  controllers: [AppVersionController, AdminAppVersionController],
})
export class AppVersionModule {}
