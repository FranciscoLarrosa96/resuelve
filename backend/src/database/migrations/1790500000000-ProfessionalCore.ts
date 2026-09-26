import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Núcleo profesional:
 * - cobertura de ciudad completa (`covers_entire_city`), sin zona falsa;
 * - visibilidad del perfil (`status`: ACTIVE / PAUSED);
 * - matrícula: motivo de rechazo, revisor, documento privado y estado EXPIRED;
 * - una sola verificación activa (PENDING/VERIFIED) por profesional, tipo y servicio.
 */
export class ProfessionalCore1790500000000 implements MigrationInterface {
  name = 'ProfessionalCore1790500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "public"."professional_status" AS ENUM('ACTIVE', 'PAUSED')`);
    await queryRunner.query(
      `ALTER TABLE "professional_profiles" ADD "covers_entire_city" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "professional_profiles" ADD "status" "public"."professional_status" NOT NULL DEFAULT 'ACTIVE'`,
    );

    await queryRunner.query(`ALTER TYPE "public"."verification_status" ADD VALUE IF NOT EXISTS 'EXPIRED'`);
    await queryRunner.query(`ALTER TABLE "professional_verifications" ADD "reviewed_by" character varying(120)`);
    await queryRunner.query(
      `ALTER TABLE "professional_verifications" ADD "rejection_reason" character varying(300)`,
    );
    await queryRunner.query(
      `ALTER TABLE "professional_verifications" ADD "document_public_id" character varying(255)`,
    );
    await queryRunner.query(`ALTER TABLE "professional_verifications" ADD "document_format" character varying(10)`);
    await queryRunner.query(`ALTER TABLE "professional_verifications" ADD "document_bytes" integer`);
    await queryRunner.query(`ALTER TABLE "professional_verifications" ADD "document_deleted_at" TIMESTAMP WITH TIME ZONE`);
    // Solo compara con valores que ya existían: el nuevo EXPIRED no se usa en esta transacción.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_professional_verifications_active"
         ON "professional_verifications" ("professional_id", "type", (COALESCE("service_id", '00000000-0000-0000-0000-000000000000'::uuid)))
         WHERE "status" IN ('PENDING', 'VERIFIED')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."uq_professional_verifications_active"`);
    await queryRunner.query(`ALTER TABLE "professional_verifications" DROP COLUMN "document_deleted_at"`);
    await queryRunner.query(`ALTER TABLE "professional_verifications" DROP COLUMN "document_bytes"`);
    await queryRunner.query(`ALTER TABLE "professional_verifications" DROP COLUMN "document_format"`);
    await queryRunner.query(`ALTER TABLE "professional_verifications" DROP COLUMN "document_public_id"`);
    await queryRunner.query(`ALTER TABLE "professional_verifications" DROP COLUMN "rejection_reason"`);
    await queryRunner.query(`ALTER TABLE "professional_verifications" DROP COLUMN "reviewed_by"`);
    // Postgres no permite quitar un valor de un enum: se recrea el tipo. Una
    // matrícula EXPIRED vuelve a ser VERIFIED con su `expires_at` vencido (deja de contar igual).
    await queryRunner.query(
      `ALTER TABLE "professional_verifications" ALTER COLUMN "status" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "professional_verifications" ALTER COLUMN "status" TYPE text USING "status"::text`,
    );
    await queryRunner.query(
      `UPDATE "professional_verifications" SET "status" = 'VERIFIED' WHERE "status" = 'EXPIRED'`,
    );
    await queryRunner.query(`DROP TYPE "public"."verification_status"`);
    await queryRunner.query(
      `CREATE TYPE "public"."verification_status" AS ENUM('PENDING', 'VERIFIED', 'REJECTED')`,
    );
    await queryRunner.query(
      `ALTER TABLE "professional_verifications" ALTER COLUMN "status" TYPE "public"."verification_status" USING "status"::"public"."verification_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "professional_verifications" ALTER COLUMN "status" SET DEFAULT 'PENDING'`,
    );
    await queryRunner.query(`ALTER TABLE "professional_profiles" DROP COLUMN "status"`);
    await queryRunner.query(`ALTER TABLE "professional_profiles" DROP COLUMN "covers_entire_city"`);
    await queryRunner.query(`DROP TYPE "public"."professional_status"`);
  }
}
