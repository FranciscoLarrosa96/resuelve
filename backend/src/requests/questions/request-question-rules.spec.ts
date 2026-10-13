import { InvitationStatus, RequestStatus } from '../request.enums';
import { canAnswerQuestion, canAskQuestion, normalizeQuestionText, questionTextProblem } from './request-question-rules';
import { reviewReplyProblem } from '../../reviews/review-reply';

describe('consultas antes de presupuestar', () => {
  const base = { requestStatus: RequestStatus.WAITING_QUOTES, invitationStatus: InvitationStatus.PENDING, blocked: false, delayed: false };

  it('pregunta quien puede responder o ya presupuestó, mientras la solicitud recibe presupuestos', () => {
    expect(canAskQuestion(base)).toBe(true);
    expect(canAskQuestion({ ...base, invitationStatus: InvitationStatus.QUOTED })).toBe(true);
    expect(canAskQuestion({ ...base, invitationStatus: InvitationStatus.DECLINED })).toBe(false);
    expect(canAskQuestion({ ...base, invitationStatus: null })).toBe(false);
    expect(canAskQuestion({ ...base, blocked: true })).toBe(false);
    expect(canAskQuestion({ ...base, delayed: true })).toBe(false);
    expect(canAskQuestion({ ...base, requestStatus: RequestStatus.PROFESSIONAL_SELECTED })).toBe(false);
    expect(canAnswerQuestion(RequestStatus.QUOTES_RECEIVED)).toBe(true);
    expect(canAnswerQuestion(RequestStatus.CANCELLED)).toBe(false);
  });

  it('texto: normalizado, con largo y sin contacto', () => {
    expect(normalizeQuestionText('  ¿Tenés   foto?\n\n\n\nGracias ')).toBe('¿Tenés foto?\n\nGracias');
    expect(questionTextProblem(null, 'la consulta')).toBe('Escribí tu consulta.');
    expect(questionTextProblem('x'.repeat(501), 'la respuesta')).toMatch(/hasta 500/);
    expect(questionTextProblem('mi cel 249 412 3456', 'la consulta')).toMatch(/teléfonos/);
    expect(questionTextProblem('¿Es de plástico o de metal?', 'la consulta')).toBeNull();
  });

  it('respuesta a reseñas: misma regla de contacto', () => {
    expect(reviewReplyProblem('¡Gracias!')).toBeNull();
    expect(reviewReplyProblem('a@b.co')).toMatch(/emails/);
    expect(reviewReplyProblem('')).toBe('Escribí tu respuesta.');
  });
});
