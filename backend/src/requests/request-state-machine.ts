import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-codes';
import { RequestStatus as S } from './request.enums';

/** Transiciones permitidas. Cualquier otra es un error INVALID_REQUEST_STATE. */
const TRANSITIONS: Readonly<Record<S, readonly S[]>> = {
  [S.DRAFT]: [S.WAITING_QUOTES, S.CANCELLED],
  [S.WAITING_QUOTES]: [S.QUOTES_RECEIVED, S.CANCELLED],
  // Vuelve a WAITING_QUOTES si se retira el único presupuesto pendiente.
  [S.QUOTES_RECEIVED]: [S.PROFESSIONAL_SELECTED, S.WAITING_QUOTES, S.CANCELLED],
  // SCHEDULED = el cliente confirmó una cita propuesta por el profesional elegido.
  [S.PROFESSIONAL_SELECTED]: [S.SCHEDULED, S.CANCELLED],
  // Vuelve a PROFESSIONAL_SELECTED si se cancela o reprograma la cita (mismo profesional).
  // COMPLETED no depende de una reseña.
  [S.SCHEDULED]: [S.COMPLETED, S.PROFESSIONAL_SELECTED, S.CANCELLED],
  [S.COMPLETED]: [],
  // Legacy: ya no se entra a estos estados.
  [S.AWAITING_REVIEW]: [],
  [S.CLOSED]: [],
  [S.CANCELLED]: [],
};

export function canTransition(from: S, to: S): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: S, to: S): void {
  if (!canTransition(from, to)) {
    throw AppException.conflict(
      ErrorCode.INVALID_REQUEST_STATE,
      `No se puede pasar una solicitud de ${from} a ${to}`,
      {
        from,
        to,
      },
    );
  }
}

/** Estados en los que el cliente todavía puede editar datos del pedido. */
export const EDITABLE_STATUSES: readonly S[] = [S.DRAFT, S.WAITING_QUOTES, S.QUOTES_RECEIVED];

/** Estados en los que se pueden sumar invitaciones. */
export const INVITABLE_STATUSES: readonly S[] = [S.DRAFT, S.WAITING_QUOTES, S.QUOTES_RECEIVED];

/** Estados en los que un profesional puede enviar/editar un presupuesto. */
export const QUOTABLE_STATUSES: readonly S[] = [S.WAITING_QUOTES, S.QUOTES_RECEIVED];

/** Estados en los que el profesional elegido coordina la cita (proponer, reprogramar). */
export const COORDINATION_STATUSES: readonly S[] = [S.PROFESSIONAL_SELECTED, S.SCHEDULED];

/** Trabajo realizado (COMPLETED, o los estados legacy equivalentes). */
export const WORK_DONE_STATUSES: readonly S[] = [S.COMPLETED, S.AWAITING_REVIEW, S.CLOSED];

/**
 * Estados en los que el profesional elegido puede ver datos de contacto.
 * No incluye COMPLETED: terminado el trabajo, deja de compartirse.
 */
export const CONTACT_SHARED_STATUSES: readonly S[] = [
  S.PROFESSIONAL_SELECTED,
  S.SCHEDULED,
  S.AWAITING_REVIEW,
];

/**
 * Filtros agrupados de "Mis solicitudes" (`?group=`): pocas opciones, el
 * subestado se explica en cada tarjeta.
 */
export const REQUEST_GROUPS = {
  ACTIVE: [S.DRAFT, S.WAITING_QUOTES, S.QUOTES_RECEIVED, S.PROFESSIONAL_SELECTED, S.SCHEDULED],
  QUOTES: [S.WAITING_QUOTES, S.QUOTES_RECEIVED],
  COORDINATING: [S.PROFESSIONAL_SELECTED],
  SCHEDULED: [S.SCHEDULED],
  DONE: [...WORK_DONE_STATUSES],
  CANCELLED: [S.CANCELLED],
} as const satisfies Record<string, readonly S[]>;

export type RequestGroup = keyof typeof REQUEST_GROUPS;
