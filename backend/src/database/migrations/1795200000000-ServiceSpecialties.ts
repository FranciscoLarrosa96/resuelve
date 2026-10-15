import { MigrationInterface, QueryRunner } from 'typeorm';

/** Especialidades propias de cada profesional dentro de sus servicios del catálogo. */
export class ServiceSpecialties1795200000000 implements MigrationInterface {
  name = 'ServiceSpecialties1795200000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE professional_services ADD COLUMN specialties text[] NOT NULL DEFAULT '{}'`);
    await q.query(
      `ALTER TABLE professional_services ADD CONSTRAINT ck_service_specialties_count CHECK (cardinality(specialties) <= 5)`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE professional_services DROP COLUMN specialties`);
  }
}
