import { MigrationInterface, QueryRunner } from 'typeorm';

export class Phase6Acquisition1792500000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE professional_profiles ADD COLUMN IF NOT EXISTS slug varchar(190), ADD COLUMN IF NOT EXISTS referral_code varchar(32), ADD COLUMN IF NOT EXISTS bonus_pro_until timestamptz;
      ALTER TABLE pending_registrations ADD COLUMN IF NOT EXISTS referral_code varchar(32);
      ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS acquisition_source varchar(32) NOT NULL DEFAULT 'MARKETPLACE';
      CREATE UNIQUE INDEX IF NOT EXISTS uq_professional_slug ON professional_profiles(slug);
      CREATE UNIQUE INDEX IF NOT EXISTS uq_professional_referral_code ON professional_profiles(referral_code);
      CREATE OR REPLACE FUNCTION resuelve_public_identity() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE base text; candidate text; suffix integer := 1;
      BEGIN
        PERFORM pg_advisory_xact_lock(1792500000);
        IF NEW.slug IS NULL THEN
          SELECT trim(both '-' FROM regexp_replace(lower(translate(first_name || '-' || last_name,
            'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN')), '[^a-z0-9]+', '-', 'g')) INTO base FROM users WHERE id = NEW.user_id;
          base := left(coalesce(nullif(base,''), 'profesional'), 160); candidate := base;
          WHILE EXISTS(SELECT 1 FROM professional_profiles WHERE slug = candidate AND id <> NEW.id) LOOP
            suffix := suffix + 1; candidate := base || '-' || suffix;
          END LOOP;
          NEW.slug := candidate;
        END IF;
        IF NEW.referral_code IS NULL THEN
          NEW.referral_code := 'PRO-' || upper(replace(NEW.id::text, '-', ''));
        END IF;
        RETURN NEW;
      END $$;
      -- 36 characters for an injective UUID-based code; no PII or name instability.
      ALTER TABLE professional_profiles ALTER COLUMN referral_code TYPE varchar(40);
      ALTER TABLE pending_registrations ALTER COLUMN referral_code TYPE varchar(40);
      DROP TRIGGER IF EXISTS trg_public_identity ON professional_profiles;
      CREATE TRIGGER trg_public_identity BEFORE INSERT OR UPDATE OF slug, referral_code ON professional_profiles FOR EACH ROW EXECUTE FUNCTION resuelve_public_identity();
      UPDATE professional_profiles SET slug = slug, referral_code = referral_code WHERE slug IS NULL OR referral_code IS NULL;
      ALTER TABLE professional_profiles ALTER COLUMN slug SET NOT NULL, ALTER COLUMN referral_code SET NOT NULL;
      CREATE TABLE IF NOT EXISTS referrals (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        referrer_professional_id uuid NOT NULL REFERENCES professional_profiles(id) ON DELETE CASCADE,
        referred_user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        code varchar(40) NOT NULL,
        status varchar(16) NOT NULL DEFAULT 'REGISTERED' CHECK(status IN ('REGISTERED','ACTIVATED','REWARDED','INVALID')),
        registered_at timestamptz NOT NULL DEFAULT now(), activated_at timestamptz, rewarded_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now());
      CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_professional_id, registered_at);
      CREATE TABLE IF NOT EXISTS referral_rewards (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), referral_id uuid NOT NULL REFERENCES referrals(id) ON DELETE CASCADE,
        professional_id uuid NOT NULL REFERENCES professional_profiles(id) ON DELETE CASCADE,
        days smallint NOT NULL CHECK(days > 0), granted_at timestamptz NOT NULL DEFAULT now(), access_until timestamptz NOT NULL,
        UNIQUE(referral_id, professional_id));`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS referral_rewards; DROP TABLE IF EXISTS referrals;
      DROP TRIGGER IF EXISTS trg_public_identity ON professional_profiles; DROP FUNCTION IF EXISTS resuelve_public_identity();
      ALTER TABLE service_requests DROP COLUMN IF EXISTS acquisition_source;
      ALTER TABLE pending_registrations DROP COLUMN IF EXISTS referral_code;
      ALTER TABLE professional_profiles DROP COLUMN IF EXISTS slug, DROP COLUMN IF EXISTS referral_code, DROP COLUMN IF EXISTS bonus_pro_until;`);
  }
}
