import { AppException } from '../common/errors/app-exception';
import { assertTransition, canTransition } from './request-state-machine';
import { RequestStatus as S } from './request.enums';

describe('request state machine', () => {
  it('permite el camino feliz completo', () => {
    const path = [
      S.DRAFT,
      S.WAITING_QUOTES,
      S.QUOTES_RECEIVED,
      S.PROFESSIONAL_SELECTED,
      S.SCHEDULED,
      S.AWAITING_REVIEW,
      S.CLOSED,
    ];
    for (let i = 0; i < path.length - 1; i++) expect(canTransition(path[i], path[i + 1])).toBe(true);
  });

  it('impide transiciones imposibles', () => {
    expect(canTransition(S.WAITING_QUOTES, S.PROFESSIONAL_SELECTED)).toBe(false); // elegir sin presupuestos
    expect(canTransition(S.WAITING_QUOTES, S.AWAITING_REVIEW)).toBe(false); // completar sin elegir
    expect(canTransition(S.QUOTES_RECEIVED, S.CLOSED)).toBe(false); // reseñar sin trabajo
    expect(canTransition(S.CLOSED, S.WAITING_QUOTES)).toBe(false); // reabrir
    expect(canTransition(S.AWAITING_REVIEW, S.CANCELLED)).toBe(false); // cancelar un trabajo hecho
    expect(canTransition(S.CANCELLED, S.WAITING_QUOTES)).toBe(false);
  });

  it('lanza INVALID_REQUEST_STATE con 409', () => {
    try {
      assertTransition(S.DRAFT, S.CLOSED);
      fail('debería lanzar');
    } catch (e) {
      expect(e).toBeInstanceOf(AppException);
      expect((e as AppException).code).toBe('INVALID_REQUEST_STATE');
      expect((e as AppException).getStatus()).toBe(409);
    }
  });
});
