import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Aceptación de los Términos de Uso al crear la cuenta: versión aceptada y
 * momento. Nullable: las cuentas anteriores a los Términos quedan en `null`
 * (nunca se inventa una aceptación que no ocurrió).
 */
export class TermsAcceptance1791800000000 implements MigrationInterface {
  name = 'TermsAcceptance1791800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "terms_version" character varying(32)`);
    await queryRunner.query(`ALTER TABLE "users" ADD "terms_accepted_at" TIMESTAMP WITH TIME ZONE`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "terms_accepted_at"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "terms_version"`);
  }
}
