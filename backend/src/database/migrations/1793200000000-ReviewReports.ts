import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Reportar reseñas. Cualquier persona con cuenta puede reportar una reseña pública; un administrador
 * la revisa a mano (`npm run reviews:moderation`) y la oculta o descarta el reporte.
 *
 *  - `reviews.hidden_at`: una reseña oculta deja de mostrarse y de contar (rating, cantidad, Tu mes),
 *    pero NO se borra: sigue ocupando el lugar de esa persona (no puede volver a reseñar) y se puede restaurar.
 *  - `review_reports`: una por persona y reseña; `status` OPEN → HIDDEN | DISMISSED.
 */
export class ReviewReports1793200000000 implements MigrationInterface {
  name = 'ReviewReports1793200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "reviews" ADD COLUMN "hidden_at" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`ALTER TABLE "reviews" ADD COLUMN "hidden_reason" character varying(300)`);
    await queryRunner.query(
      `CREATE TABLE "review_reports" (
         "id" uuid NOT NULL DEFAULT gen_random_uuid(),
         "review_id" uuid NOT NULL,
         "reporter_id" uuid NOT NULL,
         "reason" character varying(12) NOT NULL,
         "details" character varying(500),
         "status" character varying(12) NOT NULL DEFAULT 'OPEN',
         "resolved_at" TIMESTAMP WITH TIME ZONE,
         "resolved_by" character varying(80),
         "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         CONSTRAINT "PK_review_reports" PRIMARY KEY ("id"),
         CONSTRAINT "ck_review_reports_reason" CHECK ("reason" IN ('FAKE', 'OFFENSIVE', 'SPAM', 'OTHER')),
         CONSTRAINT "ck_review_reports_status" CHECK ("status" IN ('OPEN', 'HIDDEN', 'DISMISSED')),
         CONSTRAINT "FK_review_reports_review" FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE CASCADE,
         CONSTRAINT "FK_review_reports_reporter" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_review_reports_review_reporter" ON "review_reports" ("review_id", "reporter_id")`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_review_reports_status" ON "review_reports" ("status", "created_at")`);
  }

  /** Al volver atrás las reseñas ocultas vuelven a mostrarse (la columna deja de existir). */
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "review_reports"`);
    await queryRunner.query(`ALTER TABLE "reviews" DROP COLUMN "hidden_reason"`);
    await queryRunner.query(`ALTER TABLE "reviews" DROP COLUMN "hidden_at"`);
  }
}
