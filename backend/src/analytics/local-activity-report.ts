import type { EntityManager } from 'typeorm';

/** Indicadores independientes del período; nunca tasas ni atribución entre clientes y compradores. */
export const LOCAL_ACTIVITY_NOTES = [
  'Apariciones son tarjetas visibles, no búsquedas ni personas únicas. Visitas y toques no prueban clientes ni trabajos.',
  'La localidad de exposición/contacto se conoce solo cuando el evento conserva un barrio. Sin barrio queda SIN_LOCALIDAD; nunca se deduce por la cobertura del profesional.',
  'Pedidos: primera invitación del período, sin borradores. Aceptados y realizados: estado observado al consultar de esos mismos pedidos.',
  'Compras y renovaciones: profesionales distintos con evento confirmado del período (PRO o Plus), agrupados por su localidad principal ACTUAL, no por la ubicación del cliente ni la histórica del cobro.',
  'No se puede reconstruir una conversión búsqueda → compra de PRO: son públicos, cohortes y unidades diferentes. El histórico sin localidad no es cero.',
  'Avisos "Avisame cuando haya": personas que buscaron un servicio sin oferta en su localidad y pidieron aviso (por fecha del pedido). `waiting` = los que siguen esperando hoy, por localidad y servicio: sirve para saber qué oficios sumar; no son pedidos de presupuesto.',
] as const;

export async function localActivityReport(db: Pick<EntityManager, 'query'>, from: Date, to: Date) {
  if (!Number.isFinite(+from) || !Number.isFinite(+to) || from >= to) throw new Error('Período inválido');
  const rows = await db.query(
    `WITH sent AS (
       SELECT r.id, r.city_id, r.completed_at, min(i.sent_at) AS sent_at
         FROM service_requests r JOIN request_invitations i ON i.request_id = r.id
        GROUP BY r.id
     ), facts AS (
       SELECT z.city_id, e.type::text AS metric, count(*)::int AS n
         FROM exposure_events e LEFT JOIN zones z ON z.id = e.zone_id
        WHERE e.occurred_at >= $1 AND e.occurred_at < $2
        GROUP BY z.city_id, e.type
       UNION ALL
       SELECT city_id, 'SENT', count(*)::int FROM sent WHERE sent_at >= $1 AND sent_at < $2 GROUP BY city_id
       UNION ALL
       SELECT s.city_id, 'ACCEPTED', count(*)::int FROM sent s
        WHERE s.sent_at >= $1 AND s.sent_at < $2 AND EXISTS (SELECT 1 FROM quotes q WHERE q.request_id = s.id AND q.accepted_at IS NOT NULL) GROUP BY s.city_id
       UNION ALL
       SELECT city_id, 'COMPLETED', count(*)::int FROM sent WHERE sent_at >= $1 AND sent_at < $2 AND completed_at IS NOT NULL GROUP BY city_id
       UNION ALL
       SELECT p.primary_city_id, f.type::text, count(DISTINCT f.professional_id)::int
         FROM pro_funnel_events f JOIN professional_profiles p ON p.id = f.professional_id
        WHERE f.occurred_at >= $1 AND f.occurred_at < $2
          AND f.type IN ('PRO_PLAN_VIEWED', 'PRO_CTA_CLICKED', 'PRO_CHECKOUT_STARTED', 'PRO_PAYMENT_APPROVED', 'PRO_RENEWED')
        GROUP BY p.primary_city_id, f.type
       UNION ALL
       SELECT city_id, 'DEMAND_ALERT', count(*)::int FROM demand_alerts
        WHERE created_at >= $1 AND created_at < $2 GROUP BY city_id
     )
     SELECT f.city_id AS "localityId", COALESCE(c.name || ', ' || c.province, 'SIN_LOCALIDAD') AS label,
       COALESCE(sum(n) FILTER (WHERE metric = 'SEARCH_IMPRESSION'), 0)::int AS "cardImpressions",
       COALESCE(sum(n) FILTER (WHERE metric = 'PROFILE_VIEW'), 0)::int AS "profileViews",
       COALESCE(sum(n) FILTER (WHERE metric = 'WHATSAPP_CLICK'), 0)::int AS "whatsappTaps",
       COALESCE(sum(n) FILTER (WHERE metric = 'PHONE_CLICK'), 0)::int AS "phoneTaps",
       COALESCE(sum(n) FILTER (WHERE metric = 'SENT'), 0)::int AS "requestsSent",
       COALESCE(sum(n) FILTER (WHERE metric = 'ACCEPTED'), 0)::int AS "requestsAccepted",
       COALESCE(sum(n) FILTER (WHERE metric = 'COMPLETED'), 0)::int AS "requestsCompleted",
       COALESCE(sum(n) FILTER (WHERE metric = 'DEMAND_ALERT'), 0)::int AS "demandAlertsRequested",
       COALESCE(sum(n) FILTER (WHERE metric = 'PRO_PLAN_VIEWED'), 0)::int AS "professionalsViewingPlan",
       COALESCE(sum(n) FILTER (WHERE metric = 'PRO_CTA_CLICKED'), 0)::int AS "professionalsClickingPro",
       COALESCE(sum(n) FILTER (WHERE metric = 'PRO_CHECKOUT_STARTED'), 0)::int AS "professionalsStartingCheckout",
       COALESCE(sum(n) FILTER (WHERE metric = 'PRO_PAYMENT_APPROVED'), 0)::int AS "professionalsApproved",
       COALESCE(sum(n) FILTER (WHERE metric = 'PRO_RENEWED'), 0)::int AS "professionalsRenewed"
       FROM facts f LEFT JOIN cities c ON c.id = f.city_id
      GROUP BY f.city_id, c.name, c.province ORDER BY label`,
    [from, to],
  );
  const waiting = await db.query(
    `SELECT c.name || ', ' || c.province AS locality, s.name AS service, count(*)::int AS people
       FROM demand_alerts a JOIN cities c ON c.id = a.city_id JOIN services s ON s.id = a.service_id
      WHERE a.notified_at IS NULL
      GROUP BY c.name, c.province, s.name ORDER BY people DESC, locality, service`,
  );
  return { from: from.toISOString(), to: to.toISOString(), notes: LOCAL_ACTIVITY_NOTES, rows, waiting };
}
