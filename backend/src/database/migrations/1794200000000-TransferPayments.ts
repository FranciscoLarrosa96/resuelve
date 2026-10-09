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
];
const TRANSFER_TYPES = ['PRO_TRANSFER_APPROVED', 'PRO_TRANSFER_REJECTED', 'PRO_TRANSFER_EXPIRING'];

/**
 * Pago de Resuelve PRO por transferencia, confirmado a mano por un admin:
 * - `transfer_payments`: un pedido/pago por período (1, 3 o 6 meses), con un
 *   solo pedido abierto (AWAITING_PROOF / IN_REVIEW) por profesional.
 * - `transfer_accounts`: datos bancarios que publica el admin (historial: el
 *   último registro es el vigente; `enabled = false` apaga la opción).
 * - `professional_profiles.transfer_pro_until`: cuarta fuente de PRO.
 * - Avisos al profesional: confirmado, rechazado y "vence pronto".
 */
export class TransferPayments1794200000000 implements MigrationInterface {
  name = 'TransferPayments1794200000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "professional_profiles" ADD "transfer_pro_until" TIMESTAMP WITH TIME ZONE`);
    await q.query(
      `CREATE TYPE "public"."transfer_payment_status" AS ENUM('AWAITING_PROOF', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED', 'WITHDRAWN')`,
    );
    await q.query(`CREATE TYPE "public"."transfer_payment_origin" AS ENUM('PROFESSIONAL', 'ADMIN')`);
    await q.query(
      `CREATE TABLE "transfer_payments" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "professional_id" uuid NOT NULL,
        "reference" character varying(12) NOT NULL,
        "status" "public"."transfer_payment_status" NOT NULL,
        "origin" "public"."transfer_payment_origin" NOT NULL,
        "months" smallint NOT NULL,
        "amount_ars" integer NOT NULL,
        "base_price_ars" integer NOT NULL,
        "offer_code" character varying(40),
        "proof_public_id" character varying(255),
        "proof_format" character varying(10),
        "proof_uploaded_at" TIMESTAMP WITH TIME ZONE,
        "proof_deleted_at" TIMESTAMP WITH TIME ZONE,
        "reviewed_by_user_id" uuid,
        "reviewed_at" TIMESTAMP WITH TIME ZONE,
        "rejection_reason" character varying(300),
        "admin_note" character varying(300),
        "period_start" TIMESTAMP WITH TIME ZONE,
        "period_end" TIMESTAMP WITH TIME ZONE,
        "withdrawn_at" TIMESTAMP WITH TIME ZONE,
        "refund_destination" character varying(40),
        "refunded_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_transfer_payments_reference" UNIQUE ("reference"),
        CONSTRAINT "ck_transfer_payments_months" CHECK ("months" IN (1, 3, 6)),
        CONSTRAINT "ck_transfer_payments_amount" CHECK ("amount_ars" > 0 AND "base_price_ars" > 0),
        CONSTRAINT "ck_transfer_payments_period" CHECK (
          ("status" IN ('APPROVED', 'WITHDRAWN')) = ("period_start" IS NOT NULL AND "period_end" IS NOT NULL)
        ),
        CONSTRAINT "PK_transfer_payments" PRIMARY KEY ("id"),
        CONSTRAINT "FK_transfer_payments_professional" FOREIGN KEY ("professional_id")
          REFERENCES "professional_profiles"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_transfer_payments_reviewer" FOREIGN KEY ("reviewed_by_user_id")
          REFERENCES "users"("id") ON DELETE SET NULL
      )`,
    );
    await q.query(`CREATE INDEX "IDX_transfer_payments_status" ON "transfer_payments" ("status", "created_at")`);
    await q.query(`CREATE INDEX "IDX_transfer_payments_professional" ON "transfer_payments" ("professional_id")`);
    // Un solo pedido abierto por profesional (dos pestañas no crean dos códigos para el mismo pago).
    await q.query(
      `CREATE UNIQUE INDEX "UQ_transfer_payments_open" ON "transfer_payments" ("professional_id")
        WHERE "status" IN ('AWAITING_PROOF', 'IN_REVIEW')`,
    );
    await q.query(
      `CREATE TABLE "transfer_accounts" (
        "id" SERIAL NOT NULL,
        "enabled" boolean NOT NULL,
        "holder" character varying(80) NOT NULL,
        "alias" character varying(20) NOT NULL,
        "cbu" character varying(22),
        "bank" character varying(60),
        "cuit" character varying(13),
        "changed_by" character varying(80) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_transfer_accounts" PRIMARY KEY ("id")
      )`,
    );
    await this.recreateType(q, [...PREVIOUS_TYPES, ...TRANSFER_TYPES]);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DELETE FROM "notifications" WHERE "type"::text = ANY($1)`, [TRANSFER_TYPES]);
    await this.recreateType(q, PREVIOUS_TYPES);
    await q.query(`DROP TABLE "transfer_accounts"`);
    await q.query(`DROP TABLE "transfer_payments"`);
    await q.query(`DROP TYPE "public"."transfer_payment_origin"`);
    await q.query(`DROP TYPE "public"."transfer_payment_status"`);
    await q.query(`ALTER TABLE "professional_profiles" DROP COLUMN "transfer_pro_until"`);
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
