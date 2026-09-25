import { AppException } from '../common/errors/app-exception';
import { RequestStatus } from '../requests/request.enums';
import { assertCanReview } from './review-eligibility';

const done = {
  clientId: 'maria',
  status: RequestStatus.AWAITING_REVIEW,
  selectedProfessionalId: 'pro',
  acceptedQuoteId: 'q',
};
const code = (fn: () => void) => {
  try {
    fn();
    return 'OK';
  } catch (e) {
    return (e as AppException).code;
  }
};

describe('assertCanReview', () => {
  it('permite reseñar un trabajo terminado propio', () => {
    expect(code(() => assertCanReview(done, 'maria', false))).toBe('OK');
  });

  it('solo el cliente real (otro usuario recibe 404)', () => {
    expect(code(() => assertCanReview(done, 'otro', false))).toBe('NOT_FOUND');
  });

  it('solo trabajos completos', () => {
    for (const status of [
      RequestStatus.WAITING_QUOTES,
      RequestStatus.PROFESSIONAL_SELECTED,
      RequestStatus.SCHEDULED,
    ]) {
      expect(code(() => assertCanReview({ ...done, status }, 'maria', false))).toBe('REVIEW_NOT_ALLOWED');
    }
  });

  it('solo si hubo profesional contratado', () => {
    expect(code(() => assertCanReview({ ...done, selectedProfessionalId: null }, 'maria', false))).toBe(
      'REVIEW_NOT_ALLOWED',
    );
  });

  it('una reseña por trabajo', () => {
    expect(code(() => assertCanReview(done, 'maria', true))).toBe('REVIEW_ALREADY_EXISTS');
    expect(code(() => assertCanReview({ ...done, status: RequestStatus.CLOSED }, 'maria', false))).toBe(
      'REVIEW_ALREADY_EXISTS',
    );
  });
});
