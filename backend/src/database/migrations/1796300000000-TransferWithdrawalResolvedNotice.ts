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
];

const NEW_TYPES = ['PRO_TRANSFER_WITHDRAWAL_RESOLVED'];

/**
 * Aviso in-app (sin email ni push) cuando un admin resuelve un arrepentimiento por transferencia:
 * informa el código y las fechas nuevas de los pagos posteriores que se reajustaron. Solo agrega un
 * valor al enum; no toca datos.
 */
export class TransferWithdrawalResolvedNotice1796300000000 implements MigrationInterface {
  name = 'TransferWithdrawalResolvedNotice1796300000000';

  async up(q: QueryRunner): Promise<void> {
    await this.recreateType(q, [...PREVIOUS_TYPES, ...NEW_TYPES]);
  }

  async down(q: QueryRunner): Promise<void> {
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
