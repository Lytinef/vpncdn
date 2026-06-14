import { MigrationInterface, QueryRunner } from 'typeorm';

export class Init1730000000000 implements MigrationInterface {
  name = 'Init1730000000000';

  public async up(q: QueryRunner): Promise<void> {
    // Расширение для gen_random_uuid()
    await q.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

    // ── enums ───────────────────────────────────────
    await q.query(`CREATE TYPE "plans_code_enum" AS ENUM ('start','standard','family')`);
    await q.query(
      `CREATE TYPE "subscriptions_status_enum" AS ENUM ('pending','active','past_due','canceled','expired')`,
    );
    await q.query(
      `CREATE TYPE "payments_status_enum" AS ENUM ('pending','waiting_for_capture','succeeded','canceled','failed')`,
    );
    await q.query(
      `CREATE TYPE "payments_purpose_enum" AS ENUM ('initial','renewal','plan_change')`,
    );
    await q.query(`CREATE TYPE "devices_platform_enum" AS ENUM ('android','ios','windows')`);
    await q.query(`CREATE TYPE "bypass_entries_type_enum" AS ENUM ('app','domain')`);
    await q.query(`CREATE TYPE "admin_users_role_enum" AS ENUM ('superadmin','support')`);

    // ── users ───────────────────────────────────────
    await q.query(`
      CREATE TABLE "users" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "telegramId" bigint NOT NULL,
        "username" varchar(64),
        "firstName" varchar(128),
        "lastName" varchar(128),
        "photoUrl" text,
        "languageCode" varchar(8),
        "isBlocked" boolean NOT NULL DEFAULT false,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(`CREATE UNIQUE INDEX "IDX_users_telegramId" ON "users" ("telegramId")`);

    // ── sessions ────────────────────────────────────
    await q.query(`
      CREATE TABLE "sessions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL,
        "refreshTokenHash" varchar(128) NOT NULL,
        "userAgent" varchar(256),
        "platform" varchar(64),
        "expiresAt" timestamptz NOT NULL,
        "revokedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_sessions_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )`);
    await q.query(`CREATE INDEX "IDX_sessions_userId" ON "sessions" ("userId")`);

    // ── plans ───────────────────────────────────────
    await q.query(`
      CREATE TABLE "plans" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "code" "plans_code_enum" NOT NULL,
        "name" varchar(64) NOT NULL,
        "priceKopecks" int NOT NULL,
        "deviceLimit" int NOT NULL,
        "durationDays" int NOT NULL DEFAULT 30,
        "isActive" boolean NOT NULL DEFAULT true,
        "sortOrder" int NOT NULL DEFAULT 0,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(`CREATE UNIQUE INDEX "IDX_plans_code" ON "plans" ("code")`);

    // ── subscriptions ───────────────────────────────
    await q.query(`
      CREATE TABLE "subscriptions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL,
        "planId" uuid NOT NULL,
        "nextPlanId" uuid,
        "status" "subscriptions_status_enum" NOT NULL DEFAULT 'pending',
        "currentPeriodStart" timestamptz,
        "currentPeriodEnd" timestamptz,
        "autoRenew" boolean NOT NULL DEFAULT true,
        "cancelAtPeriodEnd" boolean NOT NULL DEFAULT false,
        "canceledAt" timestamptz,
        "failedRenewals" int NOT NULL DEFAULT 0,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_subscriptions_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_subscriptions_plan" FOREIGN KEY ("planId") REFERENCES "plans"("id"),
        CONSTRAINT "FK_subscriptions_nextPlan" FOREIGN KEY ("nextPlanId") REFERENCES "plans"("id")
      )`);
    await q.query(`CREATE INDEX "IDX_subscriptions_userId" ON "subscriptions" ("userId")`);
    await q.query(`CREATE INDEX "IDX_subscriptions_status" ON "subscriptions" ("status")`);
    await q.query(
      `CREATE INDEX "IDX_subscriptions_periodEnd" ON "subscriptions" ("currentPeriodEnd")`,
    );

    // ── payment_methods ─────────────────────────────
    await q.query(`
      CREATE TABLE "payment_methods" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL,
        "yookassaPaymentMethodId" varchar(128) NOT NULL,
        "title" varchar(64),
        "cardLast4" varchar(4),
        "cardType" varchar(32),
        "isDefault" boolean NOT NULL DEFAULT true,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_payment_methods_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )`);
    await q.query(`CREATE INDEX "IDX_payment_methods_userId" ON "payment_methods" ("userId")`);
    await q.query(
      `CREATE UNIQUE INDEX "IDX_payment_methods_ykId" ON "payment_methods" ("yookassaPaymentMethodId")`,
    );

    // ── payments ────────────────────────────────────
    await q.query(`
      CREATE TABLE "payments" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL,
        "subscriptionId" uuid,
        "paymentMethodId" uuid,
        "yookassaPaymentId" varchar(128),
        "amountKopecks" int NOT NULL,
        "currency" varchar(3) NOT NULL DEFAULT 'RUB',
        "status" "payments_status_enum" NOT NULL DEFAULT 'pending',
        "purpose" "payments_purpose_enum" NOT NULL DEFAULT 'initial',
        "isRecurring" boolean NOT NULL DEFAULT false,
        "description" text,
        "confirmationUrl" text,
        "raw" jsonb,
        "capturedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_payments_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_payments_subscription" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_payments_method" FOREIGN KEY ("paymentMethodId") REFERENCES "payment_methods"("id") ON DELETE SET NULL
      )`);
    await q.query(`CREATE INDEX "IDX_payments_userId" ON "payments" ("userId")`);
    await q.query(`CREATE INDEX "IDX_payments_status" ON "payments" ("status")`);
    await q.query(
      `CREATE UNIQUE INDEX "IDX_payments_ykId" ON "payments" ("yookassaPaymentId") WHERE "yookassaPaymentId" IS NOT NULL`,
    );

    // ── nodes ───────────────────────────────────────
    await q.query(`
      CREATE TABLE "nodes" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" varchar(64) NOT NULL,
        "region" varchar(64),
        "originHost" varchar(255) NOT NULL,
        "cdnDomain" varchar(255) NOT NULL,
        "sni" varchar(255) NOT NULL,
        "port" int NOT NULL DEFAULT 443,
        "wsPath" varchar(128) NOT NULL DEFAULT '/ws',
        "apiUrl" varchar(255),
        "apiSecret" varchar(255),
        "capacity" int NOT NULL DEFAULT 1000,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(`CREATE INDEX "IDX_nodes_cdnDomain" ON "nodes" ("cdnDomain")`);
    await q.query(`CREATE INDEX "IDX_nodes_isActive" ON "nodes" ("isActive")`);

    // ── devices ─────────────────────────────────────
    await q.query(`
      CREATE TABLE "devices" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL,
        "nodeId" uuid,
        "name" varchar(128) NOT NULL,
        "platform" "devices_platform_enum" NOT NULL,
        "hardwareId" varchar(128),
        "xrayUuid" uuid NOT NULL,
        "isActive" boolean NOT NULL DEFAULT true,
        "lastSeenAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_devices_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_devices_node" FOREIGN KEY ("nodeId") REFERENCES "nodes"("id") ON DELETE SET NULL
      )`);
    await q.query(`CREATE INDEX "IDX_devices_userId" ON "devices" ("userId")`);
    await q.query(`CREATE INDEX "IDX_devices_hardwareId" ON "devices" ("hardwareId")`);
    await q.query(`CREATE UNIQUE INDEX "IDX_devices_xrayUuid" ON "devices" ("xrayUuid")`);

    // ── bypass_entries ──────────────────────────────
    await q.query(`
      CREATE TABLE "bypass_entries" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "type" "bypass_entries_type_enum" NOT NULL,
        "value" varchar(255) NOT NULL,
        "title" varchar(128) NOT NULL,
        "category" varchar(64),
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(
      `CREATE UNIQUE INDEX "IDX_bypass_type_value" ON "bypass_entries" ("type","value")`,
    );
    await q.query(`CREATE INDEX "IDX_bypass_isActive" ON "bypass_entries" ("isActive")`);

    // ── admin_users ─────────────────────────────────
    await q.query(`
      CREATE TABLE "admin_users" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "email" varchar(255) NOT NULL,
        "passwordHash" varchar(255) NOT NULL,
        "role" "admin_users_role_enum" NOT NULL DEFAULT 'support',
        "isActive" boolean NOT NULL DEFAULT true,
        "lastLoginAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(`CREATE UNIQUE INDEX "IDX_admin_users_email" ON "admin_users" ("email")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "admin_users"`);
    await q.query(`DROP TABLE IF EXISTS "bypass_entries"`);
    await q.query(`DROP TABLE IF EXISTS "devices"`);
    await q.query(`DROP TABLE IF EXISTS "nodes"`);
    await q.query(`DROP TABLE IF EXISTS "payments"`);
    await q.query(`DROP TABLE IF EXISTS "payment_methods"`);
    await q.query(`DROP TABLE IF EXISTS "subscriptions"`);
    await q.query(`DROP TABLE IF EXISTS "plans"`);
    await q.query(`DROP TABLE IF EXISTS "sessions"`);
    await q.query(`DROP TABLE IF EXISTS "users"`);

    await q.query(`DROP TYPE IF EXISTS "admin_users_role_enum"`);
    await q.query(`DROP TYPE IF EXISTS "bypass_entries_type_enum"`);
    await q.query(`DROP TYPE IF EXISTS "devices_platform_enum"`);
    await q.query(`DROP TYPE IF EXISTS "payments_purpose_enum"`);
    await q.query(`DROP TYPE IF EXISTS "payments_status_enum"`);
    await q.query(`DROP TYPE IF EXISTS "subscriptions_status_enum"`);
    await q.query(`DROP TYPE IF EXISTS "plans_code_enum"`);
  }
}
