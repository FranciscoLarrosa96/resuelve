import { MigrationInterface, QueryRunner } from 'typeorm';

/** Valores de `notification_type` antes de esta migración. */
const PREVIOUS_TYPES = [
  'CLIENT_QUOTE_RECEIVED',
  'CLIENT_APPOINTMENT_PROPOSED',
  'CLIENT_APPOINTMENT_RESCHEDULED',
  'PROFESSIONAL_SELECTED',
  'PRO_APPOINTMENT_CONFIRMED',
  'PRO_APPOINTMENT_DECLINED',
  'PRO_REQUEST_RECEIVED',
  'CLIENT_QUOTE_UPDATED',
  'CLIENT_JOB_SCHEDULED',
  'CLIENT_JOB_RESCHEDULED',
  'CLIENT_JOB_STARTED',
  'CLIENT_JOB_CANCELLED',
  'CLIENT_REVIEW_AVAILABLE',
  'PRO_TARGETED_REQUEST_RECEIVED',
  'PRO_REVIEW_RECEIVED',
  'PRO_REFERRAL_REGISTERED',
  'PRO_REFERRAL_ACTIVATED',
  'PRO_BONUS_GRANTED',
  'CLIENT_JOB_CLOSE_DUE',
  'PRO_JOB_CLOSE_DUE',
  'PRO_JOB_COMPLETED',
  'PRO_TRANSFER_APPROVED',
  'PRO_TRANSFER_REJECTED',
  'PRO_TRANSFER_EXPIRING',
  'CLIENT_QUESTION_RECEIVED',
  'PRO_QUESTION_ANSWERED',
  'PRO_WEEKLY_SUMMARY',
  'PRO_SERVICE_SUGGESTION_APPROVED',
  'PRO_SERVICE_SUGGESTION_REJECTED',
];

const NEW_TYPES = ['PRO_PLAN_CHANGE_SCHEDULED', 'PRO_PLAN_CHANGE_ACTIVATED'];

/**
 * Cambio programado PRO → PRO Plus (`plans/plan-change.ts`):
 *  - dos avisos in-app nuevos (programado / activo; sin email ni push);
 *  - el cambio pendiente de una suscripción de Mercado Pago, con sus tres momentos separados:
 *    solicitado (`pending_requested_at`), confirmado por el proveedor (`pending_confirmed_at`) y
 *    activo (se limpian las columnas y `plan_tier` pasa a PRO_PLUS). Nada de esto toca precios,
 *    fechas ni contratos existentes.
 */
export class ScheduledPlanChange1796100000000 implements MigrationInterface {
  name = 'ScheduledPlanChange1796100000000';

  async up(q: QueryRunner): Promise<void> {
    await this.recreateType(q, [...PREVIOUS_TYPES, ...NEW_TYPES]);
    await q.query(`
      ALTER TABLE "billing_subscriptions"
        ADD COLUMN "pending_plan_tier" "public"."plan_tier",
        ADD COLUMN "pending_amount" integer,
        ADD COLUMN "pending_previous_amount" integer,
        ADD COLUMN "pending_requested_at" timestamptz,
        ADD COLUMN "pending_confirmed_at" timestamptz,
        ADD COLUMN "pending_reverting_at" timestamptz,
        ADD COLUMN "pending_attempts" smallint NOT NULL DEFAULT 0,
        ADD COLUMN "pending_last_attempt_at" timestamptz,
        ADD COLUMN "plan_changed_at" timestamptz,
        ADD CONSTRAINT "CHK_billing_subscriptions_pending_change" CHECK (
          (pending_plan_tier IS NULL
            AND pending_amount IS NULL AND pending_previous_amount IS NULL
            AND pending_requested_at IS NULL AND pending_confirmed_at IS NULL AND pending_reverting_at IS NULL)
          OR
          (pending_plan_tier = 'PRO_PLUS'
            AND pending_amount > 0 AND pending_previous_amount > 0 AND pending_amount > pending_previous_amount
            AND pending_requested_at IS NOT NULL)
        )
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE "billing_subscriptions"
        DROP CONSTRAINT "CHK_billing_subscriptions_pending_change",
        DROP COLUMN "plan_changed_at",
        DROP COLUMN "pending_last_attempt_at",
        DROP COLUMN "pending_attempts",
        DROP COLUMN "pending_reverting_at",
        DROP COLUMN "pending_confirmed_at",
        DROP COLUMN "pending_requested_at",
        DROP COLUMN "pending_previous_amount",
        DROP COLUMN "pending_amount",
        DROP COLUMN "pending_plan_tier"
    `);
    await q.query(`DELETE FROM "notifications" WHERE "type"::text IN (${NEW_TYPES.map((v) => `'${v}'`).join(', ')})`);
    await this.recreateType(q, PREVIOUS_TYPES);
  }

  private async recreateType(q: QueryRunner, values: readonly string[]): Promise<void> {
    await q.query(`ALTER TYPE "public"."notification_type" RENAME TO "notification_type_old"`);
    await q.query(`CREATE TYPE "public"."notification_type" AS ENUM(${values.map((v) => `'${v}'`).join(', ')})`);
    await q.query(
      `ALTER TABLE "notifications" ALTER COLUMN "type" TYPE "public"."notification_type" USING "type"::text::"public"."notification_type"`,
    );
    await q.query(`DROP TYPE "public"."notification_type_old"`);
  }
}
