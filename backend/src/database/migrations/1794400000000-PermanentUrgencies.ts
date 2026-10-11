import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * "Tomo urgencias" (vencía a las 12 h) → "Atiendo urgencias", preferencia PERMANENTE:
 * queda prendida hasta que el profesional la apaga.
 *
 * Backfill: quien la tenía vigente al migrar (`available_until > now()`) queda atendiendo
 * urgencias; quien la tenía vencida o nunca la prendió, no. Nada destructivo:
 * `available_until` se conserva sin uso (el backend ya no la lee ni la escribe) para que un
 * rollback no pierda el dato; se puede borrar en una limpieza posterior.
 */
export class PermanentUrgencies1794400000000 implements MigrationInterface {
  name = 'PermanentUrgencies1794400000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "professional_profiles" ADD "takes_urgencies" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `UPDATE "professional_profiles" SET "takes_urgencies" = true
        WHERE "available_until" IS NOT NULL AND "available_until" > now()`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Vuelta al modelo con vencimiento: quien atiende urgencias conserva 12 h desde ahora.
    await queryRunner.query(
      `UPDATE "professional_profiles"
          SET "available_until" = CASE WHEN "takes_urgencies" THEN now() + interval '12 hours' ELSE NULL END`,
    );
    await queryRunner.query(`ALTER TABLE "professional_profiles" DROP COLUMN "takes_urgencies"`);
  }
}
