import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * PRO que convierte:
 *
 * - `exposure_events`: apariciones en búsquedas y visitas al perfil (anónimas,
 *   sin usuario ni IP). `dedupe_key` único: reintentos y rerenders no suman.
 *   Índice por profesional + tipo + fecha para agregar el mes de UNO solo.
 * - Se quita el contador `monthly_request_usage` / `usage_period_start`: el cupo
 *   FREE ahora se deriva de `quotes` (solicitudes distintas presupuestadas por
 *   primera vez en el mes), así no hay contador que se desincronice ni cupo que
 *   se "libere" retirando presupuestos. El down recrea las columnas en 0.
 */
export class ProExposure1791000000000 implements MigrationInterface {
  name = 'ProExposure1791000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."exposure_event_type" AS ENUM('SEARCH_IMPRESSION', 'PROFILE_VIEW')`,
    );
    await queryRunner.query(
      `CREATE TABLE "exposure_events" ("id" BIGSERIAL NOT NULL, "type" "public"."exposure_event_type" NOT NULL, "professional_id" uuid NOT NULL, "service_id" uuid, "zone_id" uuid, "is_urgent" boolean, "is_featured_placement" boolean NOT NULL DEFAULT false, "page" smallint, "session_key_hash" character(64) NOT NULL, "dedupe_key" character(64) NOT NULL, "occurred_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_7775deed9c269db692ace7c8bfd" UNIQUE ("dedupe_key"), CONSTRAINT "PK_40c842999def29ba23d5dfebd08" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_exposure_events_professional_type_occurred" ON "exposure_events" ("professional_id", "type", "occurred_at")`,
    );
    await queryRunner.query(
      `ALTER TABLE "exposure_events" ADD CONSTRAINT "FK_bb335e9901cfd10f2dfe6d53c02" FOREIGN KEY ("professional_id") REFERENCES "professional_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(`ALTER TABLE "professional_profiles" DROP COLUMN "monthly_request_usage"`);
    await queryRunner.query(`ALTER TABLE "professional_profiles" DROP COLUMN "usage_period_start"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "professional_profiles" ADD "usage_period_start" date`);
    await queryRunner.query(
      `ALTER TABLE "professional_profiles" ADD "monthly_request_usage" integer NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(`ALTER TABLE "exposure_events" DROP CONSTRAINT "FK_bb335e9901cfd10f2dfe6d53c02"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_exposure_events_professional_type_occurred"`);
    await queryRunner.query(`DROP TABLE "exposure_events"`);
    await queryRunner.query(`DROP TYPE "public"."exposure_event_type"`);
  }
}
