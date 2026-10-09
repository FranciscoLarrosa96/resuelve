import { ConfigService } from '@nestjs/config';
import { EntityManager } from 'typeorm';
import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-codes';
import { NotificationType } from '../notifications/notification.entity';
import { notify } from '../notifications/notify';

/**
 * Referidos (única regla). Pepe abre el enlace de Juan, crea su cuenta y arma
 * su perfil profesional (el alta ya exige servicio y cobertura): en esa misma
 * transacción los dos suman `REFERRAL_REWARD_DAYS` de PRO. Sin presupuestos
 * ni más pasos. Juan suma días por hasta `REFERRAL_MAX_REWARDS` amigos (con
 * el email sin verificar, el tope es lo que impide regalarse PRO eterno con
 * cuentas truchas); del siguiente en adelante el amigo igual recibe lo suyo.
 */

/** Cuántos amigos le suman días a quien invita (en total, no por mes). */
export const maxReferrerRewards = (config: ConfigService) => config.get<number>('REFERRAL_MAX_REWARDS', 3);

/** Premios que ya sumó como quien invita. */
async function referrerRewardsCount(db: Pick<EntityManager, 'query'>, professionalId: string): Promise<number> {
  const [{ n }] = await db.query(
    `SELECT count(*)::int AS n FROM referral_rewards rw JOIN referrals r ON r.id = rw.referral_id
      WHERE r.referrer_professional_id = $1 AND rw.professional_id = $1`,
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
    `SELECT r.status, rw.days AS reward_days
    FROM referrals r JOIN professional_profiles p ON p.user_id = r.referred_user_id
    LEFT JOIN referral_rewards rw ON rw.referral_id = r.id AND rw.professional_id = p.id
    WHERE p.id = $1`,
    [professionalId],
  );
  if (!referral) return null;
  if (referral.status === 'INVALID') return { status: 'INVALID', rewardDays: null };
  return {
    status: referral.status as 'REGISTERED' | 'ACTIVATED' | 'REWARDED',
    rewardDays: referral.reward_days ?? config.get<number>('REFERRAL_REWARD_DAYS', 15),
  };
}

/** Lo que muestra el panel de quien invita: cuántos amigos todavía le suman días. */
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
  const [p] = await m.query(`SELECT id, user_id FROM professional_profiles WHERE referral_code = $1`, [code]);
  if (p.user_id === userId)
    throw AppException.unprocessable(ErrorCode.VALIDATION_ERROR, 'No podés invitarte a vos mismo.');
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

/**
 * Activación = el referido tiene perfil profesional. Corre dentro de la
 * transacción del alta (o del "Activar" de una invitación anterior a esta
 * regla). Idempotente y segura ante concurrencia: lock de la invitación y de
 * los dos perfiles (en orden fijo), un premio por invitación y persona.
 */
export async function activateReferral(
  m: EntityManager,
  professionalId: string,
  config: ConfigService,
): Promise<void> {
  if (!config.get<boolean>('REFERRALS_ENABLED', true)) return;
  const [r] = await m.query(
    `SELECT r.* FROM referrals r
    JOIN professional_profiles p ON p.user_id = r.referred_user_id WHERE p.id = $1 AND r.status IN ('REGISTERED','ACTIVATED')
    FOR UPDATE OF r`,
    [professionalId],
  );
  if (!r) return;
  await m.query(
    `UPDATE referrals SET status = 'ACTIVATED', activated_at = coalesce(activated_at, now()) WHERE id = $1`,
    [r.id],
  );
  const days = config.get<number>('REFERRAL_REWARD_DAYS', 15);
  const granted = new Set<string>();
  const owners = new Map<string, string>();
  if (!config.get<boolean>('REFERRAL_REWARDS_ENABLED', true)) {
    const [referrer] = await m.query(`SELECT user_id FROM professional_profiles WHERE id = $1`, [
      r.referrer_professional_id,
    ]);
    await notify(
      m,
      { userId: referrer.user_id, type: NotificationType.PRO_REFERRAL_ACTIVATED, referralId: r.id },
      null,
    );
    return;
  }
  for (const id of [r.referrer_professional_id, professionalId].sort()) {
    const [p] = await m.query(`SELECT * FROM professional_profiles WHERE id = $1 FOR UPDATE`, [id]);
    owners.set(id, p.user_id);
    // Tope de quien invita, leído con su perfil bloqueado: dos altas a la vez no lo pasan.
    if (id === r.referrer_professional_id && (await referrerRewardsCount(m, id)) >= maxReferrerRewards(config)) {
      continue;
    }
    // Paid/manual finite access is extended effectively, without modifying either source or MP.
    const base = Math.max(
      Date.now(),
      ...[p.bonus_pro_until, p.billing_pro_until, p.transfer_pro_until, p.plan_tier === 'PRO' ? p.plan_expires_at : null]
        .filter(Boolean)
        .map((d) => new Date(d).getTime()),
    );
    const until = new Date(base + days * 86400000);
    const inserted = await m.query(
      `INSERT INTO referral_rewards(referral_id, professional_id, days, access_until)
      VALUES($1,$2,$3,$4) ON CONFLICT(referral_id,professional_id) DO NOTHING RETURNING id`,
      [r.id, id, days, until],
    );
    if (inserted.length) {
      granted.add(id);
      await m.query(`UPDATE professional_profiles SET bonus_pro_until = $2 WHERE id = $1`, [id, until]);
    }
  }
  await m.query(
    `UPDATE referrals SET status = 'REWARDED', rewarded_at = coalesce(rewarded_at, now()) WHERE id = $1`,
    [r.id],
  );
  // Quien invitó: "Un colega se sumó con tu enlace" (con los días si los sumó; sin días si ya llegó al tope). El referido: su bonus.
  await notify(
    m,
    {
      userId: owners.get(r.referrer_professional_id)!,
      type: NotificationType.PRO_REFERRAL_ACTIVATED,
      referralId: r.id,
      payload: granted.has(r.referrer_professional_id) ? { rewardDays: days } : null,
    },
    null,
  );
  if (granted.has(professionalId)) {
    await notify(
      m,
      {
        userId: owners.get(professionalId)!,
        type: NotificationType.PRO_BONUS_GRANTED,
        referralId: r.id,
        payload: { rewardDays: days },
      },
      null,
    );
  }
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
