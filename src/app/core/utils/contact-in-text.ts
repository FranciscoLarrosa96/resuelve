/**
 * Espejo de la regla del backend (`common/text/contact-in-text.ts`): un texto
 * que ve la otra parte antes del contacto por Resuelve no lleva teléfonos ni
 * emails. El backend es la fuente; acá solo se avisa antes de enviar.
 */
export function contactInText(text: string): 'EMAIL' | 'PHONE' | null {
  if (/[^\s@]+@[^\s@]+\.[^\s@]+/.test(text)) return 'EMAIL';
  if ((text.match(/\d/g) ?? []).length >= 8 && /\d[\d\s().-]{6,}\d/.test(text)) return 'PHONE';
  return null;
}
