import { MigrationInterface, QueryRunner } from 'typeorm';

/** SOS-доступ: таблица sos_devices (экстренное CDN-подключение с лимитом 100 МБ). */
export class CreateSosDevices1730000011000 implements MigrationInterface {
  name = 'CreateSosDevices1730000011000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS "sos_devices" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "hardwareId" varchar(128) NOT NULL,
        "nodeId" uuid,
        "xrayUuid" uuid NOT NULL,
        "usedBytes" bigint NOT NULL DEFAULT 0,
        "blocked" boolean NOT NULL DEFAULT false,
        "lastSeenAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_sos_devices" PRIMARY KEY ("id")
      )
    `);
    await q.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_sos_devices_hardwareId" ON "sos_devices" ("hardwareId")`,
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS "IDX_sos_devices_blocked" ON "sos_devices" ("blocked")`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "sos_devices"`);
  }
}
