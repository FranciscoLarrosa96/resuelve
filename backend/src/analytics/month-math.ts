import type { BusinessMonth } from '../common/time';

/**
 * Tasa de aceptación en % con un decimal. Sin presupuestos enviados no hay
 * base: null (la UI muestra "—", nunca 0 %).
 */
export function acceptanceRate(accepted: number, sent: number): number | null {
  if (sent <= 0) return null;
  return Math.round((accepted / sent) * 1000) / 10;
}

/** Días del mes (bisiestos incluidos). */
export function daysInMonth({ year, month }: BusinessMonth): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Semanas del mes por día calendario: 1–7, 8–14, 15–21, 22–28 y, si
 * existe, 29–fin. Es el mismo corte que usa el SQL (`LEAST(4, (día - 1) / 7)`).
 */
export function monthWeeks(period: BusinessMonth): { fromDay: number; toDay: number }[] {
  const last = daysInMonth(period);
  return [1, 8, 15, 22, 29]
    .filter((from) => from <= last)
    .map((from) => ({ fromDay: from, toDay: Math.min(from + 6, last) }));
}
