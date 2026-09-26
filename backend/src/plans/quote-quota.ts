import type { ConfigService } from '@nestjs/config';
import type { EntityManager } from 'typeorm';
import { BusinessMonth, businessMonthRange, currentBusinessMonth } from '../common/time';
import { entitlementsFor, effectivePlan } from './plan';
import type { ProfessionalProfile } from '../professionals/professional-profile.entity';

/**
 * Cupo mensual de presupuestos del plan FREE.
 *
 * - Cuenta SOLICITUDES DISTINTAS cuyo PRIMER presupuesto de este profesional
 *   cae en el mes (Argentina). Editar, retirar y volver a presupuestar la misma
 *   solicitud no suma otra: la fila original nunca se borra, así que no hay
 *   forma de "liberar" cupo.
 * - Se deriva por query de `quotes` (sin contador): al cambiar de mes vuelve a
 *   0 solo, sin cron.
 * - Recibir y ver solicitudes nunca tiene tope; el límite aplica al responder.
 */

/** Tope FREE configurado (`FREE_MONTHLY_QUOTE_LIMIT`, default 10). null = sin límite. */
export function freeQuoteLimit(config: ConfigService): number | null {
  const limit = config.get<number>('FREE_MONTHLY_QUOTE_LIMIT', 10);
  return limit > 0 ? limit : null;
}

/** Tope del plan EFECTIVO del profesional. null = sin límite (PRO o FREE sin tope). */
export function quoteLimitFor(
  profile: Pick<ProfessionalProfile, 'planTier' | 'planExpiresAt'>,
  config: ConfigService,
  now = new Date(),
): number | null {
  return entitlementsFor(effectivePlan(profile, now)).canSendUnlimitedQuotes ? null : freeQuoteLimit(config);
}

/** Solicitudes distintas presupuestadas por primera vez en el mes. */
export async function monthlyQuoteUsage(
  m: Pick<EntityManager, 'query'>,
  professionalId: string,
  month: BusinessMonth = currentBusinessMonth(),
): Promise<number> {
  const { start, end } = businessMonthRange(month);
  const [row] = await m.query<{ used: number }[]>(
    `SELECT count(*)::int AS used FROM (
       SELECT min(created_at) AS first_at FROM quotes
        WHERE professional_id = $1 AND created_at < $3
        GROUP BY request_id) f
      WHERE first_at >= $2`,
    [professionalId, start, end],
  );
  return row.used;
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
}

export function presentQuoteUsage(
  used: number,
  limit: number | null,
  period = currentBusinessMonth(),
): QuoteUsage {
  return { period, used, limit, remaining: limit === null ? null : Math.max(0, limit - used) };
}
