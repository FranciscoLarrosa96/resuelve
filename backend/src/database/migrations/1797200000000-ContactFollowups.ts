import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * «¿Lo contrataste?» (`contact-followups/contact-followups.ts`): una fila por cliente con
 * sesión y profesional cuando toca WhatsApp o Llamar. Es privada del cliente: el
 * profesional nunca la ve y no cambia las métricas anónimas (`exposure_events`).
 */
export class ContactFollowups1797200000000 implements MigrationInterface {
  name = 'ContactFollowups1797200000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE "contact_followups" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "user_id" uuid NOT NULL,
      "professional_id" uuid NOT NULL,
      "channel" character varying(16) NOT NULL,
      "contacted_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      "answered_at" TIMESTAMP WITH TIME ZONE,
      "answer" character varying(16),
      CONSTRAINT "PK_contact_followups" PRIMARY KEY ("id"),
      CONSTRAINT "uq_contact_followups_user_professional" UNIQUE ("user_id", "professional_id"),
      CONSTRAINT "ck_contact_followups_channel" CHECK ("channel" IN ('WHATSAPP', 'PHONE')),
      CONSTRAINT "ck_contact_followups_answer" CHECK ("answer" IS NULL OR "answer" IN ('HIRED', 'NOT_HIRED')),
      CONSTRAINT "FK_contact_followups_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
      CONSTRAINT "FK_contact_followups_professional" FOREIGN KEY ("professional_id") REFERENCES "professional_profiles"("id") ON DELETE CASCADE
    )`);
    await q.query(
      `CREATE INDEX "ix_contact_followups_pending" ON "contact_followups" ("user_id", "contacted_at") WHERE "answered_at" IS NULL`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "contact_followups"`);
  }
}
