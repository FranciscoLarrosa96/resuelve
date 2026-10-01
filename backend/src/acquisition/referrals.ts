import { ConfigService } from '@nestjs/config';
import { EntityManager } from 'typeorm';
import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-codes';
import { OFFERS_PUBLICLY_SQL } from '../professionals/professional-rules';

/** Shared read predicates: progress describes the same conditions used by activation. */
const PROFILE_COMPLETED_SQL = `(p.status = 'ACTIVE' AND coalesce(trim(p.headline), '') <> '')`;
const PUBLIC_SERVICE_SQL = `EXISTS(SELECT 1 FROM professional_services ps JOIN services s ON s.id = ps.service_id
  WHERE ps.professional_id = p.id AND s.active AND ${OFFERS_PUBLICLY_SQL})`;
const COVERAGE_SQL = `(p.covers_entire_city OR EXISTS(SELECT 1 FROM professional_service_areas a JOIN zones z ON z.id = a.zone_id WHERE a.professional_id = p.id AND z.active))`;
const FIRST_QUOTE_SQL = `EXISTS(SELECT 1 FROM quotes q JOIN service_requests sr ON sr.id = q.request_id
  JOIN professional_profiles ref ON ref.id = $2
  WHERE q.professional_id = p.id AND sr.client_id <> p.user_id AND sr.client_id <> ref.user_id)`;

/** Read-only, own incoming invitation. Never exposes referrer IDs or invalidation reasons. */
export async function incomingReferral(
  db: Pick<EntityManager, 'query'>,
  professionalId: string,
  config: ConfigService,
) {
  const [referral] = await db.query(
    `SELECT r.status, r.referrer_professional_id, rw.days AS reward_days
    FROM referrals r JOIN professional_profiles p ON p.user_id = r.referred_user_id
    LEFT JOIN referral_rewards rw ON rw.referral_id = r.id AND rw.professional_id = p.id
    WHERE p.id = $1`,
    [professionalId],
  );
  if (!referral) return null;
  if (referral.status === 'INVALID') return { status: 'INVALID', rewardDays: null, steps: null };
  const rewardDays = referral.reward_days ?? config.get<number>('REFERRAL_REWARD_DAYS', 15);
  // Historical reward/activation status stays authoritative even if the profile changes afterwards.
  if (referral.status !== 'REGISTERED') return { status: referral.status, rewardDays, steps: null };
  const [steps] = await db.query(
    `SELECT true AS "accountCreated", ${PROFILE_COMPLETED_SQL} AS "profileCompleted",
    EXISTS(SELECT 1 FROM professional_services ps JOIN services s ON s.id = ps.service_id
      WHERE ps.professional_id = p.id AND s.active) AS "serviceConfigured",
    ${COVERAGE_SQL} AS "coverageConfigured",
    CASE WHEN EXISTS(SELECT 1 FROM professional_services ps JOIN services s ON s.id = ps.service_id
      WHERE ps.professional_id = p.id AND s.active)
      AND NOT EXISTS(SELECT 1 FROM professional_services ps JOIN services s ON s.id = ps.service_id
      WHERE ps.professional_id = p.id AND s.active AND NOT s.requires_license)
      THEN ${PUBLIC_SERVICE_SQL} ELSE NULL END AS "licenseValid",
    ${FIRST_QUOTE_SQL} AS "firstValidQuoteSent"
    FROM professional_profiles p WHERE p.id = $1`,
    [professionalId, referral.referrer_professional_id],
  );
  return { status: referral.status, rewardDays, steps };
}

/** Register-only: no authenticated endpoint accepts applying a code to an existing account. */
export async function validateReferral(m: EntityManager, code?: string): Promise<void> {
  if (!code) return;
  const rows = await m.query(`SELECT id FROM professional_profiles WHERE referral_code = $1`, [code]);
  if (!rows.length)
    throw AppException.unprocessable(ErrorCode.VALIDATION_ERROR, 'El código de invitación no existe.');
}

export async function registerReferral(m: EntityManager, userId: string, code?: string): Promise<void> {
  if (!code) return;
  await validateReferral(m, code);
  const [p] = await m.query(`SELECT id, user_id FROM professional_profiles WHERE referral_code = $1`, [code]);
  if (p.user_id === userId)
    throw AppException.unprocessable(ErrorCode.VALIDATION_ERROR, 'No podés invitarte a vos mismo.');
  await m.query(
    `INSERT INTO referrals(referrer_professional_id, referred_user_id, code) VALUES($1,$2,$3)
    ON CONFLICT(referred_user_id) DO NOTHING`,
    [p.id, userId, code],
  );
}

/** Activation = public-ready profile + a real quote sent to an independent client. Runs inside its transaction. */
export async function activateReferral(
  m: EntityManager,
  professionalId: string,
  config: ConfigService,
): Promise<void> {
  if (!config.get<boolean>('REFERRALS_ENABLED', true)) return;
  const [r] = await m.query(
    `SELECT r.*, p.id AS referred_profile_id FROM referrals r
    JOIN professional_profiles p ON p.user_id = r.referred_user_id WHERE p.id = $1 AND r.status IN ('REGISTERED','ACTIVATED')
    FOR UPDATE OF r`,
    [professionalId],
  );
  if (!r) return;
  const [ready] = await m.query(
    `SELECT p.id FROM professional_profiles p WHERE p.id = $1 AND ${PROFILE_COMPLETED_SQL}
    AND ${PUBLIC_SERVICE_SQL} AND ${COVERAGE_SQL} AND ${FIRST_QUOTE_SQL}`,
    [professionalId, r.referrer_professional_id],
  );
  if (!ready) return;
  await m.query(
    `UPDATE referrals SET status = 'ACTIVATED', activated_at = coalesce(activated_at, now()) WHERE id = $1`,
    [r.id],
  );
  if (!config.get<boolean>('REFERRAL_REWARDS_ENABLED', true)) return;
  const days = config.get<number>('REFERRAL_REWARD_DAYS', 15);
  for (const id of [r.referrer_professional_id, professionalId].sort()) {
    const [p] = await m.query(`SELECT * FROM professional_profiles WHERE id = $1 FOR UPDATE`, [id]);
    // Paid/manual finite access is extended effectively, without modifying either source or MP.
    const base = Math.max(
      Date.now(),
      ...[p.bonus_pro_until, p.billing_pro_until, p.plan_tier === 'PRO' ? p.plan_expires_at : null]
        .filter(Boolean)
        .map((d) => new Date(d).getTime()),
    );
    const until = new Date(base + days * 86400000);
    const inserted = await m.query(
      `INSERT INTO referral_rewards(referral_id, professional_id, days, access_until)
      VALUES($1,$2,$3,$4) ON CONFLICT(referral_id,professional_id) DO NOTHING RETURNING id`,
      [r.id, id, days, until],
    );
    if (inserted.length)
      await m.query(`UPDATE professional_profiles SET bonus_pro_until = $2 WHERE id = $1`, [id, until]);
  }
  await m.query(
    `UPDATE referrals SET status = 'REWARDED', rewarded_at = coalesce(rewarded_at, now()) WHERE id = $1`,
    [r.id],
  );
}
