import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Precio fundador (`plans/founder-price.ts`): los primeros N profesionales que
 * pagan PRO guardan el precio mensual de ese momento. No se asigna a cuentas
 * anteriores (nadie se vuelve fundador sin un cobro registrado desde hoy).
 */
export class ProFounderPrice1796800000000 implements MigrationInterface {
  name = 'ProFounderPrice1796800000000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE professional_profiles ADD COLUMN founder_price_ars integer NULL`);
    await q.query(`ALTER TABLE professional_profiles ADD COLUMN founder_at timestamptz NULL`);
    await q.query(
      `ALTER TABLE professional_profiles ADD CONSTRAINT "CHK_professional_profiles_founder"
         CHECK ((founder_at IS NULL) = (founder_price_ars IS NULL) AND (founder_price_ars IS NULL OR founder_price_ars > 0))`,
    );
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE professional_profiles DROP CONSTRAINT "CHK_professional_profiles_founder"`);
    await q.query(`ALTER TABLE professional_profiles DROP COLUMN founder_at`);
    await q.query(`ALTER TABLE professional_profiles DROP COLUMN founder_price_ars`);
  }
}
