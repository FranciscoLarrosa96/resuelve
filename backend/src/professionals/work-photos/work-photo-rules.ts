/**
 * Reglas de "Trabajos realizados" (única fuente): cuántas fotos, qué
 * formatos, cuánto pesan y qué puede decir la descripción.
 */

/** Máximo de fotos por perfil profesional. Lo garantiza el backend (lock del perfil). */
export const MAX_WORK_PHOTOS = 5;
/** Peso máximo por foto (el celular saca fotos de 3–7 MB). */
export const MAX_WORK_PHOTO_BYTES = 8 * 1024 * 1024;
export const ALLOWED_WORK_PHOTO_FORMATS = ['jpg', 'png', 'webp'] as const;
export const MAX_CAPTION_LENGTH = 80;

export function workPhotoFolder(professionalId: string): string {
  return `resuelve/professional-work/${professionalId}`;
}

/** Descripción opcional: una línea, sin espacios de más; vacía = sin descripción. */
export function normalizeCaption(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const clean = value
    // Saltos de línea y caracteres de control → un espacio (es una sola línea).
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return clean ? clean : null;
}

/**
 * Por qué NO se acepta la descripción (null = ok). Las fotos son públicas:
 * nada de teléfonos ni emails (el contacto va por Resuelve).
 */
export function captionProblem(caption: string | null): string | null {
  if (caption === null) return null;
  if (caption.length > MAX_CAPTION_LENGTH) return `La descripción puede tener hasta ${MAX_CAPTION_LENGTH} caracteres.`;
  if (/[^\s@]+@[^\s@]+\.[^\s@]+/.test(caption)) return 'No incluyas emails en la descripción.';
  if ((caption.match(/\d/g) ?? []).length >= 8 && /\d[\d\s().-]{6,}\d/.test(caption))
    return 'No incluyas teléfonos en la descripción.';
  return null;
}
