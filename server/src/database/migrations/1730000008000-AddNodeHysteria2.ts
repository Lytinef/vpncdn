import { MigrationInterface, QueryRunner } from 'typeorm';

/** Поля прямого режима через Hysteria2 (протокол + pinSHA256). */
export class AddNodeHysteria21730000008000 implements MigrationInterface {
  name = 'AddNodeHysteria21730000008000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "nodes" ADD COLUMN IF NOT EXISTS "directProtocol" varchar(16) NOT NULL DEFAULT 'hysteria2'`,
    );
    await q.query(`ALTER TABLE "nodes" ADD COLUMN IF NOT EXISTS "directCertPin" varchar(128)`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "nodes" DROP COLUMN IF EXISTS "directCertPin"`);
    await q.query(`ALTER TABLE "nodes" DROP COLUMN IF EXISTS "directProtocol"`);
  }
}
