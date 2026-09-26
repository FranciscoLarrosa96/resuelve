import { EntityManager } from 'typeorm';
import { RequestStatus } from '../requests/request.enums';
import { Appointment, AppointmentStatus } from './appointment.entity';

/**
 * "Pendiente de cierre": la cita confirmada ya terminó y la solicitud sigue
 * SCHEDULED. El paso del tiempo NO completa el trabajo: solo habilita que el
 * cliente o el profesional confirmen que se realizó (o pidan reprogramar).
 * Se deriva al consultar; no hay cron ni notificación persistida.
 */
export function isCompletionDue(
  requestStatus: RequestStatus,
  appointment: Pick<Appointment, 'status' | 'scheduledEnd'> | null,
  now: Date = new Date(),
): boolean {
  return (
    requestStatus === RequestStatus.SCHEDULED &&
    appointment?.status === AppointmentStatus.CONFIRMED &&
    appointment.scheduledEnd.getTime() <= now.getTime()
  );
}

/** Trabajos pendientes de cierre de un profesional o de un cliente. */
export function completionDueQuery(m: EntityManager, by: { professionalId: string } | { clientId: string }) {
  const qb = m
    .getRepository(Appointment)
    .createQueryBuilder('a')
    .innerJoin('a.request', 'r')
    .where('a.status = :confirmed', { confirmed: AppointmentStatus.CONFIRMED })
    .andWhere('a.scheduled_end <= now()')
    .andWhere('r.status = :scheduled', { scheduled: RequestStatus.SCHEDULED });
  return 'professionalId' in by
    ? qb.andWhere('a.professional_id = :id', { id: by.professionalId })
    : qb.andWhere('a.client_id = :id', { id: by.clientId });
}
