import type { EntityManager } from 'typeorm';
import { PRO_EARLY_EVENT_SQL } from '../requests/delay-evidence';

/** Respuestas que se miran (las más recientes): el dato sigue a cómo responde hoy. */
export const RESPONSE_TIME_SAMPLE = 20;
/** Con menos respuestas no se publica nada: 1 o 2 casos no dicen "suele". */
export const RESPONSE_TIME_MIN_SAMPLE = 3;

/**
 * Desde cuándo pudo responder la invitación `i` (con el pedido `r`): la MISMA regla que usa
 * `resolveOpportunityTiming`. Cuenta `available_at` solo si la demora está demostrada (un PRO
 * del mismo pedido la tuvo antes, en un pedido normal y no dirigido); si no, la solicitud
 * pudo responderse desde que se envió (`sent_at`). Así una solicitud histórica que hoy se
 * libera antes de su `available_at` guardado no da tiempos negativos ni artificialmente
 * bajos, y una demora sin evidencia suficiente se trata como sin demora.
 */
export const EFFECTIVE_ACCESS_SQL = (i: string, r: string) =>
  `(CASE WHEN NOT ${i}.targeted AND ${i}.available_at > ${i}.sent_at
          AND ${r}.urgency NOT IN ('TODAY', 'URGENT')
          AND EXISTS (SELECT 1 FROM pro_funnel_events pe WHERE ${PRO_EARLY_EVENT_SQL('pe', i)})
         THEN ${i}.available_at ELSE ${i}.sent_at END)`;

/**
 * Mediana (minutos) entre que una solicitud pudo responderse (`EFFECTIVE_ACCESS_SQL`, así a
 * un Free no le cuenta la demora de acceso anticipado demostrada, y lo histórico sin
 * evidencia cuenta desde el envío) y su primer presupuesto, sobre sus últimas respuestas.
 * null = menos de `RESPONSE_TIME_MIN_SAMPLE`. `idSql` es la expresión del id.
 */
export const RESPONSE_MINUTES_SQL = (idSql: string) => `(
  SELECT CASE WHEN count(*) >= ${RESPONSE_TIME_MIN_SAMPLE}
              THEN round(percentile_cont(0.5) WITHIN GROUP (ORDER BY a.minutes))::int END
    FROM (SELECT EXTRACT(EPOCH FROM (q.first_at - ${EFFECTIVE_ACCESS_SQL('i', 'sr')})) / 60 AS minutes
            FROM request_invitations i
            JOIN service_requests sr ON sr.id = i.request_id
            JOIN LATERAL (SELECT min(created_at) AS first_at FROM quotes
                           WHERE professional_id = i.professional_id AND request_id = i.request_id) q
              ON q.first_at IS NOT NULL
           WHERE i.professional_id = ${idSql} AND q.first_at >= ${EFFECTIVE_ACCESS_SQL('i', 'sr')}
           ORDER BY q.first_at DESC LIMIT ${RESPONSE_TIME_SAMPLE}) a)`;

/**
 * Recalcula "Suele responder en…" (`average_response_minutes`) con datos reales. Se llama
 * en la transacción que crea un presupuesto: es lo único que lo cambia.
 */
export async function recalculateResponseTime(manager: EntityManager, professionalId: string): Promise<void> {
  await manager.query(
    `UPDATE professional_profiles SET average_response_minutes = ${RESPONSE_MINUTES_SQL('$1')} WHERE id = $1`,
    [professionalId],
  );
}
