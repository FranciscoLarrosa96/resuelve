/** Zona horaria de negocio: las ciudades actuales están todas en Argentina. */
export const BUSINESS_TIME_ZONE = 'America/Argentina/Buenos_Aires';

/** "2026-09-25" en la zona horaria de negocio. */
export function businessToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** "2026-09-01": primer día del mes de negocio (para el uso mensual del plan). */
export function businessMonthStart(now: Date = new Date()): string {
  return businessToday(now).slice(0, 8) + '01';
}
