import { MigrationInterface, QueryRunner } from 'typeorm';

/** Los cambios previos pertenecen a PRO; Plus empieza con su precio configurado. */
export class ProPlusAdminPricing1795400000000 implements MigrationInterface {
  name = 'ProPlusAdminPricing1795400000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE pro_price_changes ADD COLUMN plan_tier plan_tier NOT NULL DEFAULT 'PRO',
      ADD CONSTRAINT "CHK_pro_price_changes_paid_tier" CHECK (plan_tier IN ('PRO', 'PRO_PLUS'))`);
    await q.query(`CREATE INDEX "IDX_pro_price_changes_plan_latest" ON pro_price_changes (plan_tier, id DESC)`);
  }

  async down(q: QueryRunner): Promise<void> {
    // No mezclar el historial de Plus con el de PRO al volver al esquema anterior.
    await q.query(`DELETE FROM pro_price_changes WHERE plan_tier = 'PRO_PLUS'`);
    await q.query(`DROP INDEX "IDX_pro_price_changes_plan_latest"`);
    await q.query(`ALTER TABLE pro_price_changes DROP COLUMN plan_tier`);
  }
}
