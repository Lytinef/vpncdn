import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Реестр выданных триалов по telegramId (анти-абуз: один триал на аккаунт
 * навсегда). Бэкфилл: все существующие пользователи считаются уже использовавшими
 * право на триал, чтобы пересоздание аккаунта не давало новый.
 */
export class AddTrialLedger1730000006000 implements MigrationInterface {
  name = 'AddTrialLedger1730000006000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE "trial_ledger" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "telegramId" bigint NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(
      `CREATE UNIQUE INDEX "IDX_trial_ledger_telegramId" ON "trial_ledger" ("telegramId")`,
    );
    await q.query(
      `INSERT INTO "trial_ledger" ("telegramId") SELECT DISTINCT "telegramId" FROM "users" ON CONFLICT ("telegramId") DO NOTHING`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "trial_ledger"`);
  }
}
