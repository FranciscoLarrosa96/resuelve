import type { ConfigService } from '@nestjs/config';
import type { EntityManager } from 'typeorm';
import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-codes';
import { FunnelEventType } from '../funnel/funnel-event.entity';
import { EARLY_AHEAD_OF_FREE_SQL, recordFunnelEvent } from '../funnel/funnel';
import { ProfessionalProfile } from '../professionals/professional-profile.entity';
import { planSource, PlanFields } from './plan';
import { freeQuoteLimit, freeQuoteUsage } from './quote-quota';
import { publicationBlockers } from '../professionals/professional-rules';
import { publicContactChannels } from '../professionals/contact/contact-rules';
import { workCoversFor } from '../professionals/work-photos/work-covers';

/**
 * Prueba de PRO (única regla). Opt-in con un botón, una sola vez por cuenta y
 * sin tarjeta: suma `PRO_TRIAL_DAYS` (7) a `bonus_pro_until`, la misma fuente
 * de días PRO que los referidos, así `planSource`/`effectivePlan`/
 * `EFFECTIVE_PRO_SQL` siguen siendo la única fuente del plan. Al vencer vuelve
 * a Free sola (por fecha, sin jobs) y no se cobra nada.
 *
 * Quién: Free con perfil publicado, foto personal, un trabajo con foto pública
 * y algún canal habilitado. No exige un presupuesto aceptado en Resuelve:
 * también sirve a quienes trabajan solo por WhatsApp o llamadas.
 * Nunca a quien ya pagó PRO (`first_paid_pro_at`), ya tuvo una prueba
 * (`pro_trials`, única por perfil) o tiene PRO vigente de cualquier fuente.
 */

export type ProTrialIneligibility =
  | 'TRIAL_DISABLED'
  | 'ALREADY_HAD_TRIAL'
  | 'ALREADY_PAID_PRO'
  | 'NOT_FREE'
  | 'PROFILE_NOT_PUBLISHED'
  | 'MISSING_AVATAR'
  | 'MISSING_WORK_PHOTO'
  | 'NO_CONTACT_CHANNEL';

export const proTrialEnabled = (config: ConfigService) => config.get<boolean>('PRO_TRIAL_ENABLED', true);
export const proTrialDays = (config: ConfigService) => Math.min(7, config.get<number>('PRO_TRIAL_DAYS', 7));

type TrialProfile = PlanFields & Pick<ProfessionalProfile, 'firstPaidProAt'>;

/** null = puede activarla ahora. El orden es el del motivo que se muestra. */
export function proTrialIneligibility(
  profile: TrialProfile,
  hadTrial: boolean,
  enabled: boolean,
  now = new Date(),
): ProTrialIneligibility | null {
  if (!enabled) return 'TRIAL_DISABLED';
  if (hadTrial) return 'ALREADY_HAD_TRIAL';
  if (profile.firstPaidProAt) return 'ALREADY_PAID_PRO';
  if (planSource(profile, now)) return 'NOT_FREE';
  return null;
}

/** Reutiliza publicación, canales y portadas públicas; no confunde un álbum vacío con un trabajo listo. */
export async function proTrialReadiness(
  db: Pick<EntityManager, 'query'>,
  profile: ProfessionalProfile,
): Promise<ProTrialIneligibility | null> {
  if (publicationBlockers(profile).length) return 'PROFILE_NOT_PUBLISHED';
  if (!profile.avatarUrl) return 'MISSING_AVATAR';
  if (!Object.values(publicContactChannels(profile)).some(Boolean)) return 'NO_CONTACT_CHANNEL';
  const covers = await workCoversFor(db, [profile.id]);
  return covers.get(profile.id)?.length ? null : 'MISSING_WORK_PHOTO';
}

interface TrialRow {
  started_at: Date;
  ends_at: Date;
  days: number;
  free_quota_remaining: number | null;
  summary_seen_at: Date | null;
}

async function trialOf(db: Pick<EntityManager, 'query'>, professionalId: string): Promise<TrialRow | null> {
  const [row] = await db.query(
    `SELECT started_at, ends_at, days, free_quota_remaining, summary_seen_at FROM pro_trials WHERE professional_id = $1`,
    [professionalId],
  );
  return row ?? null;
}

/** Un premio histórico también consumió el beneficio gratuito; no se reinicia al vencer. */
async function hadReferralReward(db: Pick<EntityManager, 'query'>, professionalId: string): Promise<boolean> {
  const [row] = await db.query(
    `SELECT EXISTS (SELECT 1 FROM referral_rewards WHERE professional_id = $1) AS used`, [professionalId],
  );
  return row.used;
}

/**
 * Lo que ve el propio profesional (`/pro/me` → `proTrial`):
 * - AVAILABLE: puede activarla (Inicio/Tu mes, Mi plan y el momento de la pérdida);
 * - ACTIVE: la está usando hasta `endsAt`;
 * - ENDED: terminó; `summaryPending` = todavía no vio el resumen (se muestra una vez);
 * - UNAVAILABLE: no corresponde (`reason`); la UI no muestra nada.
 */
export type PresentedProTrial =
  | { state: 'AVAILABLE'; days: number }
  | { state: 'ACTIVE' | 'ENDED'; days: number; startedAt: string; endsAt: string; summaryPending: boolean }
  | { state: 'UNAVAILABLE'; reason: ProTrialIneligibility };

export async function presentProTrial(
  db: Pick<EntityManager, 'query'>,
  profile: ProfessionalProfile,
  config: ConfigService,
  now = new Date(),
): Promise<PresentedProTrial> {
  const trial = await trialOf(db, profile.id);
  if (trial) {
    const ended = new Date(trial.ends_at) <= now;
    return {
      state: ended ? 'ENDED' : 'ACTIVE',
      days: trial.days,
      startedAt: new Date(trial.started_at).toISOString(),
      endsAt: new Date(trial.ends_at).toISOString(),
      summaryPending: ended && !trial.summary_seen_at,
    };
  }
  const reason = proTrialIneligibility(profile, await hadReferralReward(db, profile.id), proTrialEnabled(config), now)
    ?? await proTrialReadiness(db, profile);
  return reason ? { state: 'UNAVAILABLE', reason } : { state: 'AVAILABLE', days: proTrialDays(config) };
}

const INELIGIBLE_MESSAGE: Record<ProTrialIneligibility, string> = {
  TRIAL_DISABLED: 'La prueba de Resuelve PRO no está disponible.',
  ALREADY_HAD_TRIAL: 'Ya usaste tu prueba de Resuelve PRO.',
  ALREADY_PAID_PRO: 'La prueba es para quienes todavía no tuvieron Resuelve PRO.',
  NOT_FREE: 'Ya tenés Resuelve PRO.',
  PROFILE_NOT_PUBLISHED: 'Publicá tu perfil para probar Resuelve PRO.',
  MISSING_AVATAR: 'Agregá tu foto de perfil para probar Resuelve PRO.',
  MISSING_WORK_PHOTO: 'Cargá un trabajo con fotos para probar Resuelve PRO.',
  NO_CONTACT_CHANNEL: 'Habilitá un canal de contacto para probar Resuelve PRO.',
};

/**
 * Activa la prueba. Bloquea el perfil y revalida en el servidor; la fila única
 * de `pro_trials` garantiza una sola vez (dos pestañas → una prueba). Guarda el
 * cupo Free que le quedaba para el resumen final.
 */
export async function startProTrial(
  m: EntityManager,
  professionalId: string,
  config: ConfigService,
  now = new Date(),
): Promise<void> {
  const profile = await m.findOneOrFail(ProfessionalProfile, {
    where: { id: professionalId },
    lock: { mode: 'pessimistic_write' },
  });
  const hadTrial = (await trialOf(m, professionalId)) !== null || await hadReferralReward(m, professionalId);
  let reason = proTrialIneligibility(profile, hadTrial, proTrialEnabled(config), now);
  if (!reason) {
    // El bloqueo anterior sigue vigente; carga las relaciones para aplicar la misma
    // regla que /pro/me sin hacer FOR UPDATE sobre joins externos.
    const readyProfile = await m.findOneOrFail(ProfessionalProfile, {
      where: { id: professionalId },
      relations: { services: { service: true }, localities: { city: true }, serviceAreas: { zone: true } },
    });
    reason = await proTrialReadiness(m, readyProfile);
  }
  if (reason) throw AppException.conflict(ErrorCode.PRO_TRIAL_NOT_AVAILABLE, INELIGIBLE_MESSAGE[reason], { reason });

  const days = proTrialDays(config);
  // Es Free: cualquier día PRO anterior (referidos incluidos) ya venció, así que empieza hoy.
  const endsAt = new Date(now.getTime() + days * 86_400_000);
  const limit = freeQuoteLimit(config);
  const remaining = limit === null ? null : Math.max(0, limit - (await freeQuoteUsage(m, professionalId)));
  const inserted = await m.query(
    `INSERT INTO pro_trials(professional_id, started_at, ends_at, days, free_quota_remaining)
     VALUES($1, $2, $3, $4, $5) ON CONFLICT (professional_id) DO NOTHING RETURNING id`,
    [professionalId, now, endsAt, days, remaining],
  );
  if (!inserted.length) {
    throw AppException.conflict(ErrorCode.PRO_TRIAL_NOT_AVAILABLE, INELIGIBLE_MESSAGE.ALREADY_HAD_TRIAL, {
      reason: 'ALREADY_HAD_TRIAL',
    });
  }
  await m.query(`UPDATE professional_profiles SET bonus_pro_until = $2 WHERE id = $1`, [professionalId, endsAt]);
  await recordFunnelEvent(m, { type: FunnelEventType.PRO_TRIAL_STARTED, professionalId, at: now });
}

/**
 * Sus números reales del período de prueba (de `started_at` a `ends_at`). La UI
 * arma las frases (`pro-value.ts`) y no muestra lo que vale 0.
 * - `featuredImpressions`: apariciones en espacios Destacados (`exposure_events`);
 * - `earlyOpportunities`: solicitudes nuevas que vio antes que un Free demorado
 *   en esa misma solicitud (`pro_funnel_events`, misma regla que Tu mes);
 * - `profileViews`: visitas a su perfil (`exposure_events`);
 * - `quotesAboveFreeLimit`: solicitudes nuevas (no dirigidas) que presupuestó por
 *   primera vez durante la prueba por encima del cupo Free que le quedaba al empezar.
 */
export interface ProTrialSummary {
  startedAt: string;
  endsAt: string;
  days: number;
  featuredImpressions: number;
  earlyOpportunities: number;
  profileViews: number;
  quotesAboveFreeLimit: number;
  whatsappTaps: number;
  phoneTaps: number;
}

export async function proTrialSummary(
  db: Pick<EntityManager, 'query'>,
  professionalId: string,
  now = new Date(),
): Promise<ProTrialSummary | null> {
  const trial = await trialOf(db, professionalId);
  if (!trial || new Date(trial.ends_at) > now) return null;
  const [row] = await db.query(
    `SELECT
       (SELECT count(*) FROM exposure_events e
         WHERE e.professional_id = $1 AND e.type = 'SEARCH_IMPRESSION' AND e.is_featured_placement
           AND e.occurred_at >= $2 AND e.occurred_at < $3)::int AS featured,
       (SELECT count(*) FROM exposure_events e
         WHERE e.professional_id = $1 AND e.type = 'PROFILE_VIEW'
           AND e.occurred_at >= $2 AND e.occurred_at < $3)::int AS views,
       (SELECT count(*) FROM exposure_events e
         WHERE e.professional_id = $1 AND e.type = 'WHATSAPP_CLICK'
           AND e.occurred_at >= $2 AND e.occurred_at < $3)::int AS whatsapp,
       (SELECT count(*) FROM exposure_events e
         WHERE e.professional_id = $1 AND e.type = 'PHONE_CLICK'
           AND e.occurred_at >= $2 AND e.occurred_at < $3)::int AS phone,
       (SELECT count(DISTINCT f.ref) FROM pro_funnel_events f
         WHERE f.professional_id = $1 AND ${EARLY_AHEAD_OF_FREE_SQL('f')}
           AND f.occurred_at >= $2 AND f.occurred_at < $3)::int AS early,
       (SELECT count(*) FROM (
          SELECT min(q.created_at) AS first_at FROM quotes q
            JOIN request_invitations i
              ON i.request_id = q.request_id AND i.professional_id = q.professional_id AND NOT i.targeted
           WHERE q.professional_id = $1
           GROUP BY q.request_id) x
         WHERE x.first_at >= $2 AND x.first_at < $3)::int AS discovery_quotes`,
    [professionalId, trial.started_at, trial.ends_at],
  );
  return {
    startedAt: new Date(trial.started_at).toISOString(),
    endsAt: new Date(trial.ends_at).toISOString(),
    days: trial.days,
    featuredImpressions: row.featured,
    earlyOpportunities: row.early,
    profileViews: row.views,
    whatsappTaps: row.whatsapp,
    phoneTaps: row.phone,
    quotesAboveFreeLimit:
      trial.free_quota_remaining === null ? 0 : Math.max(0, row.discovery_quotes - trial.free_quota_remaining),
  };
}

/** Vio el resumen (cerró el aviso del panel): no se vuelve a abrir solo. Idempotente. */
export async function acknowledgeProTrialSummary(
  db: Pick<EntityManager, 'query'>,
  professionalId: string,
): Promise<void> {
  await db.query(
    `UPDATE pro_trials SET summary_seen_at = now()
      WHERE professional_id = $1 AND ends_at <= now() AND summary_seen_at IS NULL`,
    [professionalId],
  );
}
