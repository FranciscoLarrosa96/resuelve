import { ConfigService } from '@nestjs/config';
import { EntityManager } from 'typeorm';
import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-codes';
import { NotificationType } from '../notifications/notification.entity';
import { notify } from '../notifications/notify';
import { proTrialDays } from '../plans/pro-trial';

/**
 * Hasta tres colegas por perfil. La invitación no suma días: cada persona puede
 * activar la misma prueba única de hasta siete días cuando su perfil esté listo.
 * Los premios ya otorgados se conservan, pero no se extienden.
 */

/** Tope de invitaciones válidas por profesional (en total, no por mes). */
export const maxReferrerRewards = (_config: ConfigService) => 3;

/** Invitaciones válidas usadas (no días ni recompensas acumulables). */
async function referrerRewardsCount(db: Pick<EntityManager, 'query'>, professionalId: string): Promise<number> {
  const [{ n }] = await db.query(
    `SELECT count(*)::int AS n FROM referrals WHERE referrer_professional_id = $1 AND status <> 'INVALID'`,
    [professionalId],
  );
  return n;
}

/** Read-only, own incoming invitation. Never exposes referrer IDs or invalidation reasons. */
export async function incomingReferral(
  db: Pick<EntityManager, 'query'>,
  professionalId: string,
  config: ConfigService,
) {
  const [referral] = await db.query(
    `SELECT CASE WHEN r.status = 'INVALID' THEN 'INVALID'
      WHEN t.professional_id IS NOT NULL THEN 'REWARDED' ELSE r.status END AS status,
      coalesce(rw.days, t.days) AS reward_days
    FROM referrals r JOIN professional_profiles p ON p.user_id = r.referred_user_id
    LEFT JOIN referral_rewards rw ON rw.referral_id = r.id AND rw.professional_id = p.id
    LEFT JOIN pro_trials t ON t.professional_id = p.id
    WHERE p.id = $1`,
    [professionalId],
  );
  if (!referral) return null;
  if (referral.status === 'INVALID') return { status: 'INVALID', rewardDays: null };
  return {
    status: referral.status as 'REGISTERED' | 'ACTIVATED' | 'REWARDED',
    rewardDays: referral.reward_days ?? proTrialDays(config),
  };
}

/** Lo que muestra el panel de quien invita: cuántas invitaciones todavía puede usar. */
export async function referrerAllowance(
  db: Pick<EntityManager, 'query'>,
  professionalId: string,
  config: ConfigService,
): Promise<{ maxRewards: number; rewardsLeft: number }> {
  const max = maxReferrerRewards(config);
  return { maxRewards: max, rewardsLeft: Math.max(0, max - (await referrerRewardsCount(db, professionalId))) };
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
  const [p] = await m.query(`SELECT id, user_id FROM professional_profiles WHERE referral_code = $1 FOR UPDATE`, [code]);
  if (p.user_id === userId)
    throw AppException.unprocessable(ErrorCode.VALIDATION_ERROR, 'No podés invitarte a vos mismo.');
  // Un enlace viejo o un cuarto colega no bloquean el registro: simplemente no
  // crean otra invitación. El bloqueo del referente serializa altas concurrentes.
  if ((await referrerRewardsCount(m, p.id)) >= 3) return;
  const inserted: { id: string }[] = await m.query(
    `INSERT INTO referrals(referrer_professional_id, referred_user_id, code) VALUES($1,$2,$3)
    ON CONFLICT(referred_user_id) DO NOTHING RETURNING id`,
    [p.id, userId, code],
  );
  // Quien invitó se entera del registro (sin nombre ni datos de la persona).
  if (inserted[0]) {
    await notify(
      m,
      { userId: p.user_id, type: NotificationType.PRO_REFERRAL_REGISTERED, referralId: inserted[0].id },
      userId,
    );
  }
}

/** Crear el perfil confirma la invitación, pero no consume la semana sin consentimiento. */
export async function activateReferral(
  m: EntityManager,
  professionalId: string,
  config: ConfigService,
): Promise<void> {
  if (!config.get<boolean>('REFERRALS_ENABLED', true)) return;
  const [r] = await m.query(
    `WITH activated AS (
      UPDATE referrals r SET status = 'ACTIVATED', activated_at = coalesce(activated_at, now())
      FROM professional_profiles p WHERE p.user_id = r.referred_user_id AND p.id = $1
        AND r.status = 'REGISTERED' RETURNING r.id, r.referrer_professional_id
    ) SELECT id, referrer_professional_id FROM activated`,
    [professionalId],
  );
  if (!r) return;
  const [referrer] = await m.query(
    `SELECT user_id FROM professional_profiles WHERE id = $1`, [r.referrer_professional_id],
  );
  await notify(m, {
    userId: referrer.user_id, type: NotificationType.PRO_REFERRAL_ACTIVATED, referralId: r.id,
  }, null);
}

/** Festejo pendiente de un premio (se muestra una vez, hasta que la persona lo cierra). */
export interface ReferralCelebration {
  rewardId: string;
  /** REFERRER = alguien usó tu enlace; REFERRED = te sumaste con el enlace de alguien. */
  role: 'REFERRER' | 'REFERRED';
  /** Nombre de pila del amigo (nunca apellido completo ni contacto). */
  friendName: string;
  days: number;
  accessUntil: string;
  /** Solo REFERRER: cuántos amigos más le suman días. */
  rewardsLeft: number | null;
}

export async function pendingReferralCelebration(
  db: Pick<EntityManager, 'query'>,
  professionalId: string,
  config: ConfigService,
): Promise<ReferralCelebration | null> {
  const [row] = await db.query(
    `SELECT rw.id AS "rewardId", rw.days, rw.access_until AS "accessUntil",
       CASE WHEN r.referrer_professional_id = rw.professional_id THEN 'REFERRER' ELSE 'REFERRED' END AS role,
       CASE WHEN r.referrer_professional_id = rw.professional_id THEN referred.first_name ELSE referrer.first_name END
         AS "friendName"
     FROM referral_rewards rw
     JOIN referrals r ON r.id = rw.referral_id
     JOIN users referred ON referred.id = r.referred_user_id
     JOIN professional_profiles rp ON rp.id = r.referrer_professional_id
     JOIN users referrer ON referrer.id = rp.user_id
     WHERE rw.professional_id = $1 AND rw.celebrated_at IS NULL
     ORDER BY rw.granted_at LIMIT 1`,
    [professionalId],
  );
  if (!row) return null;
  return {
    ...row,
    accessUntil: new Date(row.accessUntil).toISOString(),
    rewardsLeft: row.role === 'REFERRER' ? (await referrerAllowance(db, professionalId, config)).rewardsLeft : null,
  };
}

/** Cierra el festejo; idempotente y solo sobre premios propios. */
export async function acknowledgeReferralCelebration(
  db: Pick<EntityManager, 'query'>,
  professionalId: string,
  rewardId: string,
): Promise<void> {
  await db.query(
    `UPDATE referral_rewards SET celebrated_at = now()
      WHERE id = $1 AND professional_id = $2 AND celebrated_at IS NULL`,
    [rewardId, professionalId],
  );
}
