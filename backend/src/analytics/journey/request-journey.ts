import type { EntityManager } from 'typeorm';

/**
 * Recorrido del cliente al crear un pedido (medición propia, anónima).
 *
 * Un INTENTO es una clave aleatoria que el navegador crea al empezar un pedido y
 * conserva (sessionStorage) mientras viva el borrador: sobrevive a la recarga y al
 * paso por /ingresar. No identifica a nadie: ni usuario, ni IP, ni texto del pedido.
 *
 * RECORRIDOS (nunca se mezclan sus pasos en el reporte), según cómo empezó:
 * - REQUEST: arma el pedido paso a paso en /solicitud (inicio, "Crear solicitud");
 * - DIRECT:  un profesional ya elegido (perfil, tarjeta de resultados, recontratar);
 * - COMPARE: varios elegidos desde resultados, urgencias o sugeridos, directo a /presupuesto.
 */
export const JOURNEYS = ['REQUEST', 'DIRECT', 'COMPARE'] as const;
export type Journey = (typeof JOURNEYS)[number];

/** Eventos que informa el navegador. */
export const CLIENT_EVENT_TYPES = ['STARTED', 'STEP_VIEWED', 'QUOTE_VIEWED', 'AUTH_REQUIRED', 'AUTH_RETURNED'] as const;
/** SENT solo lo escribe el servidor, dentro de la transacción que deja las invitaciones enviadas. */
export type JourneyEventType = (typeof CLIENT_EVENT_TYPES)[number] | 'SENT';

/** Pasos de /solicitud (0 = qué necesitás … 4 = revisión). */
export const STEP_LABELS = ['Qué necesitás', 'Urgencia', 'Dónde', 'Cuándo', 'Revisión'] as const;
export const MAX_STEP = STEP_LABELS.length - 1;

/**
 * Ventana de observación: un intento sin actividad por más de esto deja de poder
 * completarse con su borrador (el del navegador vence a las 12 h: `DRAFT_TTL_MS`).
 * Es una convención de medición: NO prueba que la persona se haya ido.
 */
export const OBSERVATION_WINDOW_HOURS = 12;

export function journeyDedupeKey(attemptId: string, type: JourneyEventType, step: number | null): string {
  return `${attemptId}:${type}${step === null ? '' : `:${step}`}`;
}

/**
 * Envío confirmado: se llama dentro de la transacción de POST /requests/:id/invitations,
 * solo en el paso DRAFT → WAITING_QUOTES (invitaciones realmente creadas). Crear el
 * borrador no cuenta. Idempotente: una recarga o un reintento no suman otro envío.
 */
export async function recordRequestSent(
  m: Pick<EntityManager, 'query'>,
  attemptId: string | undefined,
  requestId: string,
): Promise<boolean> {
  if (!attemptId) return false;
  const rows = await m.query<unknown[]>(
    `INSERT INTO request_journey_events (attempt_id, type, request_id, dedupe_key)
     VALUES ($1, 'SENT', $2, $3) ON CONFLICT (dedupe_key) DO NOTHING RETURNING id`,
    [attemptId, requestId, journeyDedupeKey(attemptId, 'SENT', null)],
  );
  return rows.length > 0;
}
