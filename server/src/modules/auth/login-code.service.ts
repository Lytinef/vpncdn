import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { LoginCode } from './entities/login-code.entity';

// Без неоднозначных символов (0/O, 1/I).
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

@Injectable()
export class LoginCodeService {
  private readonly logger = new Logger(LoginCodeService.name);

  constructor(
    @InjectRepository(LoginCode)
    private readonly repo: Repository<LoginCode>,
  ) {}

  /** Возвращает постоянный код пользователя, создавая его при первом обращении. */
  async getOrCreate(userId: string): Promise<string> {
    const existing = await this.repo.findOne({ where: { userId } });
    if (existing) return existing.code;
    const code = await this.uniqueCode();
    await this.repo.save(this.repo.create({ code, userId }));
    return code;
  }

  /** Генерирует новый постоянный код (старый перестаёт работать). */
  async regenerate(userId: string): Promise<string> {
    const code = await this.uniqueCode();
    const existing = await this.repo.findOne({ where: { userId } });
    if (existing) {
      existing.code = code;
      await this.repo.save(existing);
    } else {
      await this.repo.save(this.repo.create({ code, userId }));
    }
    return code;
  }

  /** Постоянный код: проверяет и возвращает userId. НЕ «съедает» (без TTL/usedAt). */
  async redeem(code: string): Promise<string> {
    const normalized = code.trim().toUpperCase();
    const row = await this.repo.findOne({ where: { code: normalized } });
    if (!row) {
      throw new BadRequestException('Код недействителен');
    }
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
