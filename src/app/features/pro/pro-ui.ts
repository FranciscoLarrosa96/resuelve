import { TODAY } from '../../core/data/catalog.data';
import { AGENDA_EVENTS, AGENDA_WEEK, WEEK_DAYS } from '../../core/data/pro.data';
import { AgendaEvent, IncomingRequest, IncomingUrgency } from '../../core/models/pro';
import { formatHour, oneDecimal, photosLabel } from '../../core/utils/format';

/** Helpers de presentación compartidos por las pantallas del área pro. */

export interface UrgencyTone {
  bg: string;
  fg: string;
  dot: string;
}

export function urgencyTone(urgency: IncomingUrgency): UrgencyTone {
  switch (urgency) {
    case 'Urgente':
      return { bg: '#FCEEDD', fg: '#6A4418', dot: '#C9711F' };
    case 'Para hoy':
      return { bg: '#E4EFE9', fg: '#164538', dot: '#1E5B4B' };
    default:
      return { bg: '#F2EEE6', fg: '#3F4742', dot: '#8A918C' };
  }
}

export interface ProRequestActions {
  /** 'quote' = Enviar presupuesto · 'take' = Tomar trabajo (solo urgencias). */
  primary: { kind: 'quote' | 'take'; label: string };
  secondary: { kind: 'decline'; label: string };
}

/**
 * Acciones disponibles sobre una solicitud nueva. Única fuente de verdad
 * para la vista previa, el detalle (desktop y mobile) y el dashboard:
 * - estándar ("Para hoy" / "Puede esperar"): Enviar presupuesto · No disponible
 * - urgencia real: Tomar trabajo · No disponible
 * Nunca existe un "Aceptar" genérico. Sin acciones si ya no es nueva.
 */
export function proRequestActions(r: Pick<IncomingRequest, 'status' | 'urgency'>): ProRequestActions | null {
  if (r.status !== 'new') return null;
  return {
    primary: r.urgency === 'Urgente' ? { kind: 'take', label: 'Tomar trabajo' } : { kind: 'quote', label: 'Enviar presupuesto' },
    secondary: { kind: 'decline', label: 'No disponible' },
  };
}

export function requestMeta(r: IncomingRequest): string {
  return [r.client, r.zone, oneDecimal(r.distanceKm) + ' km', r.when, photosLabel(r.photos), r.receivedAgo].join(' · ');
}

export function othersText(r: IncomingRequest): string {
  return r.others ? `También lo recibieron ${r.others} profesionales` : 'Sos el único que lo recibió';
}

/** "Jueves 24 de septiembre" */
export function longToday(): string {
  const text = TODAY.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }).replace(',', '');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export interface TimelineItem extends AgendaEvent {
  time: string;
  end: string;
  past: boolean;
  /** Mostrar la línea "Ahora" antes de este evento. */
  nowBefore: boolean;
}

export function eventsOfDay(day: number): TimelineItem[] {
  const now = AGENDA_WEEK.now;
  const list = AGENDA_EVENTS.filter((e) => e.day === day).sort((a, b) => a.start - b.start);
  const isToday = day === AGENDA_WEEK.todayIndex;
  const firstUpcoming = isToday ? list.findIndex((e) => e.start > now) : -1;
  return list.map((e, i) => ({
    ...e,
    time: formatHour(e.start),
    end: formatHour(e.start + e.duration),
    past: day < AGENDA_WEEK.todayIndex || (isToday && e.start + e.duration <= now),
    nowBefore: isToday && i === firstUpcoming && i > 0,
  }));
}

export function dayLabel(day: number): string {
  return `${WEEK_DAYS[day]} ${AGENDA_WEEK.firstDayNumber + day} de septiembre`;
}
