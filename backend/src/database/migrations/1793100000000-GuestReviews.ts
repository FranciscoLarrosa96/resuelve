import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Reseña por invitación SIN cuenta: quien escanea el QR o abre el enlace deja su nombre de pila y su
 * correo, sin registrarse. El correo es privado (nunca sale en una API pública) y evita que la misma
 * persona reseñe dos veces al mismo profesional (índice único por profesional + correo en minúsculas).
 *
 *  - `client_id` pasa a ser opcional: una reseña por invitación es de una cuenta (`client_id`) o de un
 *    invitado (`reviewer_name` + `reviewer_email`); una verificada sigue exigiendo cuenta y trabajo.
 *  - `ck_reviews_kind` se reemplaza para reflejar eso.
 */
export class GuestReviews1793100000000 implements MigrationInterface {
  name = 'GuestReviews1793100000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "reviews" ALTER COLUMN "client_id" DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE "reviews" ADD COLUMN "reviewer_name" character varying(60)`);
    await queryRunner.query(`ALTER TABLE "reviews" ADD COLUMN "reviewer_email" character varying(254)`);
    await queryRunner.query(`ALTER TABLE "reviews" DROP CONSTRAINT "ck_reviews_kind"`);
    await queryRunner.query(
      `ALTER TABLE "reviews" ADD CONSTRAINT "ck_reviews_kind" CHECK (
         ("verified_work" AND "request_id" IS NOT NULL AND "client_id" IS NOT NULL)
         OR (NOT "verified_work" AND "request_id" IS NULL
             AND ("client_id" IS NOT NULL OR ("reviewer_name" IS NOT NULL AND "reviewer_email" IS NOT NULL))))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_reviews_guest_email_professional"
         ON "reviews" ("professional_id", lower("reviewer_email")) WHERE "reviewer_email" IS NOT NULL`,
    );
  }

  /** Las reseñas de invitados no tienen dónde vivir sin las columnas nuevas: se borran al volver atrás. */
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_reviews_guest_email_professional"`);
    await queryRunner.query(`DELETE FROM "reviews" WHERE "client_id" IS NULL`);
    await queryRunner.query(`ALTER TABLE "reviews" DROP CONSTRAINT "ck_reviews_kind"`);
    await queryRunner.query(
      `ALTER TABLE "reviews" ADD CONSTRAINT "ck_reviews_kind"
         CHECK (("verified_work" AND "request_id" IS NOT NULL) OR (NOT "verified_work" AND "request_id" IS NULL))`,
    );
    await queryRunner.query(`ALTER TABLE "reviews" DROP COLUMN "reviewer_email"`);
    await queryRunner.query(`ALTER TABLE "reviews" DROP COLUMN "reviewer_name"`);
    await queryRunner.query(`ALTER TABLE "reviews" ALTER COLUMN "client_id" SET NOT NULL`);
  }
}
