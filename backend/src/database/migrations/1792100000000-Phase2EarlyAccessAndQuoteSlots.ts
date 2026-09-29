import { MigrationInterface, QueryRunner } from 'typeorm';

/** Fase 2: disponibilidad por invitación y telemetría del tope de quotes. */
export class Phase2EarlyAccessAndQuoteSlots1792100000000 implements MigrationInterface {
  name = 'Phase2EarlyAccessAndQuoteSlots1792100000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "request_invitations" ADD COLUMN IF NOT EXISTS "available_at" TIMESTAMP WITH TIME ZONE`,
    );
    // Solicitudes históricas mantienen su visibilidad original, sin un delay retroactivo.
    await queryRunner.query(`UPDATE "request_invitations" SET "available_at" = "sent_at" WHERE "available_at" IS NULL`);
    await queryRunner.query(`ALTER TABLE "request_invitations" ALTER COLUMN "available_at" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "request_invitations" ALTER COLUMN "available_at" SET DEFAULT now()`);
    await queryRunner.query(
      `ALTER TABLE "request_invitations" ADD COLUMN IF NOT EXISTS "attribution_source" character varying(32) NOT NULL DEFAULT 'OTHER'`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_request_invitations_professional_available" ON "request_invitations" ("professional_id", "available_at", "status")`,
    );
    await queryRunner.query(`ALTER TYPE "public"."pro_funnel_event_type" ADD VALUE IF NOT EXISTS 'REQUEST_SLOT_FILLED'`);
    await queryRunner.query(`ALTER TYPE "public"."pro_funnel_event_type" ADD VALUE IF NOT EXISTS 'REQUEST_SLOTS_FULL'`);
  }

  async down(): Promise<void> {
    // These additions are backward compatible, and keeping them preserves recorded
    // availability, attribution and slot events when rolling back application code.
    // The up migration uses IF NOT EXISTS so run -> revert -> run remains safe.
  }
}
