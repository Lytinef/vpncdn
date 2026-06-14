import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Защита админских эндпоинтов: требует валидный admin-JWT. */
@Injectable()
export class AdminJwtGuard extends AuthGuard('admin-jwt') {}
