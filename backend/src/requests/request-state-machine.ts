import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-codes';
import { RequestStatus as S } from './request.enums';

/** Transiciones permitidas. Cualquier otra es un error INVALID_REQUEST_STATE. */
const TRANSITIONS: Readonly<Record<S, readonly S[]>> = {
  [S.DRAFT]: [S.WAITING_QUOTES, S.CANCELLED],
  [S.WAITING_QUOTES]: [S.QUOTES_RECEIVED, S.CANCELLED],
  // Vuelve a WAITING_QUOTES si se retira el único presupuesto pendiente.
  [S.QUOTES_RECEIVED]: [S.PROFESSIONAL_SELECTED, S.WAITING_QUOTES, S.CANCELLED],
  // Se puede terminar sin haber cargado turno (arreglos en el momento).
  [S.PROFESSIONAL_SELECTED]: [S.SCHEDULED, S.AWAITING_REVIEW, S.CANCELLED],
  [S.SCHEDULED]: [S.AWAITING_REVIEW, S.CANCELLED],
  [S.AWAITING_REVIEW]: [S.CLOSED],
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

/** Estados en los que el profesional elegido puede ver datos de contacto. */
export const CONTACT_SHARED_STATUSES: readonly S[] = [
  S.PROFESSIONAL_SELECTED,
  S.SCHEDULED,
  S.AWAITING_REVIEW,
];
