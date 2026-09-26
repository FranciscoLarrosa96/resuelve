import { EntityManager, In } from 'typeorm';
import { Appointment } from './appointment.entity';

/**
 * Cita dentro de una solicitud. La ven solo el cliente dueño y el profesional
 * elegido (lo decide request.presenter). Sin datos de contacto: esos viajan
 * en `contact` con sus propias reglas.
 */
export function presentAppointment(a: Appointment) {
  return {
    id: a.id,
    status: a.status,
    startsAt: a.scheduledStart,
    endsAt: a.scheduledEnd,
    durationMinutes: Math.round((a.scheduledEnd.getTime() - a.scheduledStart.getTime()) / 60_000),
    note: a.note,
    cancelledBy: a.cancelledBy,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}

export type AppointmentView = ReturnType<typeof presentAppointment>;

/**
 * La cita más reciente de cada solicitud (cualquier estado: una DECLINED o
 * CANCELLED también cuenta para mostrar "El cliente necesita otro horario").
 */
export async function latestAppointments(
  m: EntityManager,
  requestIds: readonly string[],
): Promise<Map<string, Appointment>> {
  if (!requestIds.length) return new Map();
  const rows = await m.find(Appointment, {
    where: { requestId: In([...requestIds]) },
    order: { createdAt: 'DESC', id: 'DESC' },
  });
  const latest = new Map<string, Appointment>();
  for (const a of rows) if (!latest.has(a.requestId)) latest.set(a.requestId, a);
  return latest;
}
