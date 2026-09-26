import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-codes';
import { RequestStatus } from '../requests/request.enums';

/** La reseña es posterior y opcional: el trabajo ya quedó COMPLETED sin ella. */
const REVIEWABLE: readonly RequestStatus[] = [RequestStatus.COMPLETED, RequestStatus.AWAITING_REVIEW];
import type { ServiceRequest } from '../requests/service-request.entity';

/**
 * Solo se puede reseñar cuando:
 *  - la solicitud es del cliente autenticado,
 *  - el trabajo se realizó (COMPLETED, o AWAITING_REVIEW legacy),
 *  - hubo un profesional realmente contratado,
 *  - y todavía no existe una reseña para ese trabajo.
 */
export function assertCanReview(
  request: Pick<ServiceRequest, 'clientId' | 'status' | 'selectedProfessionalId' | 'acceptedQuoteId'> | null,
  clientId: string,
  alreadyReviewed: boolean,
): asserts request is Pick<
  ServiceRequest,
  'clientId' | 'status' | 'selectedProfessionalId' | 'acceptedQuoteId'
> & { selectedProfessionalId: string } {
  if (!request || request.clientId !== clientId) throw AppException.notFound('Solicitud');
  if (alreadyReviewed || request.status === RequestStatus.CLOSED) {
    throw AppException.conflict(ErrorCode.REVIEW_ALREADY_EXISTS, 'Ya dejaste una reseña para este trabajo');
  }
  if (
    !REVIEWABLE.includes(request.status) ||
    !request.selectedProfessionalId ||
    !request.acceptedQuoteId
  ) {
    throw AppException.conflict(ErrorCode.REVIEW_NOT_ALLOWED, 'Solo se puede reseñar un trabajo terminado', {
      status: request.status,
    });
  }
}
