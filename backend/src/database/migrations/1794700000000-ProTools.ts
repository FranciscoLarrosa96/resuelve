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
];
const QUESTION_TYPES = ['CLIENT_QUESTION_RECEIVED', 'PRO_QUESTION_ANSWERED'];

/**
 * Herramientas del profesional:
 * - `quote_templates`: plantillas privadas de presupuesto (tope en `quote-template-rules.ts`).
 * - `reviews.professional_reply`: respuesta pública del profesional a una reseña.
 * - `request_questions`: consultas antes de presupuestar y la respuesta del cliente,
 *   con sus avisos (`CLIENT_QUESTION_RECEIVED`, `PRO_QUESTION_ANSWERED`).
 */
export class ProTools1794700000000 implements MigrationInterface {
  name = 'ProTools1794700000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE "quote_templates" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "professional_id" uuid NOT NULL,
        "name" character varying(60) NOT NULL,
        "description" character varying(2000) NOT NULL,
        "note" character varying(1000),
        "estimated_duration" character varying(80),
        "labor_amount" integer NOT NULL,
        "materials_amount" integer NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_quote_templates" PRIMARY KEY ("id"),
        CONSTRAINT "ck_quote_templates_amounts" CHECK ("labor_amount" >= 0 AND "materials_amount" >= 0),
        CONSTRAINT "FK_quote_templates_professional" FOREIGN KEY ("professional_id")
          REFERENCES "professional_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )`);
    await q.query(
      `CREATE INDEX "IDX_quote_templates_professional" ON "quote_templates" ("professional_id", "created_at")`,
    );

    await q.query(`ALTER TABLE "reviews" ADD "professional_reply" character varying(500)`);
    await q.query(`ALTER TABLE "reviews" ADD "professional_replied_at" TIMESTAMP WITH TIME ZONE`);

    await q.query(`
      CREATE TABLE "request_questions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "request_id" uuid NOT NULL,
        "professional_id" uuid NOT NULL,
        "question" character varying(500) NOT NULL,
        "answer" character varying(500),
        "asked_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "answered_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_request_questions" PRIMARY KEY ("id"),
        CONSTRAINT "ck_request_questions_answer" CHECK (("answer" IS NULL) = ("answered_at" IS NULL)),
        CONSTRAINT "FK_request_questions_request" FOREIGN KEY ("request_id")
          REFERENCES "service_requests"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_request_questions_professional" FOREIGN KEY ("professional_id")
          REFERENCES "professional_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )`);
    await q.query(
      `CREATE INDEX "IDX_request_questions_request" ON "request_questions" ("request_id", "professional_id", "asked_at")`,
    );
    await this.recreateType(q, [...PREVIOUS_TYPES, ...QUESTION_TYPES]);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DELETE FROM "notifications" WHERE "type"::text = ANY($1)`, [QUESTION_TYPES]);
    await this.recreateType(q, PREVIOUS_TYPES);
    await q.query(`DROP TABLE "request_questions"`);
    await q.query(`ALTER TABLE "reviews" DROP COLUMN "professional_replied_at"`);
    await q.query(`ALTER TABLE "reviews" DROP COLUMN "professional_reply"`);
    await q.query(`DROP TABLE "quote_templates"`);
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
