/**
 * Auditoría de datos previa al lanzamiento (Fase 8, "data hygiene"). Solo reglas puras: qué texto
 * parece de QA o basura. La consulta y el reporte están en launch-audit.cli.ts (solo lectura).
 */

const QA_WORDS = /\b(test\d*|tester|prueba\d*|qa|demo|dummy|mock|fake|lorem|ipsum)\b/i;
const QA_EMAIL_DOMAINS = /@(test\.dev|resuelve\.dev|example\.(com|org|net)|mailinator\.com)$/i;
/** Filas del teclado y secuencias típicas de pruebas manuales ("qwe", "asdf", "123456"). */
const KEYBOARD_ROW = /^(?:qwe|wer|ert|asd|sdf|dfg|zxc|xcv|123|234|abc)/i;

export function looksLikeQaText(text: string | null | undefined): boolean {
  const value = (text ?? '').trim();
  if (!value) return false;
  return QA_WORDS.test(value);
}

export function looksLikeQaEmail(email: string | null | undefined): boolean {
  return QA_EMAIL_DOMAINS.test((email ?? '').trim());
}

/** Comentario de reseña que no dice nada: muy corto, un carácter o una unidad repetida, o un teclazo. */
export function isJunkComment(comment: string | null | undefined): boolean {
  const value = (comment ?? '').trim();
  if (!value) return false;
  const compact = value.replace(/\s+/g, '');
  if (compact.length < 3) return true;
  if (/^(.{1,4})\1+$/.test(compact)) return true; // aaaa, 123123, qweqwe
  // Una sola "palabra" que arranca como una fila del teclado: qwerty, asdfgh, 12345...
  return !/\s/.test(value) && value.length <= 14 && KEYBOARD_ROW.test(value);
}
