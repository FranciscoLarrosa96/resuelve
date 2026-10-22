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
  'PRO_PLAN_CHANGE_SCHEDULED',
  'PRO_PLAN_CHANGE_ACTIVATED',
  'PRO_TRANSFER_WITHDRAWAL_RESOLVED',
];

const NEW_TYPES = ['CLIENT_DEMAND_ALERT_MATCHED'];

/**
 * "Avisame cuando haya" (`demand-alerts/`): una persona que no encontró profesionales de un
 * servicio en su localidad pide que le avisemos. Una fila por persona, localidad y servicio;
 * `notified_at` marca que ya se avisó. Suma el tipo de aviso al enum; no toca otros datos.
 */
export class DemandAlerts1796900000000 implements MigrationInterface {
  name = 'DemandAlerts1796900000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE "demand_alerts" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "user_id" uuid NOT NULL,
      "city_id" uuid NOT NULL,
      "service_id" uuid NOT NULL,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "notified_at" timestamptz NULL,
      CONSTRAINT "PK_demand_alerts" PRIMARY KEY ("id"),
      CONSTRAINT "FK_demand_alerts_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
      CONSTRAINT "FK_demand_alerts_city" FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE CASCADE,
      CONSTRAINT "FK_demand_alerts_service" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE
    )`);
    await q.query(
      `CREATE UNIQUE INDEX "UQ_demand_alerts_user_city_service" ON "demand_alerts" ("user_id", "city_id", "service_id")`,
    );
    await q.query(
      `CREATE INDEX "IDX_demand_alerts_pending" ON "demand_alerts" ("city_id", "service_id") WHERE notified_at IS NULL`,
    );
    await this.recreateType(q, [...PREVIOUS_TYPES, ...NEW_TYPES]);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DELETE FROM "notifications" WHERE "type"::text IN (${NEW_TYPES.map((v) => `'${v}'`).join(', ')})`);
    await this.recreateType(q, PREVIOUS_TYPES);
    await q.query(`DROP TABLE "demand_alerts"`);
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
