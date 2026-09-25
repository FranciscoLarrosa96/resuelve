import { InvitationStatus, RequestStatus, RequestUrgency } from './request';
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
  SCHEDULED: { label: 'Trabajo programado', description: 'El trabajo tiene fecha.', tone: 'selected' },
  AWAITING_REVIEW: { label: 'Trabajo terminado', description: 'El profesional marcó el trabajo como terminado.', tone: 'done' },
  CLOSED: { label: 'Cerrada', description: 'La solicitud terminó.', tone: 'done' },
  CANCELLED: { label: 'Cancelada', description: 'Cancelaste esta solicitud.', tone: 'muted' },
};

/** Colores por tono (fondo, texto, punto). */
export const STATUS_TONES: Record<StatusTone, { bg: string; fg: string; dot: string }> = {
  waiting: { bg: '#FCEEDD', fg: '#6A4418', dot: '#C9711F' },
  action: { bg: '#E6ECF3', fg: '#2F4B6E', dot: '#2F4B6E' },
  selected: { bg: '#E4EFE9', fg: '#164538', dot: '#1E5B4B' },
  done: { bg: '#F2EEE6', fg: '#3F4742', dot: '#8A918C' },
  muted: { bg: '#F2EEE6', fg: '#5B625E', dot: '#A7ACA8' },
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

/** Filtros de "Mis solicitudes" (se piden al backend con `?status=`). */
export const REQUEST_STATUS_FILTERS: RequestStatus[] = [
  'WAITING_QUOTES',
  'QUOTES_RECEIVED',
  'PROFESSIONAL_SELECTED',
  'DRAFT',
  'CANCELLED',
];

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
  URGENT: { bg: '#FCEEDD', fg: '#6A4418', dot: '#C9711F' },
  TODAY: { bg: '#E4EFE9', fg: '#164538', dot: '#1E5B4B' },
  FLEXIBLE: { bg: '#F2EEE6', fg: '#3F4742', dot: '#8A918C' },
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
  ['Trabajo terminado', 'Coordinar trabajo', 'Coordinar trabajo'],
];

/** Índice del paso actual por estado del backend (4 = todos hechos). */
const PROGRESS_INDEX: Partial<Record<RequestStatus, number>> = {
  DRAFT: 0,
  WAITING_QUOTES: 1,
  QUOTES_RECEIVED: 2,
  PROFESSIONAL_SELECTED: 3,
  SCHEDULED: 3,
  AWAITING_REVIEW: 4,
  CLOSED: 4,
};

/**
 * Mini progreso de 4 pasos para el detalle del cliente. Se deriva SOLO del
 * estado real; no agrega pasos ni decide nada. Cancelada: no hay progreso (null).
 */
export function requestProgress(status: RequestStatus): ProgressStep[] | null {
  const current = PROGRESS_INDEX[status];
  if (current === undefined) return null;
  return PROGRESS_LABELS.map(([done, now, todo], i) => ({
    label: i < current ? done : i === current ? now : todo,
    state: i < current ? 'done' : i === current ? 'current' : 'todo',
  }));
}
