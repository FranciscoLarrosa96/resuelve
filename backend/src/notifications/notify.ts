import { EntityManager, In, IsNull } from 'typeorm';
import { Notification, NotificationType } from './notification.entity';

/**
 * Tipos que se reemplazan entre sí en una misma solicitud: si llega un
 * horario nuevo, el aviso del anterior ya no pide nada (se marca leído).
 */
const SUPERSEDES: Partial<Record<NotificationType, readonly NotificationType[]>> = {
  CLIENT_APPOINTMENT_PROPOSED: [
    NotificationType.CLIENT_APPOINTMENT_PROPOSED,
    NotificationType.CLIENT_APPOINTMENT_RESCHEDULED,
    NotificationType.CLIENT_JOB_SCHEDULED,
    NotificationType.CLIENT_JOB_RESCHEDULED,
  ],
  CLIENT_APPOINTMENT_RESCHEDULED: [
    NotificationType.CLIENT_APPOINTMENT_PROPOSED,
    NotificationType.CLIENT_APPOINTMENT_RESCHEDULED,
    NotificationType.CLIENT_JOB_SCHEDULED,
    NotificationType.CLIENT_JOB_RESCHEDULED,
  ],
  CLIENT_JOB_SCHEDULED: [
    NotificationType.CLIENT_APPOINTMENT_PROPOSED,
    NotificationType.CLIENT_APPOINTMENT_RESCHEDULED,
    NotificationType.CLIENT_JOB_SCHEDULED,
    NotificationType.CLIENT_JOB_RESCHEDULED,
  ],
  CLIENT_JOB_RESCHEDULED: [
    NotificationType.CLIENT_APPOINTMENT_PROPOSED,
    NotificationType.CLIENT_APPOINTMENT_RESCHEDULED,
    NotificationType.CLIENT_JOB_SCHEDULED,
    NotificationType.CLIENT_JOB_RESCHEDULED,
  ],
  PRO_APPOINTMENT_CONFIRMED: [
    NotificationType.PRO_APPOINTMENT_CONFIRMED,
    NotificationType.PRO_APPOINTMENT_DECLINED,
  ],
  PRO_APPOINTMENT_DECLINED: [
    NotificationType.PRO_APPOINTMENT_CONFIRMED,
    NotificationType.PRO_APPOINTMENT_DECLINED,
  ],
};

export interface NotifyInput {
  /** Destinatario. */
  userId: string;
  type: NotificationType;
  /** Solicitud del evento. Solo los avisos de referidos van sin solicitud. */
  requestId?: string;
  quoteId?: string;
  appointmentId?: string;
  referralId?: string;
  /**
   * Clave del evento cuando no hay presupuesto ni cita (p. ej. la invitación:
   * solicitud + profesional; un trabajo; una reseña). Incluir la versión del
   * evento si puede repetirse (`<jobId>:v2`).
   */
  dedupeRef?: string;
  /** Aparece para el destinatario recién desde esta hora (oportunidad demorada). Pasada o ausente = ya. */
  availableAt?: Date | null;
  payload?: Notification['payload'];
  /**
   * Si ya hay un aviso SIN LEER del mismo tipo y presupuesto, no crea otro
   * (el profesional editó tres veces: una sola novedad hasta que se lea).
   */
  coalesceUnread?: boolean;
}

/**
 * Crea la notificación dentro de la transacción de la acción que la origina
 * (si la acción falla, no queda aviso). Idempotente por `dedupeKey`: un
 * reintento o un doble submit no la duplica. No notifica a quien actúa
 * (`actorUserId`); un evento del sistema pasa `null`.
 */
export async function notify(
  m: EntityManager,
  n: NotifyInput,
  actorUserId: string | null,
): Promise<void> {
  if (actorUserId && n.userId === actorUserId) return;
  const ref = n.dedupeRef ?? n.quoteId ?? n.appointmentId ?? n.referralId ?? n.requestId;
  if (!ref) throw new Error(`notify(${n.type}) necesita una referencia para deduplicar`);
  if (n.coalesceUnread && n.quoteId) {
    const pending = await m.existsBy(Notification, {
      userId: n.userId,
      type: n.type,
      quoteId: n.quoteId,
      readAt: IsNull(),
    });
    if (pending) return;
  }
  const superseded = SUPERSEDES[n.type];
  if (superseded && n.requestId) {
    await m.update(
      Notification,
      { userId: n.userId, requestId: n.requestId, type: In([...superseded]), readAt: IsNull() },
      { readAt: new Date() },
    );
  }
  await m
    .createQueryBuilder()
    .insert()
    .into(Notification)
    .values({
      userId: n.userId,
      type: n.type,
      requestId: n.requestId ?? null,
      quoteId: n.quoteId ?? null,
      appointmentId: n.appointmentId ?? null,
      referralId: n.referralId ?? null,
      availableAt: n.availableAt && n.availableAt.getTime() > Date.now() ? n.availableAt : null,
      payload: n.payload ?? null,
      dedupeKey: `${n.type}:${ref}`,
    })
    .orIgnore()
    .execute();
}

/** El aviso dejó de pedir algo (p. ej. se retiró el presupuesto): queda leído, no se borra. */
export async function markNotificationsRead(
  m: EntityManager,
  where: { userId?: string; requestId: string; types: readonly NotificationType[]; quoteId?: string },
): Promise<void> {
  await m.update(
    Notification,
    {
      requestId: where.requestId,
      type: In([...where.types]),
      readAt: IsNull(),
      ...(where.userId ? { userId: where.userId } : {}),
      ...(where.quoteId ? { quoteId: where.quoteId } : {}),
    },
    { readAt: new Date() },
  );
}

/** Predicado SQL: el aviso ya existe para quien lo recibe (no es una oportunidad todavía demorada). */
export const NOTIFICATION_VISIBLE_SQL = (alias = 'n') =>
  `(${alias}.available_at IS NULL OR ${alias}.available_at <= now())`;

/**
 * Trabajo realizado y sin reseña: "Podés dejar una reseña". Lo dispara cada
 * camino que completa un trabajo (cliente o profesional) dentro de su
 * transacción; es un recordatorio de un paso pendiente, así que le llega al
 * cliente aunque haya sido él quien lo cerró. Una por solicitud.
 */
export async function notifyReviewAvailable(
  m: EntityManager,
  request: { id: string; clientId: string },
): Promise<void> {
  await notify(
    m,
    {
      userId: request.clientId,
      type: NotificationType.CLIENT_REVIEW_AVAILABLE,
      requestId: request.id,
      dedupeRef: request.id,
    },
    null,
  );
}
