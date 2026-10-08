import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `professional_profiles.invited_reviews_count`: reseñas de clientes invitados visibles (no
 * ocultas). Solo para mostrarlas en tarjetas y resultados ("1 reseña de cliente invitado") en vez
 * de "Sin reseñas todavía"; nunca entra en rating, cantidad ni orden. Lo mantiene
 * `recalculateProfessionalMetrics`.
 */
export class InvitedReviewsCount1794000000000 implements MigrationInterface {
  name = 'InvitedReviewsCount1794000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "professional_profiles" ADD "invited_reviews_count" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `UPDATE "professional_profiles" p
          SET "invited_reviews_count" = r.cnt
         FROM (SELECT professional_id, COUNT(*)::int AS cnt
                 FROM reviews WHERE NOT verified_work AND hidden_at IS NULL
                GROUP BY professional_id) r
        WHERE p.id = r.professional_id`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "professional_profiles" DROP COLUMN "invited_reviews_count"`);
  }
}
