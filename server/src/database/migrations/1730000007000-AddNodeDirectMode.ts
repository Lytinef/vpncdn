import { MigrationInterface, QueryRunner } from 'typeorm';

/** Поля прямого режима (мимо CDN, VLESS+Vision+Reality) у узла. */
export class AddNodeDirectMode1730000007000 implements MigrationInterface {
  name = 'AddNodeDirectMode1730000007000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "nodes" ADD COLUMN IF NOT EXISTS "directHost" varchar(255)`);
    await q.query(`ALTER TABLE "nodes" ADD COLUMN IF NOT EXISTS "directPort" integer NOT NULL DEFAULT 2053`);
    await q.query(`ALTER TABLE "nodes" ADD COLUMN IF NOT EXISTS "directPublicKey" varchar(255)`);
    await q.query(`ALTER TABLE "nodes" ADD COLUMN IF NOT EXISTS "directShortId" varchar(64)`);
    await q.query(`ALTER TABLE "nodes" ADD COLUMN IF NOT EXISTS "directSni" varchar(255)`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "nodes" DROP COLUMN IF EXISTS "directSni"`);
    await q.query(`ALTER TABLE "nodes" DROP COLUMN IF EXISTS "directShortId"`);
    await q.query(`ALTER TABLE "nodes" DROP COLUMN IF EXISTS "directPublicKey"`);
    await q.query(`ALTER TABLE "nodes" DROP COLUMN IF EXISTS "directPort"`);
    await q.query(`ALTER TABLE "nodes" DROP COLUMN IF EXISTS "directHost"`);
  }
}
