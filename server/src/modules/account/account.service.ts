import { Injectable, Logger } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { DevicesService } from '../devices/devices.service';
import { AuthService } from '../auth/auth.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { serializeSubscription } from '../subscriptions/subscriptions.serializer';

@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(
    private readonly users: UsersService,
    private readonly devices: DevicesService,
    private readonly auth: AuthService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  /** Сводка для главного экрана: профиль + подписка + устройства. */
  async getMe(userId: string) {
    const user = await this.users.getProfile(userId);
    const sub = await this.subscriptions.getActive(userId);
    const devicesUsed = await this.devices.countActive(userId);
    return {
      user: {
        id: user.id,
        telegramId: user.telegramId,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        photoUrl: user.photoUrl,
      },
      subscription: serializeSubscription(sub),
      devices: {
        used: devicesUsed,
        limit: sub ? sub.plan.deviceLimit : 0,
      },
    };
  }

  /** Выход со всех устройств (отзыв всех сессий). */
  async logoutAll(userId: string): Promise<void> {
    await this.auth.logoutAll(userId);
  }

  /**
   * Полное удаление аккаунта. Деньги не возвращаются (предупреждение на клиенте).
   * Порядок: отзыв VPN-доступа на узлах → отзыв сессий → удаление пользователя
   * (каскадно удаляет подписки, устройства, платежи).
   */
  async deleteAccount(userId: string): Promise<void> {
    this.logger.log(`Удаление аккаунта ${userId}`);
    await this.devices.revokeAllForUser(userId);
    await this.auth.logoutAll(userId);
    await this.users.deleteAccount(userId);
  }
}
