import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-codes';
import { RequestStatus } from '../requests/request.enums';
import type { ServiceRequest } from '../requests/service-request.entity';

/** La reseña es posterior y opcional: el trabajo ya quedó COMPLETED sin ella. */
export const REVIEWABLE_STATUSES: readonly RequestStatus[] = [
  RequestStatus.COMPLETED,
  RequestStatus.AWAITING_REVIEW,
];

type ReviewableRequest = Pick<
  ServiceRequest,
  'clientId' | 'status' | 'selectedProfessionalId' | 'acceptedQuoteId'
>;

/**
 * Motivo por el que NO se puede reseñar (o null si se puede). Única regla:
 * la usan el POST y el detalle de la solicitud (`canReview`).
 *  - la solicitud es del cliente autenticado (si no: NOT_FOUND),
 *  - todavía no existe una reseña para ese trabajo,
 *  - el trabajo se realizó (COMPLETED, o AWAITING_REVIEW legacy),
 *  - hubo un profesional realmente contratado,
 *  - y ese profesional no es el mismo cliente (sin reputación propia).
 */
export function reviewBlocker(
  request: ReviewableRequest | null,
  clientId: string,
  alreadyReviewed: boolean,
  professionalUserId: string | null,
): 'NOT_FOUND' | 'ALREADY_EXISTS' | 'NOT_ALLOWED' | null {
  if (!request || request.clientId !== clientId) return 'NOT_FOUND';
  if (alreadyReviewed || request.status === RequestStatus.CLOSED) return 'ALREADY_EXISTS';
  if (
    !REVIEWABLE_STATUSES.includes(request.status) ||
    !request.selectedProfessionalId ||
    !request.acceptedQuoteId ||
    professionalUserId === clientId
  ) {
    return 'NOT_ALLOWED';
  }
  return null;
}

export function assertCanReview(
  request: ReviewableRequest | null,
  clientId: string,
  alreadyReviewed: boolean,
  professionalUserId: string | null = null,
): asserts request is ReviewableRequest & { selectedProfessionalId: string } {
  const blocker = reviewBlocker(request, clientId, alreadyReviewed, professionalUserId);
  if (blocker === 'NOT_FOUND') throw AppException.notFound('Solicitud');
  if (blocker === 'ALREADY_EXISTS') {
    throw AppException.conflict(ErrorCode.REVIEW_ALREADY_EXISTS, 'Ya dejaste una reseña para este trabajo');
  }
  if (blocker === 'NOT_ALLOWED') {
    throw AppException.conflict(ErrorCode.REVIEW_NOT_ALLOWED, 'Solo se puede reseñar un trabajo terminado', {
      status: request!.status,
    });
  }
}
