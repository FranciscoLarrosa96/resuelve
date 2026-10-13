import { IconName } from '../../shared/components/icon/icon';
import { Appointment, ProServiceRequest, RequestUrgency } from '../../core/models/request';
import {
  INVITATION_LABELS_FOR_PRO,
  URGENCY_LABELS,
  URGENCY_TONES,
  acceptsQuotes,
  isCompletionDue,
  isWorkDone,
  requestStatusLabel,
} from '../../core/models/request-status';
import { businessClock, businessDay, formatDayLong, formatDayShort, formatTimeRange } from '../../core/utils/business-time';
import { formatDesiredDate, formatTimestamp } from '../../core/utils/dates';

/** Helpers de presentación compartidos por las pantallas del área pro. */

export interface ProRequestActions {
  /** 'quote' = Enviar presupuesto · 'take' = Tomar trabajo (solo urgencias). */
  primary: { kind: 'quote' | 'take'; label: string };
  secondary: { kind: 'decline'; label: string };
}

/**
 * Acciones sobre una solicitud real. Única fuente de verdad para listado,
 * detalle y dashboard:
 * - estándar (TODAY / FLEXIBLE): Enviar presupuesto · No puedo tomarlo
 * - urgencia (URGENT): Tomar trabajo · No puedo tomarlo
 * Solo si la invitación está PENDING y la solicitud todavía recibe
 * presupuestos. Nunca existe un "Aceptar" genérico.
 *
 * "Tomar trabajo" usa el MISMO contrato que un presupuesto: el backend no
 * tiene una acción de toma directa (una urgencia es una solicitud más), así
 * que el profesional manda su precio y el cliente lo confirma.
 */
export function proRequestActions(
  r: Pick<ProServiceRequest, 'invitationStatus' | 'urgency' | 'status' | 'opportunity'>,
): ProRequestActions | null {
  if (
    r.opportunity?.blocked ||
    r.opportunity?.slotsFull ||
    r.opportunity?.actionable === false ||
    r.invitationStatus !== 'PENDING' ||
    !acceptsQuotes(r.status)
  ) return null;
  return {
    primary: r.urgency === 'URGENT' ? { kind: 'take', label: 'Tomar trabajo' } : { kind: 'quote', label: 'Enviar presupuesto' },
    secondary: { kind: 'decline', label: 'No puedo tomarlo' },
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
  return [clientName(r), r.zone?.name ?? r.locality?.name ?? '', whenText(r), formatTimestamp(r.createdAt)].filter(Boolean).join(' · ');
}

/**
 * Competencia en una solicitud abierta, en positivo y sin cifras confusas:
 * "Todavía no hay presupuestos" · "Ya hay 2 presupuestos (máximo 5)".
 */
export function slotsText(o: { activeQuoteCount?: number; maxActiveQuotes?: number } | null | undefined): string | null {
  if (o?.activeQuoteCount === undefined) return null;
  const n = o.activeQuoteCount;
  if (n === 0) return 'Todavía no hay presupuestos.';
  const max = o.maxActiveQuotes ? ` (máximo ${o.maxActiveQuotes})` : '';
  return n === 1 ? `Ya hay 1 presupuesto${max}.` : `Ya hay ${n} presupuestos${max}.`;
}

/**
 * Ya disponible, pero le llegó después que a PRO: "Te llegó 30 min después que a los perfiles PRO."
 * null mientras sigue demorada (eso ya lo dice "Disponible a partir de…") o si no hubo demora.
 */
export function lateText(o: { lateByMinutes?: number; delayed?: boolean } | null | undefined): string | null {
  const m = o?.lateByMinutes ?? 0;
  if (o?.delayed || m <= 0) return null;
  const span = m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`;
  return `Te llegó ${span} después que a los perfiles PRO.`;
}

/**
 * El momento de la pérdida (Free, solicitud que le llegó tarde): cuánto tarde y, si ya
 * había presupuestos de otros cuando se le habilitó, cuántos. Solo hechos; null si le
 * llegó a tiempo o todavía no se le habilitó.
 */
export function lossText(
  o: { lateByMinutes?: number; delayed?: boolean; quotesBeforeYou?: number } | null | undefined,
): string | null {
  const late = lateText(o);
  if (!late) return null;
  const n = o?.quotesBeforeYou ?? 0;
  if (n <= 0) return `${late} Con PRO, las solicitudes nuevas te llegan al instante.`;
  const quotes = n === 1 ? 'ya había 1 presupuesto' : `ya había ${n} presupuestos`;
  return `${late} Cuando se te habilitó, ${quotes} de otros profesionales.`;
}

/** "Buen día" (5 a 12 h), "Buenas tardes" (12 a 20 h) o "Buenas noches", con la hora de Argentina. */
export function greetingFor(now: Date = new Date()): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: 'America/Argentina/Buenos_Aires' }).format(now),
  );
  if (hour >= 5 && hour < 12) return 'Buen día';
  if (hour >= 12 && hour < 20) return 'Buenas tardes';
  return 'Buenas noches';
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
  r: Pick<ProServiceRequest, 'invitationStatus' | 'status' | 'selectedByClient'> &
    Partial<Pick<ProServiceRequest, 'appointment' | 'completedAt' | 'completionDue'>>,
): ProPersonalState {
  if (r.invitationStatus === 'SELECTED' || r.selectedByClient) return wonState(r);
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
        ? { title: INVITATION_LABELS_FOR_PRO.QUOTED, detail: 'El cliente está comparando presupuestos. Te avisamos si elige el tuyo.', tone: 'waiting', global: null }
        : { title: 'El cliente eligió otro presupuesto', detail: 'No necesitás hacer nada más con esta solicitud.', tone: 'closed', global: null };
    default:
      return acceptsQuotes(r.status)
        ? { title: 'Nueva solicitud', detail: null, tone: 'new', global: null }
        : { title: 'Ya no recibe presupuestos', detail: 'El cliente eligió a otro profesional.', tone: 'closed', global: null };
  }
}

/** Ganador: el estado sigue la coordinación del trabajo (cita real que manda el backend). */
function wonState(
  r: Pick<ProServiceRequest, 'status'> & Partial<Pick<ProServiceRequest, 'appointment' | 'completedAt' | 'completionDue'>>,
): ProPersonalState {
  const a = r.appointment ?? null;
  if (r.status === 'CANCELLED') {
    return { title: 'El cliente canceló la solicitud', detail: 'No necesitás hacer nada más con esta solicitud.', tone: 'closed', global: null };
  }
  if (isWorkDone(r.status)) {
    return { title: 'Trabajo realizado', detail: r.completedAt ? completedText(r.completedAt) : null, tone: 'won', global: null };
  }
  if (isCompletionDue({ status: r.status, appointment: a, completionDue: r.completionDue })) {
    return { title: '¿Terminaste este trabajo?', detail: 'El horario agendado ya pasó.', tone: 'new', global: null };
  }
  if (r.status === 'SCHEDULED' && a?.status === 'CONFIRMED') {
    return { title: 'Trabajo agendado', detail: null, tone: 'won', global: null };
  }
  if (a?.status === 'PROPOSED') {
    return { title: 'Esperando confirmación', detail: 'Le propusiste este horario al cliente.', tone: 'waiting', global: null };
  }
  if (a?.status === 'DECLINED') {
    return { title: 'El cliente necesita otro horario', detail: 'Proponé otra fecha. Si hace falta, hablalo antes por teléfono.', tone: 'new', global: null };
  }
  if (a?.status === 'CANCELLED' && a.cancelledBy === 'CLIENT') {
    return { title: 'El cliente canceló el horario', detail: 'Te sigue eligiendo a vos: proponé otra fecha.', tone: 'new', global: null };
  }
  return {
    title: INVITATION_LABELS_FOR_PRO.SELECTED,
    detail: 'Ya podés ver los datos de contacto para coordinar el trabajo.',
    tone: 'won',
    global: requestStatusLabel(r.status),
  };
}

/** "28 sep · 12:14" (hora de Argentina). */
export function completedText(completedAt: string): string {
  return `${formatDayShort(businessDay(completedAt))} · ${businessClock(completedAt)}`;
}

/** "Domingo 28 de septiembre" + "10:00 a 12:00" de una cita. */
export function appointmentSlot(a: Pick<Appointment, 'startsAt' | 'endsAt'>) {
  return { day: formatDayLong(businessDay(a.startsAt)), time: formatTimeRange(a.startsAt, a.endsAt) };
}

export interface ProCoordination {
  /** Proponer (primera vez o después de un rechazo/cancelación). */
  propose: { label: string } | null;
  /** Cita activa que se puede reemplazar ("Cambiar propuesta" / "Reprogramar" / "Necesito reprogramar"). */
  replace: { appointment: Appointment; label: string } | null;
  /**
   * Cita confirmada: "Marcar como realizado" recién cuando termina el
   * horario (`due`). Antes solo se explica cuándo se va a poder.
   */
  complete: { due: boolean } | null;
}

/**
 * Acciones de coordinación del profesional ELEGIDO. Única fuente para el
 * detalle; nunca aparecen para perdedores, trabajos terminados ni cancelados.
 * El paso del tiempo no completa nada: solo habilita el cierre.
 */
export function proCoordination(
  r: Pick<ProServiceRequest, 'status' | 'selectedByClient' | 'appointment'> &
    Partial<Pick<ProServiceRequest, 'completionDue' | 'canComplete'>>,
): ProCoordination | null {
  if (!r.selectedByClient || (r.status !== 'PROFESSIONAL_SELECTED' && r.status !== 'SCHEDULED')) return null;
  const a = r.appointment;
  if (r.status === 'SCHEDULED' && a?.status === 'CONFIRMED') {
    // Regla del backend (canComplete = la de POST /requests/:id/complete); la pantalla relee en endsAt.
    const due = isCompletionDue({ status: r.status, appointment: a, completionDue: r.canComplete ?? r.completionDue });
    return {
      propose: null,
      replace: { appointment: a, label: due ? 'Necesito reprogramar' : 'Reprogramar' },
      complete: { due },
    };
  }
  if (a?.status === 'PROPOSED') return { propose: null, replace: { appointment: a, label: 'Cambiar propuesta' }, complete: null };
  const again = a?.status === 'DECLINED' || (a?.status === 'CANCELLED' && a.cancelledBy === 'CLIENT');
  return { propose: { label: again ? 'Proponer otra fecha' : 'Coordinar trabajo' }, replace: null, complete: null };
}

/** Colores de texto/punto por tono (metadata discreta, no pills grandes). */
export const PRO_STATE_TONES: Record<ProStateTone, { text: string; dot: string; icon: IconName; badge: string }> = {
  new: { text: 'text-accent-strong', dot: 'bg-accent', icon: 'inbox', badge: 'bg-accent-soft text-accent-strong' },
  waiting: { text: 'text-ink-soft', dot: 'bg-line-dash', icon: 'clock', badge: 'bg-sand text-ink-soft' },
  won: { text: 'text-success-strong', dot: 'bg-success', icon: 'check-circle', badge: 'bg-success-soft text-success-strong' },
  closed: { text: 'text-muted', dot: 'bg-line-dash', icon: 'info', badge: 'bg-neutral-soft text-neutral' },
};

export interface ProRequestActivity {
  label: string;
  at: string;
  icon: IconName;
}

/** Solo hitos con fecha propia enviada por la API. No se infiere una aceptación ni cancelación. */
export function proRequestActivity(r: ProServiceRequest): ProRequestActivity[] {
  const events: ProRequestActivity[] = [{ label: 'Solicitud recibida', at: r.createdAt, icon: 'clock' }];
  const quote = r.ownQuote;
  if (quote) {
    events.push({ label: 'Presupuesto enviado', at: quote.createdAt, icon: 'document' });
    // Al aceptar/rechazar el presupuesto también cambia updatedAt; eso no prueba una edición.
    if (quote.status === 'PENDING' && Date.parse(quote.updatedAt) > Date.parse(quote.createdAt)) {
      events.push({ label: 'Presupuesto editado', at: quote.updatedAt, icon: 'pencil' });
    }
  }
  if (r.appointment?.createdAt) {
    events.push({ label: 'Horario propuesto', at: r.appointment.createdAt, icon: 'calendar' });
  }
  if (r.completedAt) events.push({ label: 'Trabajo realizado', at: r.completedAt, icon: 'check-circle' });
  return events.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

/** "Jueves 24 de septiembre" (hoy, en hora de Argentina). */
export function longToday(): string {
  return formatDayLong(businessDay());
}
