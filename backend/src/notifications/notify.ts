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
  ],
  CLIENT_APPOINTMENT_RESCHEDULED: [
    NotificationType.CLIENT_APPOINTMENT_PROPOSED,
    NotificationType.CLIENT_APPOINTMENT_RESCHEDULED,
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
  requestId: string;
  quoteId?: string;
  appointmentId?: string;
}

/**
 * Crea la notificación dentro de la transacción de la acción que la origina
 * (si la acción falla, no queda aviso). Idempotente por `dedupeKey`: un
 * reintento o un doble submit no la duplica. Nunca notifica a quien actúa.
 */
export async function notify(m: EntityManager, n: NotifyInput, actorUserId: string): Promise<void> {
  if (n.userId === actorUserId) return;
  const ref = n.quoteId ?? n.appointmentId ?? n.requestId;
  const superseded = SUPERSEDES[n.type];
  if (superseded) {
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
      requestId: n.requestId,
      quoteId: n.quoteId ?? null,
      appointmentId: n.appointmentId ?? null,
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
