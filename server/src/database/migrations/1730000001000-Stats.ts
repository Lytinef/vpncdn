import { MigrationInterface, QueryRunner } from 'typeorm';

export class Stats1730000001000 implements MigrationInterface {
  name = 'Stats1730000001000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "uplinkBytes" bigint NOT NULL DEFAULT 0`);
    await q.query(`ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "downlinkBytes" bigint NOT NULL DEFAULT 0`);
    await q.query(`ALTER TABLE "nodes" ADD COLUMN IF NOT EXISTS "cpuPercent" int`);
    await q.query(`ALTER TABLE "nodes" ADD COLUMN IF NOT EXISTS "memPercent" int`);
    await q.query(`ALTER TABLE "nodes" ADD COLUMN IF NOT EXISTS "metricsAt" timestamptz`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "nodes" DROP COLUMN IF EXISTS "metricsAt"`);
    await q.query(`ALTER TABLE "nodes" DROP COLUMN IF EXISTS "memPercent"`);
    await q.query(`ALTER TABLE "nodes" DROP COLUMN IF EXISTS "cpuPercent"`);
    await q.query(`ALTER TABLE "devices" DROP COLUMN IF EXISTS "downlinkBytes"`);
    await q.query(`ALTER TABLE "devices" DROP COLUMN IF EXISTS "uplinkBytes"`);
  }
}
