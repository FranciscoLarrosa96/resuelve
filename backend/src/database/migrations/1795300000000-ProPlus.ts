import { MigrationInterface, QueryRunner } from 'typeorm';

/** Existing contracts keep their PRO tier, original amounts and dates. */
export class ProPlus1795300000000 implements MigrationInterface {
  name = 'ProPlus1795300000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE professional_profiles ALTER COLUMN plan_tier DROP DEFAULT`);
    await q.query(`ALTER TYPE plan_tier RENAME TO plan_tier_old`);
    await q.query(`CREATE TYPE plan_tier AS ENUM ('FREE', 'PRO', 'PRO_PLUS')`);
    await q.query(`ALTER TABLE professional_profiles ALTER COLUMN plan_tier TYPE plan_tier USING plan_tier::text::plan_tier`);
    await q.query(`ALTER TABLE professional_profiles ALTER COLUMN plan_tier SET DEFAULT 'FREE'`);
    await q.query(`DROP TYPE plan_tier_old`);
    await q.query(`ALTER TABLE professional_profiles ADD COLUMN billing_plus_until timestamptz,
      ADD COLUMN transfer_plus_from timestamptz, ADD COLUMN transfer_plus_until timestamptz`);
    for (const table of ['billing_subscriptions', 'transfer_payments']) {
      await q.query(`ALTER TABLE ${table} ADD COLUMN plan_tier plan_tier NOT NULL DEFAULT 'PRO',
        ADD CONSTRAINT "CHK_${table}_paid_tier" CHECK (plan_tier IN ('PRO', 'PRO_PLUS'))`);
    }
    await q.query(`ALTER TABLE professional_works ADD COLUMN pinned boolean NOT NULL DEFAULT false,
      ADD COLUMN before_photo_id uuid, ADD COLUMN after_photo_id uuid,
      ADD CONSTRAINT "CHK_works_comparison_pair" CHECK ((before_photo_id IS NULL AND after_photo_id IS NULL)
        OR (before_photo_id IS NOT NULL AND after_photo_id IS NOT NULL AND before_photo_id <> after_photo_id))`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE professional_works DROP CONSTRAINT "CHK_works_comparison_pair",
      DROP COLUMN after_photo_id, DROP COLUMN before_photo_id, DROP COLUMN pinned`);
    for (const table of ['billing_subscriptions', 'transfer_payments'])
      await q.query(`ALTER TABLE ${table} DROP COLUMN plan_tier`);
    await q.query(`ALTER TABLE professional_profiles DROP COLUMN billing_plus_until,
      DROP COLUMN transfer_plus_from, DROP COLUMN transfer_plus_until`);
    await q.query(`UPDATE professional_profiles SET plan_tier = 'PRO' WHERE plan_tier = 'PRO_PLUS'`);
    await q.query(`ALTER TABLE professional_profiles ALTER COLUMN plan_tier DROP DEFAULT`);
    await q.query(`ALTER TYPE plan_tier RENAME TO plan_tier_plus`);
    await q.query(`CREATE TYPE plan_tier AS ENUM ('FREE', 'PRO')`);
    await q.query(`ALTER TABLE professional_profiles ALTER COLUMN plan_tier TYPE plan_tier USING plan_tier::text::plan_tier`);
    await q.query(`ALTER TABLE professional_profiles ALTER COLUMN plan_tier SET DEFAULT 'FREE'`);
    await q.query(`DROP TYPE plan_tier_plus`);
  }
}
