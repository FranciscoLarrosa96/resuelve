import { businessDay, shiftDay } from './business-time';

const DOW = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Calendar dates may arrive as date-only or serialized ISO. Preserve their calendar day, not a timezone conversion. */
export function normalizeCalendarDay(value: string | null | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)) return null;
  const day = value.slice(0, 10);
  const date = new Date(`${day}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== day) return null;
  if (value.length > 10 && !Number.isFinite(new Date(value).getTime())) return null;
  return day;
}

export function formatCalendarDay(
  value: string | null,
  options: Intl.DateTimeFormatOptions = {},
  fallback = 'Fecha no disponible',
): string {
  const day = normalizeCalendarDay(value);
  return day
    ? new Intl.DateTimeFormat('es-AR', {
        day: 'numeric',
        month: 'long',
        ...options,
        timeZone: 'UTC',
      }).format(new Date(`${day}T12:00:00Z`))
    : fallback;
}

/** Fecha local en YYYY-MM-DD (lo que espera `desiredDate`). */
export function localIsoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function dayOfWeek(date: Date): string {
  return DOW[date.getDay()];
}

/**
 * Fecha de calendario YYYY-MM-DD (sin hora, como `desiredDate`) → "Hoy",
 * "Mañana" o "Dom 4/10". "Hoy" es el día de ARGENTINA, no el del navegador:
 * un navegador en otro huso (o el reloj de un test) no corre el día. La fecha
 * se trata como date-only real: nunca pasa por un Date con hora local.
 */
export function formatDesiredDate(iso: string | null, today: Date | string = new Date()): string {
  if (!iso) return 'Sin fecha';
  const todayIso = typeof today === 'string' ? today : businessDay(today);
  if (iso === todayIso) return 'Hoy';
  if (iso === shiftDay(todayIso, 1)) return 'Mañana';
  const [, m, d] = iso.split('-').map(Number);
  return `${DOW[new Date(`${iso}T12:00:00Z`).getUTCDay()]} ${d}/${m}`;
}

/** Timestamp del backend → "Hoy, 10:42" · "Ayer, 21:15" · "18 sep" · "18 sep 2025". */
export function formatTimestamp(value: string | null, now = new Date()): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const time = `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
  const iso = localIsoDate(date);
  if (iso === localIsoDate(now)) return `Hoy, ${time}`;
  if (iso === localIsoDate(addDays(now, -1))) return `Ayer, ${time}`;
  const base = `${date.getDate()} ${MONTHS[date.getMonth()]}`;
  return date.getFullYear() === now.getFullYear() ? base : `${base} ${date.getFullYear()}`;
}

/** Timestamp del backend → día en Argentina ("Hoy", "Mañana", "Lun 28/9"). */
export function formatDay(value: string | null, today: Date | string = new Date()): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : formatDesiredDate(businessDay(date), today);
}
