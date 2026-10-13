import { contactProblem, normalizeText } from '../common/text/contact-in-text';

/**
 * Respuesta pública del profesional a una reseña (única regla). Se ve en su
 * perfil debajo de la reseña: agradecer, aclarar o contar cómo lo resolvió.
 * No cambia el puntaje ni oculta la reseña; sin teléfonos ni emails (el
 * contacto tiene sus canales).
 */
export const MIN_REVIEW_REPLY_LENGTH = 2;
export const MAX_REVIEW_REPLY_LENGTH = 500;

export function normalizeReviewReply(value: string | null | undefined): string | null {
  return normalizeText(value);
}

/** Por qué NO se acepta la respuesta (null = ok). */
export function reviewReplyProblem(reply: string | null): string | null {
  if (!reply || reply.length < MIN_REVIEW_REPLY_LENGTH) return 'Escribí tu respuesta.';
  if (reply.length > MAX_REVIEW_REPLY_LENGTH) return `La respuesta puede tener hasta ${MAX_REVIEW_REPLY_LENGTH} caracteres.`;
  const contact = contactProblem(reply);
  return contact ? `${contact.slice(0, -1)} en la respuesta.` : null;
}
