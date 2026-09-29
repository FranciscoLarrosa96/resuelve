import { MigrationInterface, QueryRunner } from 'typeorm';

/** Ubicación privada verificada del trabajo; columnas null para solicitudes legacy. */
export class Phase25BRequestLocation1792200000000 implements MigrationInterface {
  name = 'Phase25BRequestLocation1792200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DO $$ BEGIN
      CREATE TYPE "public"."request_property_type" AS ENUM ('HOUSE', 'APARTMENT', 'OTHER');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$`);
    await queryRunner.query(`ALTER TABLE "service_requests" ADD COLUMN IF NOT EXISTS "formatted_address" text`);
    await queryRunner.query(`ALTER TABLE "service_requests" ADD COLUMN IF NOT EXISTS "latitude" double precision`);
    await queryRunner.query(`ALTER TABLE "service_requests" ADD COLUMN IF NOT EXISTS "longitude" double precision`);
    await queryRunner.query(`ALTER TABLE "service_requests" ADD COLUMN IF NOT EXISTS "provider_place_id" character varying(255)`);
    await queryRunner.query(
      `ALTER TABLE "service_requests" ADD COLUMN IF NOT EXISTS "property_type" "public"."request_property_type"`,
    );
    await queryRunner.query(`ALTER TABLE "service_requests" ADD COLUMN IF NOT EXISTS "floor" character varying(40)`);
    await queryRunner.query(`ALTER TABLE "service_requests" ADD COLUMN IF NOT EXISTS "unit" character varying(80)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "service_requests" DROP COLUMN IF EXISTS "unit"`);
    await queryRunner.query(`ALTER TABLE "service_requests" DROP COLUMN IF EXISTS "floor"`);
    await queryRunner.query(`ALTER TABLE "service_requests" DROP COLUMN IF EXISTS "property_type"`);
    await queryRunner.query(`ALTER TABLE "service_requests" DROP COLUMN IF EXISTS "provider_place_id"`);
    await queryRunner.query(`ALTER TABLE "service_requests" DROP COLUMN IF EXISTS "longitude"`);
    await queryRunner.query(`ALTER TABLE "service_requests" DROP COLUMN IF EXISTS "latitude"`);
    await queryRunner.query(`ALTER TABLE "service_requests" DROP COLUMN IF EXISTS "formatted_address"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."request_property_type"`);
  }
}
