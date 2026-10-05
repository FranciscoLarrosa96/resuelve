import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fase 8 · Hardening. Auditoría de índices: `jobs.client_id` no tenía ninguno y lo filtran
 * "Mis profesionales", el historial, la recontratación y el conteo de trabajos con un profesional
 * (todas con `client_id = $1 AND status = 'COMPLETED'`). Solo agrega un índice: no toca datos.
 */
export class Phase8JobsClientIndex1792900000000 implements MigrationInterface {
  name = 'Phase8JobsClientIndex1792900000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_jobs_client_status" ON "jobs" ("client_id", "status")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_jobs_client_status"`);
  }
}
