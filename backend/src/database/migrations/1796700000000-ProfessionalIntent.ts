import { MigrationInterface, QueryRunner } from 'typeorm';

/** No infiere intención de cuentas anteriores ni crea perfiles. */
export class ProfessionalIntent1796700000000 implements MigrationInterface {
  name = 'ProfessionalIntent1796700000000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE users ADD COLUMN professional_intent_at timestamptz NULL`);
    await q.query(`ALTER TABLE pending_registrations ADD COLUMN professional_intent_at timestamptz NULL`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE pending_registrations DROP COLUMN professional_intent_at`);
    await q.query(`ALTER TABLE users DROP COLUMN professional_intent_at`);
  }
}
