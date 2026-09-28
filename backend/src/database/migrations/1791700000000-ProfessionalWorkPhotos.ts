import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * "Trabajos realizados": `professional_work_photos`, hasta 5 fotos públicas
 * por perfil (el máximo lo garantiza el backend con lock del perfil).
 *
 * - `public_id` único: confirmar dos veces la misma subida no la duplica.
 * - Solo publicId + URL de entrega; nunca ubicación, cliente ni el binario.
 * - `portfolio_items` (legacy, solo datos de ejemplo del seed) queda como
 *   estaba: no se borra ni se migra, y ya no se expone.
 */
export class ProfessionalWorkPhotos1791700000000 implements MigrationInterface {
  name = 'ProfessionalWorkPhotos1791700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "professional_work_photos" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "professional_id" uuid NOT NULL,
        "public_id" character varying(255) NOT NULL,
        "image_url" character varying(500) NOT NULL,
        "sort_order" integer NOT NULL DEFAULT 0,
        "caption" character varying(80),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_professional_work_photos" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_professional_work_photos_public_id" UNIQUE ("public_id"),
        CONSTRAINT "FK_professional_work_photos_professional" FOREIGN KEY ("professional_id")
          REFERENCES "professional_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )`);
    await queryRunner.query(
      `CREATE INDEX "IDX_professional_work_photos_order" ON "professional_work_photos" ("professional_id", "sort_order")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_professional_work_photos_order"`);
    await queryRunner.query(`DROP TABLE "professional_work_photos"`);
  }
}
