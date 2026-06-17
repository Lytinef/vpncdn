import { MigrationInterface, QueryRunner } from 'typeorm';

/** Таблица актуальных версий клиента по платформам + дефолтная запись Android. */
export class AddAppVersions1730000003000 implements MigrationInterface {
  name = 'AddAppVersions1730000003000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE TYPE "app_versions_platform_enum" AS ENUM ('android','ios','windows')`,
    );
    await q.query(`
      CREATE TABLE "app_versions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "platform" "app_versions_platform_enum" NOT NULL,
        "latestVersion" varchar(32) NOT NULL,
        "latestBuild" int NOT NULL DEFAULT 1,
        "minBuild" int NOT NULL DEFAULT 0,
        "updateUrl" text,
        "notes" text,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(
      `CREATE UNIQUE INDEX "IDX_app_versions_platform" ON "app_versions" ("platform")`,
    );
    // Дефолт для Android, чтобы эндпоинт сразу отвечал осмысленно.
    await q.query(
      `INSERT INTO "app_versions" ("platform","latestVersion","latestBuild","minBuild") VALUES ('android','1.0.0',1,0)`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "app_versions"`);
    await q.query(`DROP TYPE IF EXISTS "app_versions_platform_enum"`);
  }
}
