import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Постоянные коды входа: один на пользователя, без TTL/одноразовости.
 * Чистим старые одноразовые коды, делаем expiresAt nullable и userId уникальным.
 */
export class PermanentLoginCode1730000010000 implements MigrationInterface {
  name = 'PermanentLoginCode1730000010000';

  public async up(q: QueryRunner): Promise<void> {
    // Старые одноразовые коды больше не нужны — пользователи получат постоянные.
    await q.query(`DELETE FROM "login_codes"`);
    await q.query(`ALTER TABLE "login_codes" ALTER COLUMN "expiresAt" DROP NOT NULL`);
    await q.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_login_codes_userId" ON "login_codes" ("userId")`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "UQ_login_codes_userId"`);
    await q.query(`ALTER TABLE "login_codes" ALTER COLUMN "expiresAt" SET NOT NULL`);
  }
}
