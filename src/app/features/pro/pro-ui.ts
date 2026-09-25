import { TODAY } from '../../core/data/catalog.data';
import { AGENDA_EVENTS, AGENDA_WEEK, WEEK_DAYS } from '../../core/data/pro.data';
import { AgendaEvent } from '../../core/models/pro';
import { ProServiceRequest, RequestUrgency } from '../../core/models/request';
import {
  INVITATION_LABELS_FOR_PRO,
  URGENCY_LABELS,
  URGENCY_TONES,
  acceptsQuotes,
} from '../../core/models/request-status';
import { formatDesiredDate, formatTimestamp } from '../../core/utils/dates';
import { formatHour } from '../../core/utils/format';

/** Helpers de presentación compartidos por las pantallas del área pro. */

export interface ProRequestActions {
  /** 'quote' = Enviar presupuesto · 'take' = Tomar trabajo (solo urgencias). */
  primary: { kind: 'quote' | 'take'; label: string };
  secondary: { kind: 'decline'; label: string };
}

/**
 * Acciones sobre una solicitud real. Única fuente de verdad para listado,
 * detalle y dashboard:
 * - estándar (TODAY / FLEXIBLE): Enviar presupuesto · No disponible
 * - urgencia (URGENT): Tomar trabajo · No disponible
 * Solo si la invitación está PENDING y la solicitud todavía recibe
 * presupuestos. Nunca existe un "Aceptar" genérico.
 *
 * "Tomar trabajo" usa el MISMO contrato que un presupuesto: el backend no
 * tiene una acción de toma directa (una urgencia es una solicitud más), así
 * que el profesional manda su precio y el cliente lo confirma.
 */
export function proRequestActions(
  r: Pick<ProServiceRequest, 'invitationStatus' | 'urgency' | 'status'>,
): ProRequestActions | null {
  if (r.invitationStatus !== 'PENDING' || !acceptsQuotes(r.status)) return null;
  return {
    primary: r.urgency === 'URGENT' ? { kind: 'take', label: 'Tomar trabajo' } : { kind: 'quote', label: 'Enviar presupuesto' },
    secondary: { kind: 'decline', label: 'No disponible' },
  };
}

export function urgencyTone(urgency: RequestUrgency) {
  return URGENCY_TONES[urgency];
}

export function urgencyLabel(urgency: RequestUrgency): string {
  return URGENCY_LABELS[urgency];
}

/** "María G." (el backend solo manda nombre e inicial antes de la elección). */
export function clientName(r: Pick<ProServiceRequest, 'client'>): string {
  return r.client ? `${r.client.firstName} ${r.client.lastInitial}.` : 'Cliente';
}

export function whenText(r: Pick<ProServiceRequest, 'desiredDate' | 'desiredTimeRange' | 'urgency'>): string {
  if (r.urgency === 'URGENT') return 'Lo antes posible';
  const date = formatDesiredDate(r.desiredDate);
  return r.desiredTimeRange ? `${date}, ${r.desiredTimeRange}` : date;
}

export function requestMeta(r: ProServiceRequest): string {
  return [clientName(r), r.zone.name ?? '', whenText(r), formatTimestamp(r.createdAt)].filter(Boolean).join(' · ');
}

export function othersText(r: Pick<ProServiceRequest, 'otherInvitedCount'>): string {
  const n = r.otherInvitedCount;
  return n ? `También lo recibieron ${n} ${n === 1 ? 'profesional' : 'profesionales'}` : 'Sos el único que lo recibió';
}

/** Estado de la solicitud desde el punto de vista del profesional. */
export function proStateText(r: Pick<ProServiceRequest, 'invitationStatus' | 'status'>): string {
  if (r.status === 'CANCELLED') return 'El cliente la canceló';
  return r.invitationStatus ? INVITATION_LABELS_FOR_PRO[r.invitationStatus] : '';
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
