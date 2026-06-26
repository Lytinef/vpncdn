import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SosService } from './sos.service';

/**
 * Публичный SOS-доступ (без авторизации): экстренное CDN-подключение по
 * hardwareId с лимитом 100 МБ. Нужен, когда пользователь без интернета не может
 * войти в аккаунт / достучаться до бота.
 */
@ApiTags('sos')
@Controller('sos')
export class SosController {
  constructor(private readonly sos: SosService) {}

  @Post('connect')
  connect(@Body('hardwareId') hardwareId: string) {
    return this.sos.connect(hardwareId);
  }
}
