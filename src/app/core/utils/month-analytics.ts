import { AdvancedAnalytics, MonthAnalytics, MonthCounts, MonthRef, WeekActivity } from '../models/pro-analytics';
import { pluralize } from './format';

/** Reglas de presentación de "Tu mes". Deterministas (sin IA) y solo con datos reales. */

export const MONTH_NAMES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

export const monthName = (m: MonthRef): string => MONTH_NAMES[m.month - 1];
/** "septiembre 2026" */
export const monthLabel = (m: MonthRef): string => `${monthName(m)} ${m.year}`;

export const shiftMonth = (m: MonthRef, delta: number): MonthRef => {
  const index = m.year * 12 + (m.month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
};
export const monthKey = (m: MonthRef): number => m.year * 12 + m.month;

/** "1–7 sep" */
export function weekLabel(w: Pick<WeekActivity, 'fromDay' | 'toDay'>, m: MonthRef): string {
  return `${w.fromDay}–${w.toDay} ${monthName(m).slice(0, 3)}`;
}

/** 62,5 % · null (sin enviados) = "—", nunca "0 %". */
export function rateText(rate: number | null): string {
  if (rate === null) return '—';
  return `${String(rate).replace('.', ',')} %`;
}

/**
 * Diferencia contra el mes anterior en números absolutos, nunca en %
 * (con base 0 un porcentaje no significa nada). Sin comparación → null.
 * "+3 vs. agosto" · "2 menos que agosto" · "igual que agosto"
 */
export function deltaText(current: number, previous: number | undefined, prev: MonthRef | null): string | null {
  if (previous === undefined || !prev) return null;
  const diff = current - previous;
  const name = monthName(prev);
  if (diff === 0) return `igual que ${name}`;
  return diff > 0 ? `+${diff} vs. ${name}` : `${-diff} menos que ${name}`;
}

/** Hay algo para mostrar este mes (si no, empty state "Tu mes recién empieza"). */
export function hasActivity(a: Pick<MonthAnalytics, 'basic'>): boolean {
  const b = a.basic;
  return [b.requestsReceived, b.quotesSent, b.quotesAccepted, b.scheduledJobs, b.completedJobs, b.reviewsReceived].some(
    (n) => n > 0,
  );
}

/** El primero de la lista, solo si le gana claramente al segundo (sin empates inventados). */
function clearLeader<T extends { requestsReceived: number }>(rows: T[]): T | null {
  const [first, second] = rows;
  if (!first || first.requestsReceived === 0) return null;
  if (second && second.requestsReceived >= first.requestsReceived) return null;
  return rows.length > 1 ? first : null;
}

/**
 * Frases para PRO, derivadas de los números del mes con reglas fijas:
 * - aceptación sobre la misma base ("Aceptaron 5 de tus 8 presupuestos");
 * - servicio y barrio con más solicitudes, solo si hay más de uno y sin empate;
 * - más solicitudes que el mes anterior, solo si hay comparación.
 */
export function monthInsights(a: AdvancedAnalytics, basic: MonthCounts, period: MonthRef): string[] {
  const out: string[] = [];
  const { sent, accepted } = a.acceptance;
  if (sent > 0) out.push(`Aceptaron ${accepted} de ${pluralize(sent, 'presupuesto enviado', 'presupuestos enviados')} este mes.`);
  const service = clearLeader(a.byService);
  if (service) out.push(`${service.name} fue tu servicio con más solicitudes en ${monthName(period)}.`);
  const zone = clearLeader(a.byZone);
  if (zone) out.push(`${zone.name} fue el barrio con más solicitudes.`);
  if (a.previous && basic.requestsReceived > a.previous.requestsReceived) {
    const diff = basic.requestsReceived - a.previous.requestsReceived;
    out.push(`Recibiste ${pluralize(diff, 'solicitud', 'solicitudes')} más que en ${monthName(a.previous)}.`);
  }
  return out;
}
