import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { User } from './entities/user.entity';
import { TelegramProfile } from '../auth/telegram.service';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly repo: Repository<User>,
  ) {}

  findById(id: string): Promise<User | null> {
    return this.repo.findOne({ where: { id } });
  }

  findByTelegramId(telegramId: string): Promise<User | null> {
    return this.repo.findOne({ where: { telegramId } });
  }

  /**
   * Создаёт пользователя по данным Telegram или обновляет профиль существующего.
   * Принимает только профильные поля — подходит и для Login Widget, и для бота
   * (где нет auth_date/hash).
   */
  async upsertFromTelegram(
    profile: Pick<
      TelegramProfile,
      'id' | 'first_name' | 'last_name' | 'username' | 'photo_url'
    >,
  ): Promise<User> {
    const telegramId = String(profile.id);
    let user = await this.findByTelegramId(telegramId);
    const patch: Partial<User> = {
      username: profile.username ?? null,
      firstName: profile.first_name ?? null,
      lastName: profile.last_name ?? null,
      photoUrl: profile.photo_url ?? null,
    };
    if (user) {
      await this.repo.update(user.id, patch as QueryDeepPartialEntity<User>);
      return (await this.findById(user.id))!;
    }
    user = this.repo.create({ telegramId, ...patch });
    return this.repo.save(user);
  }

  async getProfile(id: string): Promise<User> {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException('Пользователь не найден');
    return user;
  }

  async setBlocked(id: string, isBlocked: boolean): Promise<void> {
    await this.repo.update(id, { isBlocked });
  }

  async touch(id: string): Promise<void> {
    await this.repo.update(id, { updatedAt: new Date() });
  }

  /**
   * Полное удаление аккаунта. FK ON DELETE CASCADE удаляет сессии, подписки,
   * устройства, платежи. Отзыв VLESS-доступа на узлах выполняется заранее в
   * AccountService перед вызовом (см. devices/xray).
   */
  async deleteAccount(id: string): Promise<void> {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException('Пользователь не найден');
    await this.repo.delete(id);
  }
}
