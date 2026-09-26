import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * "Tu mes" real y base de planes:
 *
 * - `professional_profiles.plan_expires_at`: vencimiento opcional de un PRO
 *   temporal. Vencido, el plan efectivo es FREE (se calcula al leer).
 * - `quotes.accepted_at`: cuándo lo aceptó el cliente. Los ya aceptados toman
 *   `updated_at`, que se escribió en la aceptación (después no se editan).
 * - Índices para agregar la actividad del mes de UN profesional sin recorrer
 *   tablas completas: invitaciones por `sent_at`, presupuestos por
 *   `created_at` / `accepted_at` y trabajos realizados por `completed_at`.
 *   (Citas y reseñas ya tenían `(professional_id, fecha)`.)
 */
export class PlansAnalytics1790900000000 implements MigrationInterface {
  name = 'PlansAnalytics1790900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "professional_profiles" ADD "plan_expires_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(`ALTER TABLE "quotes" ADD "accepted_at" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`UPDATE "quotes" SET "accepted_at" = "updated_at" WHERE "status" = 'ACCEPTED'`);
    await queryRunner.query(
      `CREATE INDEX "IDX_request_invitations_professional_sent" ON "request_invitations" ("professional_id", "sent_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_quotes_professional_created" ON "quotes" ("professional_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_quotes_professional_accepted" ON "quotes" ("professional_id", "accepted_at") WHERE "accepted_at" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_service_requests_selected_completed" ON "service_requests" ("selected_professional_id", "completed_at") WHERE "completed_at" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_service_requests_selected_completed"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_quotes_professional_accepted"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_quotes_professional_created"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_request_invitations_professional_sent"`);
    await queryRunner.query(`ALTER TABLE "quotes" DROP COLUMN "accepted_at"`);
    await queryRunner.query(`ALTER TABLE "professional_profiles" DROP COLUMN "plan_expires_at"`);
  }
}
