import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Защита клиентских эндпоинтов: требует валидный access-JWT. */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
