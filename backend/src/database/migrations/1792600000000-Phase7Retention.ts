import { MigrationInterface, QueryRunner } from 'typeorm';

const PREVIOUS_TYPES = [
  'CLIENT_QUOTE_RECEIVED',
  'CLIENT_APPOINTMENT_PROPOSED',
  'CLIENT_APPOINTMENT_RESCHEDULED',
  'PROFESSIONAL_SELECTED',
  'PRO_APPOINTMENT_CONFIRMED',
  'PRO_APPOINTMENT_DECLINED',
  'PRO_REQUEST_RECEIVED',
];

const NEW_TYPES = [
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
];

/**
 * Fase 7 · Retención.
 *
 * - `notification_type` suma los eventos del centro de notificaciones (se
 *   recrea el tipo, como en `ActionableNotificationsAvatar`, para poder usar
 *   los valores en la misma transacción y revertir limpio).
 * - `notifications`: `request_id` pasa a ser opcional (referidos no tienen
 *   solicitud), `referral_id` para esos avisos, `available_at` (un aviso de
 *   oportunidad demorada no existe para quien recibe hasta esa hora, sin cron),
 *   `opened_at` (se abrió desde el centro: tasa de apertura) y `payload`
 *   (números sin PII, p. ej. los días de PRO).
 * - `professional_favorites`: "Guardar profesional", único por cliente + profesional.
 * - `pro_funnel_event_type` suma los eventos de retención con profesional
 *   (PostgreSQL no quita valores de un enum: al revertir se borran las filas
 *   y los valores quedan sin uso).
 */
export class Phase7Retention1792600000000 implements MigrationInterface {
  name = 'Phase7Retention1792600000000';

  public async up(q: QueryRunner): Promise<void> {
    await this.recreateType(q, [...PREVIOUS_TYPES, ...NEW_TYPES]);
    await q.query(`ALTER TABLE "notifications" ALTER COLUMN "request_id" DROP NOT NULL`);
    await q.query(`ALTER TABLE "notifications"
      ADD COLUMN "referral_id" uuid,
      ADD COLUMN "available_at" timestamptz,
      ADD COLUMN "opened_at" timestamptz,
      ADD COLUMN "payload" jsonb`);
    await q.query(`ALTER TABLE "notifications"
      ADD CONSTRAINT "FK_notifications_referral" FOREIGN KEY ("referral_id")
        REFERENCES "referrals"("id") ON DELETE CASCADE`);
    await q.query(
      `CREATE INDEX "IDX_notifications_user_created" ON "notifications" ("user_id", "created_at" DESC, "id" DESC)`,
    );
    await q.query(
      `CREATE INDEX "IDX_notifications_user_read" ON "notifications" ("user_id", "read_at")`,
    );

    await q.query(`CREATE TABLE "professional_favorites" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "client_id" uuid NOT NULL,
      "professional_id" uuid NOT NULL,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_professional_favorites" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_professional_favorites_client_professional" UNIQUE ("client_id", "professional_id"),
      CONSTRAINT "FK_professional_favorites_client" FOREIGN KEY ("client_id")
        REFERENCES "users"("id") ON DELETE CASCADE,
      CONSTRAINT "FK_professional_favorites_professional" FOREIGN KEY ("professional_id")
        REFERENCES "professional_profiles"("id") ON DELETE CASCADE)`);
    await q.query(
      `CREATE INDEX "IDX_professional_favorites_client_created" ON "professional_favorites" ("client_id", "created_at" DESC)`,
    );
    await q.query(
      `CREATE INDEX "IDX_professional_favorites_professional" ON "professional_favorites" ("professional_id")`,
    );

    for (const type of ['PROFESSIONAL_SAVED', 'PROFESSIONAL_UNSAVED', 'REHIRE_SUBMITTED', 'REVIEW_SUBMITTED']) {
      await q.query(`ALTER TYPE "public"."pro_funnel_event_type" ADD VALUE IF NOT EXISTS '${type}'`);
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      `DELETE FROM "pro_funnel_events" WHERE "type"::text IN ('PROFESSIONAL_SAVED', 'PROFESSIONAL_UNSAVED', 'REHIRE_SUBMITTED', 'REVIEW_SUBMITTED')`,
    );
    await q.query(`DROP TABLE "professional_favorites"`);
    await q.query(`DROP INDEX "public"."IDX_notifications_user_read"`);
    await q.query(`DROP INDEX "public"."IDX_notifications_user_created"`);
    await q.query(`DELETE FROM "notifications" WHERE "request_id" IS NULL OR "type"::text = ANY($1)`, [
      NEW_TYPES,
    ]);
    await q.query(`ALTER TABLE "notifications" DROP CONSTRAINT "FK_notifications_referral"`);
    await q.query(`ALTER TABLE "notifications"
      DROP COLUMN "payload",
      DROP COLUMN "opened_at",
      DROP COLUMN "available_at",
      DROP COLUMN "referral_id"`);
    await q.query(`ALTER TABLE "notifications" ALTER COLUMN "request_id" SET NOT NULL`);
    await this.recreateType(q, PREVIOUS_TYPES);
  }

  private async recreateType(q: QueryRunner, values: string[]): Promise<void> {
    await q.query(`ALTER TYPE "public"."notification_type" RENAME TO "notification_type_old"`);
    await q.query(`CREATE TYPE "public"."notification_type" AS ENUM(${values.map((v) => `'${v}'`).join(', ')})`);
    await q.query(
      `ALTER TABLE "notifications" ALTER COLUMN "type" TYPE "public"."notification_type" USING "type"::text::"public"."notification_type"`,
    );
    await q.query(`DROP TYPE "public"."notification_type_old"`);
  }
}
