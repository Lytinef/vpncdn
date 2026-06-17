import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Добавляет значение 'trial' в enum тарифов (пробный период).
 *
 * Саму строку тарифа в таблице plans создаёт сид (run-seed.ts): Postgres не даёт
 * использовать только что добавленное значение enum в той же транзакции, где оно
 * добавлено, а миграции выполняются в транзакции. Здесь — только расширение типа.
 */
export class AddTrialPlan1730000002000 implements MigrationInterface {
  name = 'AddTrialPlan1730000002000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TYPE "plans_code_enum" ADD VALUE IF NOT EXISTS 'trial'`);
  }

  public async down(): Promise<void> {
    // Postgres не поддерживает удаление значения из enum — откат не требуется.
  }
}
