import type { EntityManager } from 'typeorm';
import { OFFERS_PUBLICLY_SQL } from '../professionals/professional-rules';
import { businessToday, currentBusinessMonth } from '../common/time';
import { FunnelEvent, FunnelEventType } from './funnel-event.entity';

/**
 * Cuántas veces cuenta un evento:
 * - ONCE: una vez por profesional (los "FIRST_*", registro, perfil completo);
 * - REF: una por profesional + referencia (una solicitud, un cobro, una suscripción);
 * - DAY: una por profesional + referencia + día de Argentina (vistas y clicks);
 * - MONTH: una por profesional + mes de Argentina (tope Free alcanzado).
 */
export type FunnelDedupe = 'ONCE' | 'REF' | 'DAY' | 'MONTH';

export const FUNNEL_DEDUPE: Record<FunnelEventType, FunnelDedupe> = {
  PROFESSIONAL_REGISTERED: 'ONCE',
  PROFILE_COMPLETED: 'ONCE',
  FIRST_COMPATIBLE_OPPORTUNITY_RECEIVED: 'ONCE',
  FIRST_QUOTE_SENT: 'ONCE',
  FIRST_QUOTE_ACCEPTED: 'ONCE',
  FIRST_SUCCESS_REACHED: 'ONCE',
  PRO_PLAN_VIEWED: 'DAY',
  PRO_CTA_CLICKED: 'DAY',
  PRO_CHECKOUT_STARTED: 'REF',
  PRO_PAYMENT_APPROVED: 'REF',
  PRO_CANCELLED: 'REF',
  PRO_RENEWED: 'REF',
  FREE_QUOTE_USED: 'REF',
  FREE_QUOTE_LIMIT_REACHED: 'MONTH',
  FREE_BLOCKED_OPPORTUNITY_VIEWED: 'REF',
  EARLY_OPPORTUNITY_DELIVERED: 'REF',
  DELAYED_OPPORTUNITY_UNLOCKED: 'REF',
  FEATURED_ATTRIBUTED_REQUEST: 'REF',
};

export function funnelDedupeKey(
  type: FunnelEventType,
  professionalId: string,
  ref: string | null = null,
  now = new Date(),
): string {
  const parts: string[] = [type, professionalId];
  switch (FUNNEL_DEDUPE[type]) {
    case 'REF':
      parts.push(ref ?? '-');
      break;
    case 'DAY':
      parts.push(ref ?? '-', businessToday(now));
      break;
    case 'MONTH': {
      const m = currentBusinessMonth(now);
      parts.push(`${m.year}-${String(m.month).padStart(2, '0')}`);
      break;
    }
  }
  return parts.join(':');
}

export interface FunnelEventInput {
  type: FunnelEventType;
  professionalId: string;
  ref?: string | null;
  /** Momento real del hecho (default: ahora). */
  at?: Date;
}

/**
 * Registra un evento del embudo dentro de la transacción de la acción (si la
 * acción falla, no queda). Idempotente: `INSERT … ON CONFLICT DO NOTHING`.
 * Devuelve true si es la primera vez.
 */
export async function recordFunnelEvent(
  m: Pick<EntityManager, 'createQueryBuilder'>,
  e: FunnelEventInput,
): Promise<boolean> {
  const at = e.at ?? new Date();
  const ref = e.ref ?? null;
  const result = await m
    .createQueryBuilder()
    .insert()
    .into(FunnelEvent)
    .values({
      type: e.type,
      professionalId: e.professionalId,
      ref,
      dedupeKey: funnelDedupeKey(e.type, e.professionalId, ref, at),
      occurredAt: at,
    })
    .orIgnore()
    .returning('id')
    .execute();
  return (result.raw as unknown[]).length > 0;
}

/**
 * "Perfil completo" = lo mismo que puede recibir oportunidades: perfil activo
 * con titular, al menos un servicio que ofrece públicamente (con matrícula
 * aprobada y vigente si la requiere) y cobertura. Se evalúa después de crear
 * o editar el perfil y al aprobar una matrícula; cuenta una sola vez.
 */
export async function recordProfileCompletedIfReady(m: EntityManager, professionalId: string): Promise<void> {
  const [row] = await m.query<{ ready: boolean }[]>(
    `SELECT (p.status = 'ACTIVE' AND coalesce(trim(p.headline), '') <> ''
       AND EXISTS (SELECT 1 FROM professional_services ps JOIN services s ON s.id = ps.service_id
                    WHERE ps.professional_id = p.id AND s.active
                      AND ${OFFERS_PUBLICLY_SQL})
       AND (p.covers_entire_city OR EXISTS (
             SELECT 1 FROM professional_service_areas a JOIN zones z ON z.id = a.zone_id
              WHERE a.professional_id = p.id AND z.active))) AS ready
       FROM professional_profiles p WHERE p.id = $1`,
    [professionalId],
  );
  if (row?.ready) {
    await recordFunnelEvent(m, { type: FunnelEventType.PROFILE_COMPLETED, professionalId });
  }
}
