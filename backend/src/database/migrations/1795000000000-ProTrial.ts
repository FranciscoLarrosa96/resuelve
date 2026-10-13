import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Prueba de PRO (Fase 3 comercial, `plans/pro-trial.ts`): una fila por perfil
 * (única = una sola vez). Los días se suman a `bonus_pro_until`, la misma
 * fuente que los referidos: el plan efectivo no cambia de regla. Guarda el
 * cupo Free que le quedaba al empezar para contar, al final, los presupuestos
 * que mandó por encima de ese cupo. Sin PII.
 *
 * `pro_funnel_event_type` suma `PRO_TRIAL_STARTED` (PostgreSQL no quita
 * valores de un enum: al revertir se borran las filas y el valor queda sin uso;
 * los días ya sumados a `bonus_pro_until` tampoco se quitan).
 */
export class ProTrial1795000000000 implements MigrationInterface {
  name = 'ProTrial1795000000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE "pro_trials" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "professional_id" uuid NOT NULL,
      "started_at" timestamptz NOT NULL DEFAULT now(),
      "ends_at" timestamptz NOT NULL,
      "days" integer NOT NULL,
      "free_quota_remaining" integer,
      "summary_seen_at" timestamptz,
      CONSTRAINT "PK_pro_trials" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_pro_trials_professional" UNIQUE ("professional_id"),
      CONSTRAINT "CHK_pro_trials_period" CHECK ("ends_at" > "started_at"),
      CONSTRAINT "FK_pro_trials_professional" FOREIGN KEY ("professional_id")
        REFERENCES "professional_profiles"("id") ON DELETE CASCADE)`);
    await q.query(`ALTER TYPE "public"."pro_funnel_event_type" ADD VALUE IF NOT EXISTS 'PRO_TRIAL_STARTED'`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DELETE FROM "pro_funnel_events" WHERE "type"::text = 'PRO_TRIAL_STARTED'`);
    await q.query(`DROP TABLE "pro_trials"`);
  }
}
