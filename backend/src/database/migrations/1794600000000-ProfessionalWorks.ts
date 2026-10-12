import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * "Trabajos realizados" por trabajo: `professional_works` (nombre, descripción
 * opcional, mes y año) y cada foto en su trabajo (`work_id`).
 *
 * Las fotos sueltas anteriores no se pierden ni se reparten: cada perfil con
 * fotos recibe UN trabajo con todas, en el mismo orden ("Mis trabajos", o
 * "Trabajos anteriores" si tenía más de 5), fechado en el mes de la primera
 * foto (Argentina). El profesional lo renombra o reparte cuando quiera.
 * `featured` (foto principal suelta) queda legacy: la portada es la primera foto.
 */
export class ProfessionalWorks1794600000000 implements MigrationInterface {
  name = 'ProfessionalWorks1794600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "professional_works" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "professional_id" uuid NOT NULL,
        "title" character varying(60) NOT NULL,
        "description" character varying(160),
        "done_on" date NOT NULL,
        "archived_by_plan" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_professional_works" PRIMARY KEY ("id"),
        CONSTRAINT "FK_professional_works_professional" FOREIGN KEY ("professional_id")
          REFERENCES "professional_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )`);
    await queryRunner.query(
      `CREATE INDEX "IDX_professional_works_professional" ON "professional_works" ("professional_id", "done_on")`,
    );

    await queryRunner.query(`ALTER TABLE "professional_work_photos" ADD "work_id" uuid`);
    await queryRunner.query(`
      INSERT INTO "professional_works" ("professional_id", "title", "done_on", "created_at")
      SELECT "professional_id",
             CASE WHEN count(*) > 5 THEN 'Trabajos anteriores' ELSE 'Mis trabajos' END,
             date_trunc('month', min("created_at") AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,
             min("created_at")
        FROM "professional_work_photos"
       GROUP BY "professional_id"`);
    await queryRunner.query(`
      UPDATE "professional_work_photos" AS photo SET "work_id" = work."id"
        FROM "professional_works" AS work
       WHERE work."professional_id" = photo."professional_id"`);
    await queryRunner.query(`ALTER TABLE "professional_work_photos" ALTER COLUMN "work_id" SET NOT NULL`);
    await queryRunner.query(`
      ALTER TABLE "professional_work_photos" ADD CONSTRAINT "FK_professional_work_photos_work"
        FOREIGN KEY ("work_id") REFERENCES "professional_works"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(
      `CREATE INDEX "IDX_professional_work_photos_work" ON "professional_work_photos" ("work_id", "sort_order")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Las fotos quedan sueltas en el perfil, en el orden de sus trabajos (más reciente primero).
    await queryRunner.query(`
      WITH ranked AS (
        SELECT photo."id", row_number() OVER (
                 PARTITION BY photo."professional_id"
                 ORDER BY work."done_on" DESC, work."created_at" DESC, photo."sort_order", photo."created_at"
               ) - 1 AS position
          FROM "professional_work_photos" AS photo
          JOIN "professional_works" AS work ON work."id" = photo."work_id"
      )
      UPDATE "professional_work_photos" AS photo SET "sort_order" = ranked.position
        FROM ranked WHERE photo."id" = ranked."id"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_professional_work_photos_work"`);
    await queryRunner.query(`ALTER TABLE "professional_work_photos" DROP CONSTRAINT "FK_professional_work_photos_work"`);
    await queryRunner.query(`ALTER TABLE "professional_work_photos" DROP COLUMN "work_id"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_professional_works_professional"`);
    await queryRunner.query(`DROP TABLE "professional_works"`);
  }
}
