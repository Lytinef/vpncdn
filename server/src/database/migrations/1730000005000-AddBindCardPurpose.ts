import { MigrationInterface, QueryRunner } from 'typeorm';

/** Добавляет значение 'bind_card' в enum назначений платежа (привязка карты). */
export class AddBindCardPurpose1730000005000 implements MigrationInterface {
  name = 'AddBindCardPurpose1730000005000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TYPE "payments_purpose_enum" ADD VALUE IF NOT EXISTS 'bind_card'`);
  }

  public async down(): Promise<void> {
    // Postgres не поддерживает удаление значения enum — откат не требуется.
  }
}
