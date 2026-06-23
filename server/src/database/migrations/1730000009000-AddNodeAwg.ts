import { MigrationInterface, QueryRunner } from 'typeorm';

/** Поля для прямого режима через AmneziaWG: URL API провижининга + pubkey пира на устройстве. */
export class AddNodeAwg1730000009000 implements MigrationInterface {
  name = 'AddNodeAwg1730000009000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "nodes" ADD COLUMN IF NOT EXISTS "directApiUrl" varchar(255)`);
    await q.query(`ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "awgPublicKey" varchar(64)`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "devices" DROP COLUMN IF EXISTS "awgPublicKey"`);
    await q.query(`ALTER TABLE "nodes" DROP COLUMN IF EXISTS "directApiUrl"`);
  }
}
