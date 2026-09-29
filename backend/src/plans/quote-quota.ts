import type { ConfigService } from '@nestjs/config';
import type { EntityManager } from 'typeorm';
import { BusinessMonth, businessMonthRange, currentBusinessMonth } from '../common/time';
import { PlanFields, resolveProfessionalEntitlements } from './plan';

/**
 * Cupo mensual de presupuestos del plan FREE.
 *
 * - Cuenta SOLICITUDES DISTINTAS cuyo PRIMER presupuesto de este profesional
 *   cae en el mes (Argentina). Editar, retirar y volver a presupuestar la misma
 *   solicitud no suma otra: la fila original nunca se borra, así que no hay
 *   forma de "liberar" cupo.
 * - `quote_quota_usages` conserva respuestas discovery para mostrar el uso y
 *   preservar el historial si PRO pasa a Free. El cupo solo bloquea Free;
 *   trial, solicitudes dirigidas y ediciones no agregan filas. Al cambiar de
 *   mes vuelve a 0 por rango de fechas, sin cron.
 * - Recibir y ver solicitudes nunca tiene tope; el límite aplica al responder.
 */

/** Tope FREE configurado (`FREE_MONTHLY_QUOTE_LIMIT`, default 5). null = sin límite. */
export function freeQuoteLimit(config: ConfigService): number | null {
  const limit = config.get<number>('FREE_MONTHLY_QUOTE_LIMIT', 5);
  return limit > 0 ? limit : null;
}

/** Tope del plan EFECTIVO del profesional. null = sin límite (PRO o FREE sin tope). */
export function quoteLimitFor(profile: PlanFields, config: ConfigService, now = new Date()): number | null {
  return resolveProfessionalEntitlements(profile, now, {
    firstSuccessTrialEnabled: config.get<boolean>('FIRST_SUCCESS_TRIAL_ENABLED', true),
  }).canSendUnlimitedQuotes
    ? null
    : freeQuoteLimit(config);
}

/** Solicitudes distintas presupuestadas por primera vez en el mes. */
export async function monthlyQuoteUsage(
  m: Pick<EntityManager, 'query'>,
  professionalId: string,
  month: BusinessMonth = currentBusinessMonth(),
): Promise<number> {
  const { start, end } = businessMonthRange(month);
  const [row] = await m.query<{ used: number }[]>(
    `SELECT count(*)::int AS used FROM quote_quota_usages
      WHERE professional_id = $1 AND consumed_at >= $2 AND consumed_at < $3`,
    [professionalId, start, end],
  );
  return row.used;
}

export interface OpportunityStats {
  compatibleReceived: number;
  blockedOpportunities: number;
}

/** Datos reales para Mi Plan: invitaciones del mes y pendientes bloqueadas hoy. */
export async function monthlyOpportunityStats(
  m: Pick<EntityManager, 'query'>,
  professionalId: string,
  blocked: boolean,
  month: BusinessMonth = currentBusinessMonth(),
): Promise<OpportunityStats> {
  const { start, end } = businessMonthRange(month);
  const [row] = await m.query<{ compatible: number; blocked: number }[]>(
    `SELECT count(DISTINCT i.request_id)::int AS compatible,
            count(DISTINCT i.request_id) FILTER (
              WHERE $4 AND NOT i.targeted AND i.status = 'PENDING'
                AND NOT EXISTS (SELECT 1 FROM quotes q
                  WHERE q.professional_id = i.professional_id AND q.request_id = i.request_id)
            )::int AS blocked
       FROM request_invitations i
      WHERE i.professional_id = $1 AND i.sent_at >= $2 AND i.sent_at < $3`,
    [professionalId, start, end, blocked],
  );
  return { compatibleReceived: row?.compatible ?? 0, blockedOpportunities: row?.blocked ?? 0 };
}

/** true si ya había presupuestado esta solicitud alguna vez (volver a hacerlo no consume cupo). */
export async function alreadyQuoted(
  m: Pick<EntityManager, 'query'>,
  professionalId: string,
  requestId: string,
): Promise<boolean> {
  const rows = await m.query<unknown[]>(
    `SELECT 1 FROM quotes WHERE professional_id = $1 AND request_id = $2 LIMIT 1`,
    [professionalId, requestId],
  );
  return rows.length > 0;
}

export interface QuoteUsage {
  period: BusinessMonth;
  /** Solicitudes presupuestadas este mes. */
  used: number;
  /** null = sin límite. */
  limit: number | null;
  /** null = sin límite. Nunca negativo (un PRO que bajó a FREE puede tener used > limit). */
  remaining: number | null;
  /** Invitaciones compatibles recibidas durante el mes (datos reales). */
  compatibleReceived?: number;
  /** Invitaciones discovery pendientes que hoy están bloqueadas por cupo. */
  blockedOpportunities?: number;
}

export function presentQuoteUsage(
  used: number,
  limit: number | null,
  period = currentBusinessMonth(),
): QuoteUsage {
  return { period, used, limit, remaining: limit === null ? null : Math.max(0, limit - used) };
}
