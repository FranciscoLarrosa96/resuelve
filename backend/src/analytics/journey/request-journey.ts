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

/**
 * Versión de la INTERFAZ del pedido que emitió el evento. Cada versión tiene sus pasos y
 * sus etiquetas: nunca se suman en un mismo porcentaje.
 * - 1: asistente de 5 pasos (Qué necesitás, Urgencia, Dónde, Cuándo, Revisión). Todo lo
 *   registrado antes de la versión 2 (migración `RequestJourneyFlowVersion`) es 1.
 * - 2: asistente de 4 pasos (urgencia y fecha en una sola pantalla) y /presupuesto corto.
 */
export const FLOW_VERSIONS = [1, 2] as const;
export type FlowVersion = (typeof FLOW_VERSIONS)[number];
/** Un navegador viejo (pestaña abierta antes del cambio) no manda versión: es la 1. */
export const DEFAULT_FLOW_VERSION: FlowVersion = 1;

/** Pasos de /solicitud por versión (el índice es el `step` guardado). */
export const STEP_LABELS_BY_VERSION: Record<FlowVersion, readonly string[]> = {
  1: ['Qué necesitás', 'Urgencia', 'Dónde', 'Cuándo', 'Revisión'],
  2: ['Qué necesitás', 'Dónde', 'Cuándo', 'Revisión'],
};
/** Máximo paso posible (la restricción de la tabla admite hasta el 4 de la versión 1). */
export const MAX_STEP = STEP_LABELS_BY_VERSION[1].length - 1;
export const maxStepOf = (version: FlowVersion): number => STEP_LABELS_BY_VERSION[version].length - 1;

/**
 * Ventana de observación: un intento sin actividad por más de esto deja de poder
 * completarse con su borrador (el del navegador vence a las 12 h: `DRAFT_TTL_MS`).
 * Es una convención de medición: NO prueba que la persona se haya ido.
 */
export const OBSERVATION_WINDOW_HOURS = 12;

/**
 * Clave única del hecho. La versión 1 conserva su clave histórica; la 2 lleva su prefijo, para
 * que un mismo intento pueda registrar el paso 1 de cada interfaz (es lo que lo vuelve MIXTO)
 * sin que uno tape al otro. SENT no lleva versión: es del servidor.
 */
export function journeyDedupeKey(
  attemptId: string,
  type: JourneyEventType,
  step: number | null,
  version: FlowVersion = DEFAULT_FLOW_VERSION,
): string {
  const v = type !== 'SENT' && version !== DEFAULT_FLOW_VERSION ? `v${version}:` : '';
  return `${attemptId}:${v}${type}${step === null ? '' : `:${step}`}`;
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
    // flow_version queda NULL a propósito: el envío no pertenece a ninguna interfaz, y un valor por
    // defecto convertiría en MIXTO a todo intento de la versión 2.
    `INSERT INTO request_journey_events (attempt_id, type, request_id, dedupe_key)
     VALUES ($1, 'SENT', $2, $3) ON CONFLICT (dedupe_key) DO NOTHING RETURNING id`,
    [attemptId, requestId, journeyDedupeKey(attemptId, 'SENT', null)],
  );
  return rows.length > 0;
}
