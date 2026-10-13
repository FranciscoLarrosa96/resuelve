import type { EntityManager } from 'typeorm';

/** Respuestas que se miran (las más recientes): el dato sigue a cómo responde hoy. */
export const RESPONSE_TIME_SAMPLE = 20;
/** Con menos respuestas no se publica nada: 1 o 2 casos no dicen "suele". */
export const RESPONSE_TIME_MIN_SAMPLE = 3;

/**
 * Mediana (minutos) entre que una solicitud le llegó (`available_at`, así a un Free no
 * le cuenta la demora de acceso anticipado) y su primer presupuesto, sobre sus últimas
 * respuestas. null = menos de `RESPONSE_TIME_MIN_SAMPLE`. `idSql` es la expresión del id.
 */
export const RESPONSE_MINUTES_SQL = (idSql: string) => `(
  SELECT CASE WHEN count(*) >= ${RESPONSE_TIME_MIN_SAMPLE}
              THEN round(percentile_cont(0.5) WITHIN GROUP (ORDER BY a.minutes))::int END
    FROM (SELECT EXTRACT(EPOCH FROM (q.first_at - i.available_at)) / 60 AS minutes
            FROM request_invitations i
            JOIN LATERAL (SELECT min(created_at) AS first_at FROM quotes
                           WHERE professional_id = i.professional_id AND request_id = i.request_id) q
              ON q.first_at IS NOT NULL
           WHERE i.professional_id = ${idSql} AND q.first_at >= i.available_at
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
