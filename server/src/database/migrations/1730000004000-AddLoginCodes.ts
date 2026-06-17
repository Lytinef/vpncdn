import { MigrationInterface, QueryRunner } from 'typeorm';

/** Одноразовые коды входа в приложение (выдаёт бот, обменивает клиент). */
export class AddLoginCodes1730000004000 implements MigrationInterface {
  name = 'AddLoginCodes1730000004000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE "login_codes" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "code" varchar(12) NOT NULL,
        "userId" uuid NOT NULL,
        "expiresAt" timestamptz NOT NULL,
        "usedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(`CREATE UNIQUE INDEX "IDX_login_codes_code" ON "login_codes" ("code")`);
    await q.query(`CREATE INDEX "IDX_login_codes_userId" ON "login_codes" ("userId")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "login_codes"`);
  }
}
