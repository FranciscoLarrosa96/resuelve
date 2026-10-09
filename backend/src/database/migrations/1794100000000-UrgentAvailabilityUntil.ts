import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * "Disponible hoy" → "Tomo urgencias": en lugar de valer el día (`available_today` +
 * `available_on`, vencía a medianoche), vale `URGENT_AVAILABILITY_HOURS` desde que el
 * profesional lo prende (`available_until`), porque una urgencia puede ser a cualquier hora.
 * Quien estaba disponible hoy conserva lo que tenía: hasta la medianoche de Argentina.
 */
export class UrgentAvailabilityUntil1794100000000 implements MigrationInterface {
  name = 'UrgentAvailabilityUntil1794100000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "professional_profiles" ADD "available_until" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(
      `UPDATE "professional_profiles"
          SET "available_until" = ("available_on" + 1)::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires'
        WHERE "available_today"
          AND "available_on" = (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date`,
    );
    await queryRunner.query(`ALTER TABLE "professional_profiles" DROP COLUMN "available_on"`);
    await queryRunner.query(`ALTER TABLE "professional_profiles" DROP COLUMN "available_today"`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "professional_profiles" ADD "available_today" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(`ALTER TABLE "professional_profiles" ADD "available_on" date`);
    await queryRunner.query(
      `UPDATE "professional_profiles"
          SET "available_today" = true,
              "available_on" = (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
        WHERE "available_until" > now()`,
    );
    await queryRunner.query(`ALTER TABLE "professional_profiles" DROP COLUMN "available_until"`);
  }
}
