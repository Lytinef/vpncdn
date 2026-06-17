import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppPlatform, AppVersion } from './entities/app-version.entity';
import { UpdateAppVersionDto } from './dto/update-app-version.dto';

export interface VersionCheckResult {
  latestVersion: string | null;
  latestBuild: number;
  updateAvailable: boolean;
  forceUpdate: boolean;
  updateUrl: string | null;
  notes: string | null;
}

@Injectable()
export class AppVersionService {
  constructor(
    @InjectRepository(AppVersion)
    private readonly repo: Repository<AppVersion>,
  ) {}

  list(): Promise<AppVersion[]> {
    return this.repo.find({ order: { platform: 'ASC' } });
  }

  get(platform: AppPlatform): Promise<AppVersion | null> {
    return this.repo.findOne({ where: { platform } });
  }

  /** Создаёт/обновляет запись платформы (из админ-панели). */
  async upsert(platform: AppPlatform, dto: UpdateAppVersionDto): Promise<AppVersion> {
    const row =
      (await this.repo.findOne({ where: { platform } })) ??
      this.repo.create({ platform, latestVersion: '1.0.0', latestBuild: 1 });
    if (dto.latestVersion !== undefined) row.latestVersion = dto.latestVersion;
    if (dto.latestBuild !== undefined) row.latestBuild = dto.latestBuild;
    if (dto.minBuild !== undefined) row.minBuild = dto.minBuild;
    if (dto.updateUrl !== undefined) row.updateUrl = dto.updateUrl || null;
    if (dto.notes !== undefined) row.notes = dto.notes || null;
    return this.repo.save(row);
  }

  /** Проверка обновления для клиента: сравнение по build. */
  async check(platform: AppPlatform, build: number): Promise<VersionCheckResult> {
    const row = await this.get(platform);
    if (!row) {
      return {
        latestVersion: null,
        latestBuild: 0,
        updateAvailable: false,
        forceUpdate: false,
        updateUrl: null,
        notes: null,
      };
    }
    return {
      latestVersion: row.latestVersion,
      latestBuild: row.latestBuild,
      updateAvailable: build < row.latestBuild,
      forceUpdate: row.minBuild > 0 && build < row.minBuild,
      updateUrl: row.updateUrl,
      notes: row.notes,
    };
  }
}
