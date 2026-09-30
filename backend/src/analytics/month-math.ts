import type { BusinessMonth } from '../common/time';

/**
 * Tasa de aceptación en % con un decimal. Sin presupuestos enviados no hay
 * base: null (la UI muestra "—", nunca 0 %).
 */
export function acceptanceRate(accepted: number, sent: number): number | null {
  if (sent <= 0) return null;
  return Math.round((accepted / sent) * 1000) / 10;
}

/** La mediana evita que una respuesta excepcionalmente tardía distorsione el mes. */
export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Ninguna referencia sale si una métrica pudiera representar a muy pocos profesionales. */
export function benchmarkEligible(
  cohort: number, responders: number, events: number, minProfessionals: number, minEvents: number,
): boolean {
  return cohort >= minProfessionals && responders >= minProfessionals && events >= minEvents;
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
