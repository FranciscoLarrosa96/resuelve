import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * "Quiero PRO" sin billing: `pro_interest_at` registra cuándo un profesional
 * pidió PRO desde la app. No cambia el plan (eso sigue siendo `plan:set`).
 */
export class ProInterest1791100000000 implements MigrationInterface {
  name = 'ProInterest1791100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "professional_profiles" ADD "pro_interest_at" TIMESTAMP WITH TIME ZONE`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "professional_profiles" DROP COLUMN "pro_interest_at"`);
  }
}
