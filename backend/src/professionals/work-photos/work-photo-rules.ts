import { contactProblem } from '../../common/text/contact-in-text';

/**
 * Reglas de "Trabajos realizados" (única fuente): cuántos trabajos, cuántas
 * fotos por trabajo, qué formatos, cuánto pesan y qué pueden decir el título,
 * la descripción y las descripciones de las fotos.
 *
 * Un trabajo ("Casa 1", "Departamento centro") agrupa sus fotos y tiene mes y
 * año. Free muestra 1 trabajo y PRO hasta 10; cada trabajo, hasta 5 fotos.
 */

/** Trabajos activos por plan (el plan efectivo sale de `plans/plan.ts`). */
export const FREE_WORK_LIMIT = 1;
export const PRO_WORK_LIMIT = 10;
/** Trabajos guardados (activos + archivados por plan): nunca más que el máximo de PRO. */
export const MAX_STORED_WORKS = PRO_WORK_LIMIT;
/** Fotos por trabajo, en los dos planes. */
export const PHOTOS_PER_WORK = 5;
/**
 * Un trabajo migrado de las fotos sueltas anteriores ("Trabajos anteriores")
 * puede tener más de 5 (PRO tenía hasta 20): no se pierde ninguna, pero no se
 * le suman más hasta bajar de 5.
 */
export const MAX_PHOTOS_IN_LEGACY_WORK = 20;
/** Peso máximo por foto (el celular saca fotos de 3–7 MB). */
export const MAX_WORK_PHOTO_BYTES = 8 * 1024 * 1024;
export const ALLOWED_WORK_PHOTO_FORMATS = ['jpg', 'png', 'webp'] as const;
export const MAX_CAPTION_LENGTH = 80;
export const MIN_WORK_TITLE_LENGTH = 2;
export const MAX_WORK_TITLE_LENGTH = 60;
export const MAX_WORK_DESCRIPTION_LENGTH = 160;
/** Primer año aceptado para "¿Cuándo lo hiciste?". */
export const MIN_WORK_YEAR = 1980;

export function workPhotoFolder(professionalId: string): string {
  return `resuelve/professional-work/${professionalId}`;
}

/** Texto de una línea, sin espacios de más; vacío = null. */
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
 * Por qué NO se acepta la descripción de una foto (null = ok). Las fotos son
 * públicas: nada de teléfonos ni emails.
 */
export function captionProblem(caption: string | null): string | null {
  if (caption === null) return null;
  if (caption.length > MAX_CAPTION_LENGTH) return `La descripción puede tener hasta ${MAX_CAPTION_LENGTH} caracteres.`;
  const contact = contactProblem(caption);
  return contact ? `${contact.slice(0, -1)} en la descripción.` : null;
}

/** Título del trabajo: obligatorio, 2–60 caracteres, sin teléfonos ni emails. */
export function workTitleProblem(title: string | null): string | null {
  if (!title || title.length < MIN_WORK_TITLE_LENGTH) return 'Poné un nombre para el trabajo (por ejemplo, "Casa 1").';
  if (title.length > MAX_WORK_TITLE_LENGTH) return `El nombre puede tener hasta ${MAX_WORK_TITLE_LENGTH} caracteres.`;
  const contact = contactProblem(title);
  return contact ? `${contact.slice(0, -1)} en el nombre.` : null;
}

/** Descripción del trabajo: opcional, hasta 160 caracteres, sin teléfonos ni emails. */
export function workDescriptionProblem(description: string | null): string | null {
  if (description === null) return null;
  if (description.length > MAX_WORK_DESCRIPTION_LENGTH)
    return `La descripción puede tener hasta ${MAX_WORK_DESCRIPTION_LENGTH} caracteres.`;
  const contact = contactProblem(description);
  return contact ? `${contact.slice(0, -1)} en la descripción.` : null;
}

/** Mes actual en Argentina ("2026-10"). */
export function currentArgentinaMonth(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit' })
    .formatToParts(now)
    .reduce<Record<string, string>>((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  return `${parts.year}-${parts.month}`;
}

/**
 * "¿Cuándo lo hiciste?": mes y año ("2026-03"), desde 1980 y nunca en el
 * futuro (mes de Argentina). null = válido.
 */
export function workMonthProblem(month: string, now = new Date()): string | null {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  const year = match ? Number(match[1]) : NaN;
  const mm = match ? Number(match[2]) : NaN;
  if (!match || mm < 1 || mm > 12 || year < MIN_WORK_YEAR) return 'Elegí el mes y el año del trabajo.';
  if (month > currentArgentinaMonth(now)) return 'La fecha del trabajo no puede ser futura.';
  return null;
}

/** "2026-03" ↔ columna `date` ("2026-03-01"). */
export function workMonthToDate(month: string): string {
  return `${month}-01`;
}

export function dateToWorkMonth(value: string | Date): string {
  // `pg` devuelve `date` como medianoche local: se leen los campos locales, nunca UTC.
  if (value instanceof Date) return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}`;
  return String(value).slice(0, 7);
}
