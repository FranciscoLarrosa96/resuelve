import type { JobStatus } from '../models/job';
import { formatCalendarDay } from './dates';

/** Fecha/estado legibles para listas y detalle, sin mostrar coordinación en trabajos cancelados. */
export function jobScheduleLabel(
  status: JobStatus,
  date: string | null,
  time: string | null,
  emptyDateLabel = 'Fecha pendiente',
): string {
  if (status === 'CANCELLED') return 'Trabajo cancelado';
  if (!date) return emptyDateLabel;

  const day = formatCalendarDay(date, { weekday: 'long' });
  return time ? `${day} · ${time}` : `${day} · horario a coordinar`;
}
