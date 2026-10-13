import { contactProblem, normalizeText } from '../../common/text/contact-in-text';
import { InvitationStatus, RequestStatus } from '../request.enums';
import { QUOTABLE_STATUSES } from '../request-state-machine';

/**
 * Consultas antes de presupuestar (única regla):
 * - pregunta un profesional invitado que puede responder la solicitud (o que
 *   ya la presupuestó y quiere aclarar algo), mientras recibe presupuestos;
 * - una a la vez (la siguiente, cuando el cliente respondió) y hasta
 *   `MAX_QUESTIONS_PER_PROFESSIONAL` por solicitud;
 * - el cliente responde cada una una vez;
 * - textos de 2 a 500 caracteres, sin teléfonos ni emails.
 * No consume cupo Free ni cambia el estado de la invitación.
 */
export const MAX_QUESTIONS_PER_PROFESSIONAL = 3;
export const MIN_QUESTION_LENGTH = 2;
export const MAX_QUESTION_LENGTH = 500;

export const normalizeQuestionText = (value: string | null | undefined) => normalizeText(value);

/** Por qué NO se acepta el texto (null = ok). `what` = "la consulta" | "la respuesta". */
export function questionTextProblem(text: string | null, what: 'la consulta' | 'la respuesta'): string | null {
  if (!text || text.length < MIN_QUESTION_LENGTH) return what === 'la consulta' ? 'Escribí tu consulta.' : 'Escribí tu respuesta.';
  if (text.length > MAX_QUESTION_LENGTH) return `${what === 'la consulta' ? 'La consulta' : 'La respuesta'} puede tener hasta ${MAX_QUESTION_LENGTH} caracteres.`;
  const contact = contactProblem(text);
  return contact ? `${contact.slice(0, -1)}: los datos de contacto se comparten al elegir un presupuesto.` : null;
}

/** ¿Este profesional puede preguntar en esta solicitud? (sin contar el tope ni la pendiente). */
export function canAskQuestion(input: {
  requestStatus: RequestStatus;
  invitationStatus: InvitationStatus | null;
  blocked: boolean;
  delayed: boolean;
}): boolean {
  return (
    QUOTABLE_STATUSES.includes(input.requestStatus) &&
    (input.invitationStatus === InvitationStatus.PENDING || input.invitationStatus === InvitationStatus.QUOTED) &&
    !input.blocked &&
    !input.delayed
  );
}

/** ¿El cliente todavía puede responder? (mientras la solicitud recibe presupuestos). */
export function canAnswerQuestion(requestStatus: RequestStatus): boolean {
  return QUOTABLE_STATUSES.includes(requestStatus);
}
