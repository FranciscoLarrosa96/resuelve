import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * "Años de experiencia" deja de tener 0 por defecto: NULL = no informado. Los valores que ya
 * están cargados (incluidos los 0) se conservan sin tocar: no hay forma de saber cuáles se
 * cargaron por defecto y cuáles a propósito.
 */
export class ProfileYearsExperienceNullable1796600000000 implements MigrationInterface {
  name = 'ProfileYearsExperienceNullable1796600000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "professional_profiles" ALTER COLUMN "years_experience" DROP NOT NULL`);
    await q.query(`ALTER TABLE "professional_profiles" ALTER COLUMN "years_experience" DROP DEFAULT`);
  }

  async down(q: QueryRunner): Promise<void> {
    // Los "no informado" vuelven a ser 0 (lo único que admite la columna anterior).
    await q.query(`UPDATE "professional_profiles" SET "years_experience" = 0 WHERE "years_experience" IS NULL`);
    await q.query(`ALTER TABLE "professional_profiles" ALTER COLUMN "years_experience" SET DEFAULT '0'`);
    await q.query(`ALTER TABLE "professional_profiles" ALTER COLUMN "years_experience" SET NOT NULL`);
  }
}
