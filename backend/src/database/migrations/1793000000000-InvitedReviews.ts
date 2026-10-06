import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Reseñas por invitación: un cliente que NO contrató por Resuelve puede reseñar al
 * profesional (QR o enlace de su perfil). Se guardan en `reviews` sin solicitud
 * (`request_id` NULL, `verified_work` = false) y quedan separadas de las verificadas:
 * no entran en el rating, la cantidad ni el orden de la búsqueda.
 *
 * Reglas en la base (la regla de negocio completa vive en `invited-review.ts`):
 *  - una reseña por invitación por cliente y profesional (índice único parcial),
 *  - `ck_reviews_kind`: verificada ⇔ con solicitud; invitada ⇔ sin solicitud.
 */
export class InvitedReviews1793000000000 implements MigrationInterface {
  name = 'InvitedReviews1793000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "reviews" ALTER COLUMN "request_id" DROP NOT NULL`);
    await queryRunner.query(
      `ALTER TABLE "reviews" ADD CONSTRAINT "ck_reviews_kind"
         CHECK (("verified_work" AND "request_id" IS NOT NULL) OR (NOT "verified_work" AND "request_id" IS NULL))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_reviews_invited_client_professional"
         ON "reviews" ("professional_id", "client_id") WHERE "request_id" IS NULL`,
    );
  }

  /** Las reseñas por invitación no tienen dónde vivir sin la columna nullable: se borran al volver atrás. */
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_reviews_invited_client_professional"`);
    await queryRunner.query(`ALTER TABLE "reviews" DROP CONSTRAINT IF EXISTS "ck_reviews_kind"`);
    await queryRunner.query(`DELETE FROM "reviews" WHERE "request_id" IS NULL`);
    await queryRunner.query(`ALTER TABLE "reviews" ALTER COLUMN "request_id" SET NOT NULL`);
  }
}
