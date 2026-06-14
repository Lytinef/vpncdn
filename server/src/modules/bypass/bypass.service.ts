import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { BypassEntry, BypassType } from './entities/bypass-entry.entity';

@Injectable()
export class BypassService {
  constructor(
    @InjectRepository(BypassEntry)
    private readonly repo: Repository<BypassEntry>,
  ) {}

  /**
   * Актуальный список обхода для клиента, сгруппированный по типу.
   * version — хэш содержимого, чтобы клиент кешировал и обновлял по изменению.
   */
  async getActiveList() {
    const items = await this.repo.find({
      where: { isActive: true },
      order: { type: 'ASC', title: 'ASC' },
    });
    const apps = items
      .filter((i) => i.type === BypassType.APP)
      .map((i) => ({ value: i.value, title: i.title, category: i.category }));
    const domains = items
      .filter((i) => i.type === BypassType.DOMAIN)
      .map((i) => ({ value: i.value, title: i.title, category: i.category }));

    const version = crypto
      .createHash('sha256')
      .update(items.map((i) => `${i.type}:${i.value}`).sort().join('|'))
      .digest('hex')
      .slice(0, 16);

    return { version, apps, domains };
  }

  // ── админ CRUD ──
  findAll(): Promise<BypassEntry[]> {
    return this.repo.find({ order: { type: 'ASC', title: 'ASC' } });
  }

  create(data: Partial<BypassEntry>): Promise<BypassEntry> {
    return this.repo.save(this.repo.create(data));
  }

  async update(id: string, data: Partial<BypassEntry>): Promise<BypassEntry> {
    const entry = await this.repo.findOne({ where: { id } });
    if (!entry) throw new NotFoundException('Запись не найдена');
    Object.assign(entry, data);
    return this.repo.save(entry);
  }

  async remove(id: string): Promise<void> {
    await this.repo.delete(id);
  }

  /** Массовый импорт (для админки). */
  async bulkUpsert(entries: Partial<BypassEntry>[]): Promise<number> {
    let count = 0;
    for (const e of entries) {
      const existing = await this.repo.findOne({ where: { type: e.type, value: e.value } });
      if (existing) {
        Object.assign(existing, e);
        await this.repo.save(existing);
      } else {
        await this.repo.save(this.repo.create(e));
      }
      count++;
    }
    return count;
  }
}
