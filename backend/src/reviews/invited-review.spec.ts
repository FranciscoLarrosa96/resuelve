import { INVITED_REVIEWS_LIMIT, invitedReviewBlocker, type InvitedReviewFacts } from './invited-review';

const base: InvitedReviewFacts = {
  isOwnProfile: false,
  hasReviewedBefore: false,
  pendingJobRequestId: null,
  recentInvitedCount: 0,
};

describe('invitedReviewBlocker', () => {
  it('deja reseñar a un cliente sin historia con el profesional', () => {
    expect(invitedReviewBlocker(base)).toBeNull();
  });

  it('el propio perfil nunca', () => {
    expect(invitedReviewBlocker({ ...base, isOwnProfile: true })).toBe('OWN_PROFILE');
  });

  it('una sola reseña por persona y profesional', () => {
    expect(invitedReviewBlocker({ ...base, hasReviewedBefore: true })).toBe('ALREADY_REVIEWED');
  });

  it('si tiene un trabajo terminado sin reseña, va por el trabajo (verificada)', () => {
    expect(invitedReviewBlocker({ ...base, pendingJobRequestId: 'req-1' })).toBe('USE_JOB_REVIEW');
  });

  it('respeta el tope de la ventana', () => {
    expect(invitedReviewBlocker({ ...base, recentInvitedCount: INVITED_REVIEWS_LIMIT - 1 })).toBeNull();
    expect(invitedReviewBlocker({ ...base, recentInvitedCount: INVITED_REVIEWS_LIMIT })).toBe(
      'LIMIT_REACHED',
    );
  });

  it('el propio perfil gana sobre el resto de los motivos', () => {
    expect(
      invitedReviewBlocker({
        isOwnProfile: true,
        hasReviewedBefore: true,
        pendingJobRequestId: 'r',
        recentInvitedCount: 99,
      }),
    ).toBe('OWN_PROFILE');
  });
});
