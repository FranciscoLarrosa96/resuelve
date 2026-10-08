import { MigrationInterface, QueryRunner } from 'typeorm';

/** Valores de `notification_type` antes de esta migración (Fase 7). */
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
];

/**
 * `PRO_JOB_COMPLETED`: el cliente marcó el trabajo como realizado y al
 * profesional le llega "Pedile la reseña". Se recrea el tipo (como en Fase 7)
 * para poder revertir limpio: al revertir se borran esos avisos.
 */
export class ProJobCompletedNotification1793900000000 implements MigrationInterface {
  name = 'ProJobCompletedNotification1793900000000';

  async up(q: QueryRunner): Promise<void> {
    await this.recreateType(q, [...PREVIOUS_TYPES, 'PRO_JOB_COMPLETED']);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DELETE FROM "notifications" WHERE "type" = 'PRO_JOB_COMPLETED'`);
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
