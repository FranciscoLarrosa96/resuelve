const DOW = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

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

/** "2026-09-28" → "Lun 28/9" (sin corrimientos de huso: se arma con la fecha local). */
export function formatDesiredDate(iso: string | null, today = new Date()): string {
  if (!iso) return 'Sin fecha';
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  if (iso === localIsoDate(today)) return 'Hoy';
  if (iso === localIsoDate(addDays(today, 1))) return 'Mañana';
  return `${DOW[date.getDay()]} ${d}/${m}`;
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

/** Timestamp del backend → día local ("Hoy", "Mañana", "Lun 28/9"). */
export function formatDay(value: string | null, today = new Date()): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : formatDesiredDate(localIsoDate(date), today);
}
