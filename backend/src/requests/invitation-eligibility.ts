import type { ConfigService } from '@nestjs/config';
import type { EntityManager } from 'typeorm';
import { resolveProfessionalAccess } from '../plans/plan';
import { quoteLimitFor } from '../plans/quote-quota';
import type { ProfileForEligibility } from '../professionals/professional-eligibility';
import {
  IneligibilityReason,
  isTakingUrgencies,
  requestIneligibility,
  WorkLocation,
} from '../professionals/professional-rules';
import { RequestUrgency } from './request.enums';

/**
 * Quién PUEDE RESPONDER una invitación nueva a un pedido. Única fuente: la usan el endpoint de
 * invitaciones (validación al enviar) y las recomendaciones de "Sumar profesionales", para que
 * lo que se recomienda sea exactamente lo que el endpoint acepta.
 *
 * Además de poder recibir el pedido (`requestIneligibility`) y atender urgencias cuando es
 * URGENT, un Free posterior al primer éxito que ya agotó sus oportunidades discovery no puede
 * responder una invitación de descubrimiento. Excepción: un pedido dirigido (primera invitación,
 * un único profesional, `targeted`) no consume cupo, así que no se excluye por cupo agotado. El
 * acceso inicial hasta el primer éxito tampoco tiene tope.
 */
export type InviteBlockReason = IneligibilityReason | 'NOT_AVAILABLE_TODAY' | 'QUOTA_EXHAUSTED';

/** Mensajes al invitar a alguien que no puede responder (el cliente los ve). */
export const INVITE_BLOCK_MESSAGES: Record<InviteBlockReason, string> = {
  PROFILE_PAUSED: 'Este profesional no está recibiendo solicitudes',
  REQUESTS_DISABLED: 'Este profesional no recibe solicitudes por Resuelve: contactalo por WhatsApp o teléfono',
  SERVICE_NOT_OFFERED: 'El profesional no ofrece este servicio',
  LOCALITY_NOT_COVERED: 'El profesional no trabaja en esa localidad',
  ZONE_NOT_COVERED: 'El profesional no trabaja en ese barrio',
  NOT_AVAILABLE_TODAY: 'Para urgencias solo se puede invitar a quien atiende urgencias',
  QUOTA_EXHAUSTED: 'Este profesional no puede responder más solicitudes por ahora: contactalo por WhatsApp o teléfono si lo habilitó',
};

export interface InviteContext extends WorkLocation {
  service: { id: string };
  urgency: RequestUrgency;
  /** La invitación es dirigida (no consume cupo Free). */
  targeted: boolean;
}

export interface QuotaState {
  /** null = sin tope (PRO, acceso inicial o Free sin límite configurado). */
  limit: number | null;
  /** Oportunidades discovery distintas que ya consumió. */
  used: number;
  /** Acceso inicial hasta el primer éxito: sin tope. */
  trialActive: boolean;
}

/** Primer motivo por el que NO puede responder esta invitación, o null. Pura. */
export function inviteBlock(
  profile: ProfileForEligibility,
  ctx: InviteContext,
  quota: QuotaState,
): InviteBlockReason | null {
  const ineligible = requestIneligibility(profile, ctx);
  if (ineligible) return ineligible;
  if (ctx.urgency === RequestUrgency.URGENT && !isTakingUrgencies(profile)) return 'NOT_AVAILABLE_TODAY';
  if (!ctx.targeted && !quota.trialActive && quota.limit !== null && quota.used >= quota.limit) return 'QUOTA_EXHAUSTED';
  return null;
}

/** Oportunidades discovery consumidas por cada profesional (una consulta). */
export async function loadQuotaUsage(
  m: Pick<EntityManager, 'query'>,
  professionalIds: readonly string[],
): Promise<Map<string, number>> {
  if (!professionalIds.length) return new Map();
  const rows = await m.query(
    `SELECT professional_id, count(*)::int AS used FROM quote_quota_usages
      WHERE consumes_free_quota = true AND professional_id = ANY($1::uuid[]) GROUP BY professional_id`,
    [[...professionalIds]],
  );
  return new Map((rows as { professional_id: string; used: number }[]).map((r) => [r.professional_id, r.used]));
}

/** Motivo de bloqueo (o null) de cada perfil para ESTA invitación, con el cupo de ahora. */
export async function assessInvitees(
  m: Pick<EntityManager, 'query'>,
  config: ConfigService,
  profiles: readonly ProfileForEligibility[],
  ctx: InviteContext,
  now = new Date(),
): Promise<Map<string, InviteBlockReason | null>> {
  const usage = await loadQuotaUsage(
    m,
    profiles.map((p) => p.id),
  );
  const firstSuccessTrialEnabled = config.get<boolean>('FIRST_SUCCESS_TRIAL_ENABLED', true);
  return new Map(
    profiles.map((p) => [
      p.id,
      inviteBlock(p, ctx, {
        limit: quoteLimitFor(p, config, now),
        used: usage.get(p.id) ?? 0,
        trialActive: resolveProfessionalAccess(p, { firstSuccessTrialEnabled }, now).trialActive,
      }),
    ]),
  );
}
