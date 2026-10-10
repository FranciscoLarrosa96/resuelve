import type { EntityManager } from 'typeorm';
import { FunnelEventType as T } from './funnel-event.entity';

/** Pasos del embudo en orden (profesionales distintos de la cohorte que llegaron a cada uno). */
export const FUNNEL_STEPS = [
  { key: 'registered', label: 'Registro', type: T.PROFESSIONAL_REGISTERED },
  { key: 'profileCompleted', label: 'Perfil completo', type: T.PROFILE_COMPLETED },
  { key: 'firstOpportunity', label: 'Primera oportunidad', type: T.FIRST_COMPATIBLE_OPPORTUNITY_RECEIVED },
  { key: 'firstQuote', label: 'Primer presupuesto', type: T.FIRST_QUOTE_SENT },
  { key: 'firstAccepted', label: 'Primer presupuesto aceptado', type: T.FIRST_QUOTE_ACCEPTED },
  { key: 'firstSuccess', label: 'Primer éxito', type: T.FIRST_SUCCESS_REACHED },
  // Solo visitas a Mi plan (`PLAN_PAGE`): los avisos automáticos (popup, última oportunidad) van aparte, por superficie.
  { key: 'proOffer', label: 'Mi plan visitado', type: T.PRO_PLAN_VIEWED, ref: 'PLAN_PAGE' },
  { key: 'checkout', label: 'Checkout', type: T.PRO_CHECKOUT_STARTED },
  { key: 'pro', label: 'PRO (cobro aprobado)', type: T.PRO_PAYMENT_APPROVED },
  { key: 'renewed', label: 'Renovación', type: T.PRO_RENEWED },
] as const;

export type FunnelStepKey = (typeof FUNNEL_STEPS)[number]['key'];

export interface FunnelCounts extends Record<FunnelStepKey, number> {
  /** Llegaron a PRO pago DESPUÉS de su primer éxito. */
  proAfterFirstSuccess: number;
  cancelled: number;
}

/** % con un decimal; null sin denominador. */
const pct = (n: number, d: number): number | null => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);

/**
 * Métricas del embudo (definiciones únicas, las usa el reporte):
 * - Activation Rate = primer presupuesto enviado / registrados;
 * - First Success Rate = primer éxito / registrados;
 * - Free → PRO = con un cobro PRO aprobado / registrados;
 * - First Success → PRO = PRO pago después del primer éxito / con primer éxito;
 * - PRO → segundo mes = con una renovación / con un cobro aprobado;
 * - Cancelación = cancelaron / con un cobro aprobado.
 */
export function funnelRates(c: FunnelCounts) {
  return {
    activationRate: pct(c.firstQuote, c.registered),
    firstSuccessRate: pct(c.firstSuccess, c.registered),
    freeToPro: pct(c.pro, c.registered),
    firstSuccessToPro: pct(c.proAfterFirstSuccess, c.firstSuccess),
    proToSecondMonth: pct(c.renewed, c.pro),
    cancellation: pct(c.cancelled, c.pro),
  };
}

/**
 * Cohorte = profesionales registrados en [from, to). Cada paso cuenta
 * profesionales distintos de esa cohorte con el evento (en cualquier momento).
 */
export async function funnelCounts(
  m: Pick<EntityManager, 'query'>,
  from: Date,
  to: Date,
): Promise<FunnelCounts> {
  const [row] = await m.query<Record<string, number>[]>(
    `WITH cohort AS (
       SELECT professional_id FROM pro_funnel_events
        WHERE type = 'PROFESSIONAL_REGISTERED' AND occurred_at >= $1 AND occurred_at < $2),
     ev AS (
       SELECT e.professional_id, e.type, e.ref, min(e.occurred_at) AS first_at
         FROM pro_funnel_events e JOIN cohort c USING (professional_id)
        GROUP BY e.professional_id, e.type, e.ref)
     SELECT
       ${FUNNEL_STEPS.map((s) => `count(DISTINCT professional_id) FILTER (WHERE type = '${s.type}'${'ref' in s ? ` AND ref = '${s.ref}'` : ''})::int AS "${s.key}"`).join(',\n       ')},
       count(DISTINCT professional_id) FILTER (WHERE type = 'PRO_CANCELLED')::int AS "cancelled",
       (SELECT count(DISTINCT s.professional_id)::int FROM ev s JOIN ev p USING (professional_id)
         WHERE s.type = 'FIRST_SUCCESS_REACHED' AND p.type = 'PRO_PAYMENT_APPROVED' AND p.first_at >= s.first_at
       ) AS "proAfterFirstSuccess"
       FROM ev`,
    [from, to],
  );
  return row as unknown as FunnelCounts;
}

export interface SurfaceCounts {
  views: number;
  clicks: number;
}

/**
 * Vistas y clicks de PRO por superficie (profesionales distintos de la cohorte):
 * separa el popup de primer éxito y el aviso de última oportunidad de las
 * visitas explícitas a Mi plan (`PLAN_PAGE`). Los referidos no generan cobros.
 */
export async function funnelSurfaces(
  m: Pick<EntityManager, 'query'>,
  from: Date,
  to: Date,
): Promise<Record<string, SurfaceCounts>> {
  const rows = await m.query<{ surface: string; views: number; clicks: number }[]>(
    `WITH cohort AS (
       SELECT professional_id FROM pro_funnel_events
        WHERE type = 'PROFESSIONAL_REGISTERED' AND occurred_at >= $1 AND occurred_at < $2)
     SELECT e.ref AS surface,
            count(DISTINCT e.professional_id) FILTER (WHERE e.type = 'PRO_PLAN_VIEWED')::int AS views,
            count(DISTINCT e.professional_id) FILTER (WHERE e.type = 'PRO_CTA_CLICKED')::int AS clicks
       FROM pro_funnel_events e JOIN cohort c USING (professional_id)
      WHERE e.type IN ('PRO_PLAN_VIEWED', 'PRO_CTA_CLICKED')
      GROUP BY e.ref ORDER BY e.ref`,
    [from, to],
  );
  return Object.fromEntries(rows.map((r) => [r.surface, { views: r.views, clicks: r.clicks }]));
}
