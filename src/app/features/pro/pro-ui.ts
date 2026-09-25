import { TODAY } from '../../core/data/catalog.data';
import { AGENDA_EVENTS, AGENDA_WEEK, WEEK_DAYS } from '../../core/data/pro.data';
import { AgendaEvent } from '../../core/models/pro';
import { ProServiceRequest, RequestUrgency } from '../../core/models/request';
import {
  INVITATION_LABELS_FOR_PRO,
  URGENCY_LABELS,
  URGENCY_TONES,
  acceptsQuotes,
  requestStatusLabel,
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

/** "También se envió a 1 profesional más." · "Solo se envió a vos." */
export function othersText(r: Pick<ProServiceRequest, 'otherInvitedCount'>): string {
  const n = r.otherInvitedCount;
  if (!n) return 'Solo se envió a vos.';
  return `También se envió a ${n} ${n === 1 ? 'profesional más' : 'profesionales más'}.`;
}

export type ProStateTone = 'new' | 'waiting' | 'won' | 'closed';

/**
 * Estado PERSONAL del profesional (no el global de la solicitud). Una
 * solicitud en PROFESSIONAL_SELECTED se comunica distinto a quien ganó
 * ("Te eligieron") y a quien no ("El cliente eligió otro presupuesto").
 * Se decide con la invitación que manda el backend, nunca con etiquetas.
 */
export interface ProPersonalState {
  title: string;
  detail: string | null;
  tone: ProStateTone;
  /** Estado global como dato secundario (solo cuando no genera ambigüedad). */
  global: string | null;
}

export function proPersonalState(
  r: Pick<ProServiceRequest, 'invitationStatus' | 'status' | 'selectedByClient'>,
): ProPersonalState {
  if (r.invitationStatus === 'SELECTED' || r.selectedByClient) {
    return {
      title: INVITATION_LABELS_FOR_PRO.SELECTED,
      detail: 'Ya podés ver los datos de contacto para coordinar el trabajo.',
      tone: 'won',
      global: requestStatusLabel(r.status),
    };
  }
  if (r.status === 'CANCELLED') {
    return { title: 'El cliente canceló la solicitud', detail: 'No necesitás hacer nada más con esta solicitud.', tone: 'closed', global: null };
  }
  switch (r.invitationStatus) {
    case 'NOT_SELECTED':
      return { title: INVITATION_LABELS_FOR_PRO.NOT_SELECTED, detail: 'No necesitás hacer nada más con esta solicitud.', tone: 'closed', global: null };
    case 'DECLINED':
      return { title: INVITATION_LABELS_FOR_PRO.DECLINED, detail: null, tone: 'closed', global: null };
    case 'QUOTED':
      return acceptsQuotes(r.status)
        ? { title: INVITATION_LABELS_FOR_PRO.QUOTED, detail: 'El cliente está comparando presupuestos.', tone: 'waiting', global: null }
        : { title: 'El cliente eligió otro presupuesto', detail: 'No necesitás hacer nada más con esta solicitud.', tone: 'closed', global: null };
    default:
      return acceptsQuotes(r.status)
        ? { title: 'Nueva solicitud', detail: null, tone: 'new', global: null }
        : { title: 'Ya no recibe presupuestos', detail: 'El cliente eligió a otro profesional.', tone: 'closed', global: null };
  }
}

/** Colores de texto/punto por tono (metadata discreta, no pills grandes). */
export const PRO_STATE_TONES: Record<ProStateTone, { text: string; dot: string }> = {
  new: { text: 'text-accent-strong', dot: 'bg-accent' },
  waiting: { text: 'text-ink-soft', dot: 'bg-line-dash' },
  won: { text: 'text-brand', dot: 'bg-brand' },
  closed: { text: 'text-muted', dot: 'bg-line-dash' },
};

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
