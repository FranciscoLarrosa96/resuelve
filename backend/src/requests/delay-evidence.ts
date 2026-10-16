import type { EntityManager } from 'typeorm';

/**
 * Evidencia de "le llegó antes / después" entre profesionales de UN MISMO pedido. Única fuente.
 *
 * Lo que se cuenta como hecho comercial sale de lo registrado cuando pasó, nunca del plan
 * que el profesional tiene hoy:
 * - un PRO tuvo acceso anticipado a la solicitud = existe `EARLY_OPPORTUNITY_DELIVERED` con
 *   `billingPlan` PRO/PRO Plus y `earlyAccess` para ese pedido (se graba en la misma
 *   transacción que la invitación, con el plan resuelto en ese momento);
 * - un Free llegó después = su invitación tiene `available_at > sent_at` (no dirigida);
 * - ocurrió entre ambos si el acceso del PRO es anterior a `available_at` del Free.
 * Una demora sin ese evento (solicitudes anteriores a esta regla) no se puede demostrar:
 * sigue guardada, pero no se muestra ni se cuenta como "después que a PRO".
 */

/** Evento de acceso anticipado PRO del pedido de la invitación `i` (alias `e` del evento). */
export const PRO_EARLY_EVENT_SQL = (e: string, i: string) =>
  `${e}.type = 'EARLY_OPPORTUNITY_DELIVERED' AND ${e}.ref = ${i}.request_id::text
   AND ${e}.context->>'billingPlan' IN ('PRO', 'PRO_PLUS') AND ${e}.context->>'earlyAccess' = 'true'
   AND ${e}.occurred_at < ${i}.available_at`;

/**
 * La invitación `i` (alias de `request_invitations`) se demoró y está demostrado que un PRO
 * del mismo pedido la tuvo antes. Es la forma de contar "te llegó después que a PRO".
 */
export const DELAYED_BEHIND_PRO_SQL = (i = 'i') =>
  `(NOT ${i}.targeted AND ${i}.available_at > ${i}.sent_at AND EXISTS (
     SELECT 1 FROM pro_funnel_events pe WHERE ${PRO_EARLY_EVENT_SQL('pe', i)}))`;

/**
 * El evento `f` (EARLY_OPPORTUNITY_DELIVERED de un PRO) cuenta como "la viste antes que los
 * perfiles Free" solo si en esa misma solicitud hay un Free con la demora registrada y su
 * acceso es posterior al del PRO.
 */
export const EARLY_AHEAD_OF_FREE_SQL = (f = 'f') =>
  `(${f}.type = 'EARLY_OPPORTUNITY_DELIVERED' AND ${f}.context->>'billingPlan' IN ('PRO', 'PRO_PLUS')
    AND ${f}.context->>'earlyAccess' = 'true' AND EXISTS (
      SELECT 1 FROM request_invitations fi
       WHERE fi.request_id::text = ${f}.ref AND fi.professional_id <> ${f}.professional_id
         AND NOT fi.targeted AND fi.available_at > fi.sent_at AND fi.available_at > ${f}.occurred_at))`;

/**
 * Cuándo tuvo acceso el primer PRO de cada pedido, según lo registrado en ese momento.
 * Los pedidos sin esa evidencia no aparecen en el mapa.
 */
export async function loadProAccessAt(
  m: Pick<EntityManager, 'query'>,
  requestIds: string[],
): Promise<Map<string, Date>> {
  const out = new Map<string, Date>();
  const ids = [...new Set(requestIds)];
  if (!ids.length) return out;
  const rows = await m.query(
    `SELECT e.ref AS request_id, min(e.occurred_at) AS at
       FROM pro_funnel_events e
      WHERE e.type = 'EARLY_OPPORTUNITY_DELIVERED' AND e.ref = ANY($1::text[])
        AND e.context->>'billingPlan' IN ('PRO', 'PRO_PLUS') AND e.context->>'earlyAccess' = 'true'
      GROUP BY e.ref`,
    [ids],
  );
  for (const r of rows as { request_id: string; at: Date }[]) out.set(r.request_id, new Date(r.at));
  return out;
}
