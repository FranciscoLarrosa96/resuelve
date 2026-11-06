import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Prueba de PRO «hasta tu primer pedido» (`plans/pro-trial.ts`):
 * - `until_first_request`: la prueba se inició con la regla nueva (las anteriores conservan
 *   su plazo fijo informado al empezar);
 * - `first_request_at`: primera solicitud recibida durante la prueba; desde ahí corren
 *   `PRO_TRIAL_DAYS` días, sin pasar el tope `PRO_TRIAL_MAX_DAYS` fijado al empezar.
 */
export class ProTrialUntilFirstRequest1797000000000 implements MigrationInterface {
  name = 'ProTrialUntilFirstRequest1797000000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "pro_trials" ADD "until_first_request" boolean NOT NULL DEFAULT false`);
    await q.query(`ALTER TABLE "pro_trials" ADD "first_request_at" TIMESTAMP WITH TIME ZONE`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "pro_trials" DROP COLUMN "first_request_at"`);
    await q.query(`ALTER TABLE "pro_trials" DROP COLUMN "until_first_request"`);
  }
}
