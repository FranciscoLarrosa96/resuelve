import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Conserva la intención del flujo dirigido para que su respuesta no quede
 * bloqueada por el cupo general de Free. Las invitaciones históricas quedan
 * como discovery: antes de esta versión no existía una fuente persistida y
 * no es seguro inferirla por cantidad de invitados.
 */
export class Phase1Activation1792000000000 implements MigrationInterface {
  name = 'Phase1Activation1792000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "request_invitations" ADD "targeted" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "professional_profiles" ADD "first_success_celebrated_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(`ALTER TABLE "pro_funnel_events" ADD "context" jsonb`);
    // Éxitos anteriores al rollout no disparan una celebración histórica.
    await queryRunner.query(
      `UPDATE "professional_profiles" SET "first_success_celebrated_at" = now() WHERE "first_success_at" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "quote_quota_usages" (
        "id" BIGSERIAL NOT NULL,
        "professional_id" uuid NOT NULL,
        "request_id" uuid NOT NULL,
        "consumed_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        CONSTRAINT "UQ_quote_quota_usage_professional_request" UNIQUE ("professional_id", "request_id"),
        CONSTRAINT "PK_quote_quota_usages" PRIMARY KEY ("id"),
        CONSTRAINT "FK_quote_quota_usage_professional" FOREIGN KEY ("professional_id") REFERENCES "professional_profiles"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_quote_quota_usage_request" FOREIGN KEY ("request_id") REFERENCES "service_requests"("id") ON DELETE CASCADE
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_quote_quota_usages_professional_consumed" ON "quote_quota_usages" ("professional_id", "consumed_at")`,
    );
    // Conservador y determinístico: preserva el régimen anterior para todo
    // quote posterior al primer éxito; el quote que produjo ese éxito queda fuera.
    await queryRunner.query(
      `INSERT INTO "quote_quota_usages" ("professional_id", "request_id", "consumed_at")
       SELECT q.professional_id, q.request_id, min(q.created_at)
         FROM quotes q
         JOIN professional_profiles p ON p.id = q.professional_id
         JOIN request_invitations i ON i.request_id = q.request_id AND i.professional_id = q.professional_id
        WHERE p.first_success_at IS NOT NULL AND q.created_at >= p.first_success_at AND NOT i.targeted
        GROUP BY q.professional_id, q.request_id
       ON CONFLICT DO NOTHING`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "quote_quota_usages"`);
    await queryRunner.query(`ALTER TABLE "pro_funnel_events" DROP COLUMN "context"`);
    await queryRunner.query(
      `ALTER TABLE "professional_profiles" DROP COLUMN "first_success_celebrated_at"`,
    );
    await queryRunner.query(`ALTER TABLE "request_invitations" DROP COLUMN "targeted"`);
  }
}
