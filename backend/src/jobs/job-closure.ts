import { EntityManager } from 'typeorm';
import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-codes';
import { NotificationType } from '../notifications/notification.entity';
import { markNotificationsRead, notify } from '../notifications/notify';

/** Duración que se asume si el trabajo se agendó sin duración. */
export const DEFAULT_JOB_MINUTES = 60;
/** Hora (Argentina) en que se puede cerrar un trabajo agendado sin hora. */
export const NO_TIME_CLOSE_HOUR = '20:00';

/**
 * Desde cuándo se puede cerrar un trabajo: termina su horario (comienzo +
 * duración, o 1 h si no hay duración). Sin hora, a las 20:00 del día pactado.
 * No hay botón "Iniciar": el cierre se habilita solo con el horario.
 */
export function jobCloseAt(
  scheduledDate: string,
  scheduledTime: string | null,
  durationMinutes: number | null,
): Date {
  const start = new Date(`${scheduledDate}T${(scheduledTime ?? NO_TIME_CLOSE_HOUR).slice(0, 5)}:00-03:00`);
  return scheduledTime
    ? new Date(start.getTime() + (durationMinutes ?? DEFAULT_JOB_MINUTES) * 60_000)
    : start;
}

/** 409 si todavía no terminó el horario (misma respuesta que cerrar una cita antes de tiempo). */
export function assertJobCloseable(closeAt: Date, now = new Date()): void {
  if (closeAt.getTime() > now.getTime()) {
    throw AppException.conflict(
      ErrorCode.APPOINTMENT_NOT_ENDED,
      'Vas a poder confirmarlo cuando termine el horario agendado',
      { endsAt: closeAt },
    );
  }
}

const CLOSE_TYPES = [NotificationType.CLIENT_JOB_CLOSE_DUE, NotificationType.PRO_JOB_CLOSE_DUE];

/**
 * Recordatorio de cierre para las dos partes: existe desde `closeAt`
 * (`available_at`), así que no hace falta cron ni polling para "avisar tarde".
 * Cada horario es un evento distinto (la clave lleva el instante de cierre).
 */
export async function scheduleCloseReminders(
  m: EntityManager,
  job: { id: string; requestId: string; clientId: string; professionalUserId: string; closeAt: Date },
): Promise<void> {
  await clearCloseReminders(m, job.requestId);
  const ref = `${job.id}:${job.closeAt.getTime()}`;
  await notify(
    m,
    { userId: job.clientId, type: NotificationType.CLIENT_JOB_CLOSE_DUE, requestId: job.requestId, dedupeRef: ref, availableAt: job.closeAt },
    null,
  );
  await notify(
    m,
    { userId: job.professionalUserId, type: NotificationType.PRO_JOB_CLOSE_DUE, requestId: job.requestId, dedupeRef: ref, availableAt: job.closeAt },
    null,
  );
}

/** El trabajo se cerró, canceló o reprogramó: el recordatorio anterior ya no pide nada. */
export async function clearCloseReminders(m: EntityManager, requestId: string): Promise<void> {
  await markNotificationsRead(m, { requestId, types: CLOSE_TYPES });
}
