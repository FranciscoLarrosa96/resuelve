import type { JobStatus } from '../models/job';

/** Fecha/estado legibles para listas y detalle, sin mostrar coordinación en trabajos cancelados. */
export function jobScheduleLabel(
  status: JobStatus,
  date: string | null,
  time: string | null,
  emptyDateLabel = 'Fecha pendiente',
): string {
  if (status === 'CANCELLED') return 'Trabajo cancelado';
  if (!date) return emptyDateLabel;

  const day = new Intl.DateTimeFormat('es-AR', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`));
  return time ? `${day} · ${time}` : `${day} · horario a coordinar`;
}
