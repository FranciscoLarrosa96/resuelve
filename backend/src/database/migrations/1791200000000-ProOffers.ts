import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ofertas de PRO (bienvenida `PRO_FIRST_MONTH_20`, sin billing todavía):
 *
 * - `pro_offer_redemptions`: uso real, unique profesional + código (una sola
 *   redención aunque haya dos intentos simultáneos), con los montos aplicados.
 * - `pro_offer_events`: embudo mostrada / click / usada, sin datos personales;
 *   `dedupe_key` único.
 * - `professional_profiles.first_paid_pro_at`: ya pagó PRO (no vuelve a tener
 *   bienvenida). Se completa para quienes HOY tienen PRO: sin historial previo,
 *   lo conservador es no darles un descuento de primera vez.
 * - `professional_profiles.pro_interest_offer_code`: pidió PRO con una oferta
 *   elegible (queda reservada).
 */
export class ProOffers1791200000000 implements MigrationInterface {
  name = 'ProOffers1791200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "professional_profiles" ADD "pro_interest_offer_code" character varying(40)`,
    );
    await queryRunner.query(
      `ALTER TABLE "professional_profiles" ADD "first_paid_pro_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `UPDATE "professional_profiles" SET "first_paid_pro_at" = "updated_at" WHERE "plan_tier" = 'PRO'`,
    );
    await queryRunner.query(
      `CREATE TABLE "pro_offer_redemptions" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "professional_id" uuid NOT NULL, "offer_code" character varying(40) NOT NULL, "discount_percent" smallint NOT NULL, "cycles" smallint NOT NULL, "base_price_ars" integer NOT NULL, "discounted_price_ars" integer NOT NULL, "redeemed_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_pro_offer_redemptions_professional_offer" UNIQUE ("professional_id", "offer_code"), CONSTRAINT "PK_pro_offer_redemptions" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "pro_offer_redemptions" ADD CONSTRAINT "FK_208ec49e1ec174df355585387d2" FOREIGN KEY ("professional_id") REFERENCES "professional_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."pro_offer_event_type" AS ENUM('SHOWN', 'CLICKED', 'REDEEMED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."pro_offer_surface" AS ENUM('REQUESTS_USAGE', 'LIMIT_MODAL', 'PLAN_PAGE')`,
    );
    await queryRunner.query(
      `CREATE TABLE "pro_offer_events" ("id" BIGSERIAL NOT NULL, "type" "public"."pro_offer_event_type" NOT NULL, "surface" "public"."pro_offer_surface", "professional_id" uuid NOT NULL, "offer_code" character varying(40) NOT NULL, "dedupe_key" character(64) NOT NULL, "occurred_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_pro_offer_events_dedupe_key" UNIQUE ("dedupe_key"), CONSTRAINT "PK_pro_offer_events" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_pro_offer_events_offer_type_occurred" ON "pro_offer_events" ("offer_code", "type", "occurred_at")`,
    );
    await queryRunner.query(
      `ALTER TABLE "pro_offer_events" ADD CONSTRAINT "FK_f68136286b97978d0b82988bf30" FOREIGN KEY ("professional_id") REFERENCES "professional_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "pro_offer_events" DROP CONSTRAINT "FK_f68136286b97978d0b82988bf30"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_pro_offer_events_offer_type_occurred"`);
    await queryRunner.query(`DROP TABLE "pro_offer_events"`);
    await queryRunner.query(`DROP TYPE "public"."pro_offer_surface"`);
    await queryRunner.query(`DROP TYPE "public"."pro_offer_event_type"`);
    await queryRunner.query(
      `ALTER TABLE "pro_offer_redemptions" DROP CONSTRAINT "FK_208ec49e1ec174df355585387d2"`,
    );
    await queryRunner.query(`DROP TABLE "pro_offer_redemptions"`);
    await queryRunner.query(`ALTER TABLE "professional_profiles" DROP COLUMN "first_paid_pro_at"`);
    await queryRunner.query(`ALTER TABLE "professional_profiles" DROP COLUMN "pro_interest_offer_code"`);
  }
}
