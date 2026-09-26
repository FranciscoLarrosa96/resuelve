import { Appointment, InvitationStatus, RequestGroup, RequestStatus, RequestUrgency, ServiceRequest } from './request';
import { QuoteStatus } from './quote';

/**
 * Presentación ÚNICA de estados. Toda la app usa estos mapas: la lógica
 * compara siempre el string del backend (`status === 'QUOTES_RECEIVED'`),
 * nunca las etiquetas.
 */

export type StatusTone = 'waiting' | 'action' | 'selected' | 'done' | 'muted';

export interface StatusMeta {
  label: string;
  description: string;
  tone: StatusTone;
}

export const REQUEST_STATUS_META: Record<RequestStatus, StatusMeta> = {
  DRAFT: {
    label: 'Sin enviar',
    description: 'Todavía no se la pediste a ningún profesional.',
    tone: 'muted',
  },
  WAITING_QUOTES: {
    label: 'Esperando presupuestos',
    description: 'Los profesionales que elegiste pueden responder con un presupuesto.',
    tone: 'waiting',
  },
  QUOTES_RECEIVED: {
    label: 'Presupuestos recibidos',
    description: 'Revisá los presupuestos y elegí uno.',
    tone: 'action',
  },
  PROFESSIONAL_SELECTED: {
    label: 'Profesional seleccionado',
    description: 'Aceptaste un presupuesto. El profesional ya tiene tu contacto y dirección.',
    tone: 'selected',
  },
  SCHEDULED: { label: 'Trabajo agendado', description: 'Confirmaste fecha y horario con el profesional.', tone: 'selected' },
  COMPLETED: { label: 'Trabajo realizado', description: 'El trabajo quedó registrado como realizado.', tone: 'done' },
  // Legacy: estados del flujo anterior, se leen como un trabajo realizado.
  AWAITING_REVIEW: { label: 'Trabajo realizado', description: 'El trabajo quedó registrado como realizado.', tone: 'done' },
  CLOSED: { label: 'Trabajo realizado', description: 'El trabajo quedó registrado como realizado.', tone: 'done' },
  CANCELLED: { label: 'Cancelada', description: 'Cancelaste esta solicitud.', tone: 'muted' },
};

/** Colores por tono (fondo, texto, punto). */
export const STATUS_TONES: Record<StatusTone, { bg: string; fg: string; dot: string }> = {
  waiting: { bg: '#F8EBDD', fg: '#8E4B0D', dot: '#B8651A' },
  action: { bg: '#E8F0F6', fg: '#315E82', dot: '#315E82' },
  selected: { bg: '#E7F1ED', fg: '#123F35', dot: '#1A5C4D' },
  done: { bg: '#EEE9E0', fg: '#3A433E', dot: '#8A918C' },
  muted: { bg: '#EEE9E0', fg: '#5F6863', dot: '#A7ACA8' },
};

export function requestStatusLabel(status: RequestStatus): string {
  return REQUEST_STATUS_META[status]?.label ?? status;
}

export function requestStatusDescription(status: RequestStatus): string {
  return REQUEST_STATUS_META[status]?.description ?? '';
}

export function statusTone(status: RequestStatus) {
  return STATUS_TONES[REQUEST_STATUS_META[status]?.tone ?? 'muted'];
}

/**
 * Filtros de "Mis solicitudes" (se piden al backend con `?group=`). Pocos
 * y agrupados: el subestado se explica en cada tarjeta.
 */
export const REQUEST_GROUP_FILTERS: { group: RequestGroup; label: string }[] = [
  { group: 'ACTIVE', label: 'Activas' },
  { group: 'QUOTES', label: 'Presupuestos' },
  { group: 'COORDINATING', label: 'Por coordinar' },
  { group: 'SCHEDULED', label: 'Agendadas' },
  { group: 'DONE', label: 'Realizadas' },
  { group: 'CANCELLED', label: 'Canceladas' },
];

/**
 * "Pendiente de cierre": la cita confirmada ya terminó y la solicitud sigue
 * SCHEDULED. Lo manda el backend (`completionDue`); además se recalcula con
 * la hora actual para que el cambio se vea sin recargar. Nunca completa nada.
 */
export function isCompletionDue(
  r: { status: RequestStatus; appointment: Pick<Appointment, 'status' | 'endsAt'> | null; completionDue?: boolean },
  now: number = Date.now(),
): boolean {
  if (r.status !== 'SCHEDULED' || r.appointment?.status !== 'CONFIRMED') return false;
  return !!r.completionDue || new Date(r.appointment.endsAt).getTime() <= now;
}

/** Lo que el cliente tiene que entender AHORA de su solicitud (no es otro estado persistido). */
export interface RequestStage {
  label: string;
  tone: StatusTone;
  /** Próximo paso del cliente, si hay uno ("Confirmá el horario"). */
  next: string | null;
}

export function clientStage(
  r: Pick<ServiceRequest, 'status' | 'appointment'> & { completionDue?: boolean },
  now: number = Date.now(),
): RequestStage {
  if (r.status === 'PROFESSIONAL_SELECTED' && r.appointment?.status === 'PROPOSED') {
    return { label: 'Horario por confirmar', tone: 'action', next: 'Confirmá el horario' };
  }
  if (isCompletionDue(r, now)) {
    return { label: 'Pendiente de confirmar', tone: 'action', next: '¿Se realizó el trabajo?' };
  }
  const meta = REQUEST_STATUS_META[r.status];
  return {
    label: meta?.label ?? r.status,
    tone: meta?.tone ?? 'muted',
    next: r.status === 'QUOTES_RECEIVED' ? 'Revisá los presupuestos' : null,
  };
}

/** Trabajo realizado: COMPLETED, o los estados legacy equivalentes. */
const WORK_DONE: readonly RequestStatus[] = ['COMPLETED', 'AWAITING_REVIEW', 'CLOSED'];
export function isWorkDone(status: RequestStatus): boolean {
  return WORK_DONE.includes(status);
}

/**
 * Estados desde los que el backend permite cancelar (request-state-machine:
 * transiciones a CANCELLED). Solo decide si se OFRECE el botón; si el
 * estado cambió mientras tanto, el backend responde 409 y se refresca.
 */
const CANCELLABLE: readonly RequestStatus[] = [
  'DRAFT',
  'WAITING_QUOTES',
  'QUOTES_RECEIVED',
  'PROFESSIONAL_SELECTED',
  'SCHEDULED',
];
export function canCancel(status: RequestStatus): boolean {
  return CANCELLABLE.includes(status);
}

/** Estados en los que el backend acepta presupuestos (QUOTABLE_STATUSES). */
const QUOTABLE: readonly RequestStatus[] = ['WAITING_QUOTES', 'QUOTES_RECEIVED'];
export function acceptsQuotes(status: RequestStatus): boolean {
  return QUOTABLE.includes(status);
}

export const URGENCY_LABELS: Record<RequestUrgency, string> = {
  FLEXIBLE: 'Puede esperar',
  TODAY: 'Para hoy',
  URGENT: 'Urgente',
};

export const URGENCY_TONES: Record<RequestUrgency, { bg: string; fg: string; dot: string }> = {
  URGENT: { bg: '#F8EBDD', fg: '#8E4B0D', dot: '#B8651A' },
  TODAY: { bg: '#E7F1ED', fg: '#123F35', dot: '#1A5C4D' },
  FLEXIBLE: { bg: '#EEE9E0', fg: '#3A433E', dot: '#8A918C' },
};

/** Estado de la invitación visto por el CLIENTE. */
export const INVITATION_LABELS_FOR_CLIENT: Record<InvitationStatus, string> = {
  PENDING: 'Todavía no respondió',
  QUOTED: 'Te mandó un presupuesto',
  DECLINED: 'No está disponible',
  SELECTED: 'Elegido',
  NOT_SELECTED: 'No elegido',
};

/** Estado de la invitación visto por el PROFESIONAL. */
export const INVITATION_LABELS_FOR_PRO: Record<InvitationStatus, string> = {
  PENDING: 'Nueva',
  QUOTED: 'Presupuesto enviado',
  DECLINED: 'Marcaste que no estás disponible',
  SELECTED: 'Te eligieron',
  NOT_SELECTED: 'El cliente eligió otro presupuesto',
};

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  PENDING: 'Pendiente',
  ACCEPTED: 'Aceptado',
  REJECTED: 'No elegido',
  WITHDRAWN: 'Retirado',
  EXPIRED: 'Vencido',
};

// ---- Progreso (solo representación) ----------------------------------

export type ProgressState = 'done' | 'current' | 'todo';

export interface ProgressStep {
  label: string;
  state: ProgressState;
}

/** Textos por paso: [hecho, actual, pendiente]. */
const PROGRESS_LABELS: readonly [string, string, string][] = [
  ['Solicitud enviada', 'Enviar solicitud', 'Enviar solicitud'],
  ['Presupuestos recibidos', 'Esperando presupuestos', 'Recibir presupuestos'],
  ['Profesional elegido', 'Elegir profesional', 'Elegir profesional'],
  ['Trabajo realizado', 'Coordinar trabajo', 'Coordinar trabajo'],
];

/** Índice del paso actual por estado del backend (4 = todos hechos). */
const PROGRESS_INDEX: Partial<Record<RequestStatus, number>> = {
  DRAFT: 0,
  WAITING_QUOTES: 1,
  QUOTES_RECEIVED: 2,
  PROFESSIONAL_SELECTED: 3,
  SCHEDULED: 3,
  COMPLETED: 4,
  AWAITING_REVIEW: 4,
  CLOSED: 4,
};

/**
 * Mini progreso de 4 pasos para el detalle del cliente. Se deriva SOLO del
 * estado real; no agrega pasos ni decide nada. El último paso es "Coordinar
 * trabajo" → "Trabajo agendado" → "Trabajo realizado". Cancelada: sin progreso (null).
 */
export function requestProgress(status: RequestStatus): ProgressStep[] | null {
  const current = PROGRESS_INDEX[status];
  if (current === undefined) return null;
  return PROGRESS_LABELS.map(([done, now, todo], i) => ({
    // Con la cita confirmada, el paso actual ya no es "coordinar": es el trabajo agendado.
    label: i < current ? done : i === current ? (status === 'SCHEDULED' ? 'Trabajo agendado' : now) : todo,
    state: i < current ? 'done' : i === current ? 'current' : 'todo',
  }));
}
