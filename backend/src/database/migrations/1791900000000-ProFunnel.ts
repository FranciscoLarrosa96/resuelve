import { MigrationInterface, QueryRunner } from 'typeorm';

const TYPES = [
  'PROFESSIONAL_REGISTERED',
  'PROFILE_COMPLETED',
  'FIRST_COMPATIBLE_OPPORTUNITY_RECEIVED',
  'FIRST_QUOTE_SENT',
  'FIRST_QUOTE_ACCEPTED',
  'FIRST_SUCCESS_REACHED',
  'PRO_PLAN_VIEWED',
  'PRO_CTA_CLICKED',
  'PRO_CHECKOUT_STARTED',
  'PRO_PAYMENT_APPROVED',
  'PRO_CANCELLED',
  'PRO_RENEWED',
  'FREE_QUOTE_USED',
  'FREE_QUOTE_LIMIT_REACHED',
  'FREE_BLOCKED_OPPORTUNITY_VIEWED',
  'EARLY_OPPORTUNITY_DELIVERED',
  'DELAYED_OPPORTUNITY_UNLOCKED',
  'FEATURED_ATTRIBUTED_REQUEST',
];

/**
 * Fase 0 de PRO 2.0 — medir:
 *
 * - `professional_profiles.first_success_at`: primer presupuesto aceptado por
 *   un cliente (inmutable: se escribe una vez y nunca vuelve a null). Se
 *   completa con el primer `accepted_at` real de cada profesional.
 * - `pro_funnel_events`: embudo del profesional, sin datos personales,
 *   `dedupe_key` único. Se reconstruye lo que ya se puede probar con datos
 *   reales (alta, primer presupuesto, primer aceptado, primera invitación);
 *   "perfil completo" y lo de PRO empiezan a contarse desde ahora.
 */
export class ProFunnel1791900000000 implements MigrationInterface {
  name = 'ProFunnel1791900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "professional_profiles" ADD "first_success_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `UPDATE "professional_profiles" p SET "first_success_at" = f.first_at
         FROM (SELECT professional_id, min(accepted_at) AS first_at FROM quotes
                WHERE accepted_at IS NOT NULL GROUP BY professional_id) f
        WHERE f.professional_id = p.id`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."pro_funnel_event_type" AS ENUM(${TYPES.map((t) => `'${t}'`).join(', ')})`,
    );
    await queryRunner.query(
      `CREATE TABLE "pro_funnel_events" ("id" BIGSERIAL NOT NULL, "type" "public"."pro_funnel_event_type" NOT NULL, "professional_id" uuid NOT NULL, "ref" character varying(64), "dedupe_key" character varying(200) NOT NULL, "occurred_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_pro_funnel_events_dedupe_key" UNIQUE ("dedupe_key"), CONSTRAINT "PK_pro_funnel_events" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_pro_funnel_events_type_occurred" ON "pro_funnel_events" ("type", "occurred_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_pro_funnel_events_professional_type" ON "pro_funnel_events" ("professional_id", "type")`,
    );
    await queryRunner.query(
      `ALTER TABLE "pro_funnel_events" ADD CONSTRAINT "FK_pro_funnel_events_professional" FOREIGN KEY ("professional_id") REFERENCES "professional_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    // Historial real (mismo formato de clave que `funnelDedupeKey` para eventos ONCE).
    const backfill = (type: string, select: string) =>
      queryRunner.query(
        `INSERT INTO "pro_funnel_events" ("type", "professional_id", "dedupe_key", "occurred_at")
         SELECT '${type}', x.professional_id, '${type}:' || x.professional_id, x.at FROM (${select}) x
         ON CONFLICT DO NOTHING`,
      );
    await backfill(
      'PROFESSIONAL_REGISTERED',
      `SELECT id AS professional_id, created_at AS at FROM professional_profiles`,
    );
    await backfill(
      'FIRST_COMPATIBLE_OPPORTUNITY_RECEIVED',
      `SELECT professional_id, min(sent_at) AS at FROM request_invitations GROUP BY professional_id`,
    );
    await backfill(
      'FIRST_QUOTE_SENT',
      `SELECT professional_id, min(created_at) AS at FROM quotes GROUP BY professional_id`,
    );
    await backfill(
      'FIRST_QUOTE_ACCEPTED',
      `SELECT id AS professional_id, first_success_at AS at FROM professional_profiles WHERE first_success_at IS NOT NULL`,
    );
    await backfill(
      'FIRST_SUCCESS_REACHED',
      `SELECT id AS professional_id, first_success_at AS at FROM professional_profiles WHERE first_success_at IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "pro_funnel_events" DROP CONSTRAINT "FK_pro_funnel_events_professional"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_pro_funnel_events_professional_type"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_pro_funnel_events_type_occurred"`);
    await queryRunner.query(`DROP TABLE "pro_funnel_events"`);
    await queryRunner.query(`DROP TYPE "public"."pro_funnel_event_type"`);
    await queryRunner.query(`ALTER TABLE "professional_profiles" DROP COLUMN "first_success_at"`);
  }
}
