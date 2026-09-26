/**
 * Fechas y horas de trabajo en la zona de Resuelve (Tandil), sin depender de
 * la zona del navegador ni del servidor. El backend guarda y devuelve UTC; acá
 * se convierte para mostrar y para armar lo que se envía.
 *
 * Argentina no tiene horario de verano desde 2009: el offset es fijo (-03:00).
 * Si eso cambiara, alcanza con tocar BUSINESS_UTC_OFFSET y los tests de este archivo.
 */
export const BUSINESS_TIME_ZONE = 'America/Argentina/Buenos_Aires';
export const BUSINESS_UTC_OFFSET = '-03:00';

const DOW_LONG = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const DOW_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTHS_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function parts(value: Date | string) {
  const date = typeof value === 'string' ? new Date(value) : value;
  const p = Object.fromEntries(FORMAT.formatToParts(date).map((x) => [x.type, x.value]));
  return { day: `${p['year']}-${p['month']}-${p['day']}`, time: `${p['hour']}:${p['minute']}` };
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** Fecha de calendario (sin hora): se opera en UTC para no depender del huso local. */
const calendar = (day: string) => new Date(`${day}T12:00:00Z`);

/** "2026-09-28" en hora de Argentina. */
export function businessDay(value: Date | string = new Date()): string {
  return parts(value).day;
}

/** "09:05" en hora de Argentina. */
export function businessClock(value: Date | string): string {
  return parts(value).time;
}

/** Minutos desde las 00:00 (hora de Argentina). */
export function businessMinutes(value: Date | string): number {
  const [h, m] = businessClock(value).split(':').map(Number);
  return h * 60 + m;
}

/** Fecha + hora elegidas en el formulario → ISO con la zona de Argentina. */
export function businessInstant(day: string, time: string): string {
  return `${day}T${time}:00${BUSINESS_UTC_OFFSET}`;
}

/** Inicio del día en hora de Argentina, como ISO (UTC) para consultar la API. */
export function dayStartIso(day: string): string {
  return new Date(businessInstant(day, '00:00')).toISOString();
}

export function shiftDay(day: string, days: number): string {
  const d = calendar(day);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 0 = lunes … 6 = domingo. */
export function weekdayIndex(day: string): number {
  return (calendar(day).getUTCDay() + 6) % 7;
}

/** Lunes de la semana de `day`. */
export function weekStart(day: string): string {
  return shiftDay(day, -weekdayIndex(day));
}

export function dayNumber(day: string): number {
  return calendar(day).getUTCDate();
}

/** "Lun" */
export function shortWeekday(day: string): string {
  return DOW_SHORT[calendar(day).getUTCDay()];
}

/** "Domingo 28 de septiembre" */
export function formatDayLong(day: string): string {
  const d = calendar(day);
  return `${capitalize(DOW_LONG[d.getUTCDay()])} ${d.getUTCDate()} de ${MONTHS_LONG[d.getUTCMonth()]}`;
}

/** "Domingo 28 sep" */
export function formatDayMedium(day: string): string {
  const d = calendar(day);
  return `${capitalize(DOW_LONG[d.getUTCDay()])} ${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]}`;
}

/** "28 sep" */
export function formatDayShort(day: string): string {
  const d = calendar(day);
  return `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]}`;
}

/** "Hoy · viernes 26" · "Mañana · sábado 27" · "Domingo 28" */
export function formatDayHeading(day: string, today = businessDay()): string {
  const d = calendar(day);
  const base = `${DOW_LONG[d.getUTCDay()]} ${d.getUTCDate()}`;
  if (day === today) return `Hoy · ${base}`;
  if (day === shiftDay(today, 1)) return `Mañana · ${base}`;
  return capitalize(base);
}

/** "10:00 a 12:00" */
export function formatTimeRange(startsAt: string, endsAt: string): string {
  return `${businessClock(startsAt)} a ${businessClock(endsAt)}`;
}

/** "Hoy, 19:30" · "Mañana, 09:00" · "Ayer, 18:10" · "28 sep, 14:00" */
export function formatWhen(value: string, now: Date = new Date()): string {
  const { day, time } = parts(value);
  const today = businessDay(now);
  if (day === today) return `Hoy, ${time}`;
  if (day === shiftDay(today, 1)) return `Mañana, ${time}`;
  if (day === shiftDay(today, -1)) return `Ayer, ${time}`;
  return `${formatDayShort(day)}, ${time}`;
}

/** "28 sep – 4 oct" */
export function formatWeekRange(monday: string): string {
  return `${formatDayShort(monday)} – ${formatDayShort(shiftDay(monday, 6))}`;
}
