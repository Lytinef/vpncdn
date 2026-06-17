import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import * as crypto from 'crypto';
import { LoginCode } from './entities/login-code.entity';

// Без неоднозначных символов (0/O, 1/I).
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;
const TTL_MS = 10 * 60 * 1000;

@Injectable()
export class LoginCodeService {
  private readonly logger = new Logger(LoginCodeService.name);

  constructor(
    @InjectRepository(LoginCode)
    private readonly repo: Repository<LoginCode>,
  ) {}

  /** Выдаёт одноразовый код входа (заменяя прошлый неиспользованный код юзера). */
  async issue(userId: string): Promise<{ code: string; expiresAt: Date }> {
    await this.repo.delete({ userId, usedAt: IsNull() });
    const code = await this.uniqueCode();
    const expiresAt = new Date(Date.now() + TTL_MS);
    await this.repo.save(this.repo.create({ code, userId, expiresAt }));
    return { code, expiresAt };
  }

  /** Проверяет код и возвращает userId; помечает использованным. */
  async redeem(code: string): Promise<string> {
    const normalized = code.trim().toUpperCase();
    const row = await this.repo.findOne({ where: { code: normalized } });
    if (!row || row.usedAt || row.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Код недействителен или истёк');
    }
    row.usedAt = new Date();
    await this.repo.save(row);
    return row.userId;
  }

  private async uniqueCode(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const code = Array.from(
        { length: CODE_LENGTH },
        () => ALPHABET[crypto.randomInt(ALPHABET.length)],
      ).join('');
      const exists = await this.repo.findOne({ where: { code } });
      if (!exists) return code;
    }
    throw new Error('Не удалось сгенерировать уникальный код');
  }
}
