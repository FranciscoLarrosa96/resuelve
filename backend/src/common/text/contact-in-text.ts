/**
 * Teléfonos o emails en un texto que ve otra persona antes de que haya
 * contacto por Resuelve (fotos públicas, respuestas a reseñas, consultas
 * previas al presupuesto). El contacto directo tiene sus propios canales.
 * null = ok.
 */
export function contactProblem(text: string): string | null {
  if (/[^\s@]+@[^\s@]+\.[^\s@]+/.test(text)) return 'No incluyas emails.';
  if ((text.match(/\d/g) ?? []).length >= 8 && /\d[\d\s().-]{6,}\d/.test(text)) return 'No incluyas teléfonos.';
  return null;
}

/** Texto libre de varias líneas: sin caracteres de control ni espacios de más; vacío = null. */
export function normalizeText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const clean = value
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return clean ? clean : null;
}
