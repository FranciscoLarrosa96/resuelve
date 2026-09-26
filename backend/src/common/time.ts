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

/** Minutos que la zona de negocio está adelantada respecto de UTC en ese instante (Argentina: -180). */
function businessOffsetMinutes(at: Date): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: BUSINESS_TIME_ZONE,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/** Instante (UTC) en que empieza el día `YYYY-MM-DD` en la zona de negocio. */
export function businessDayStart(day: string): Date {
  const utcMidnight = new Date(`${day}T00:00:00Z`);
  return new Date(utcMidnight.getTime() - businessOffsetMinutes(utcMidnight) * 60_000);
}
