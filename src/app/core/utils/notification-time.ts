import { businessDay, formatDayShort, shiftDay } from './business-time';

/** "Ahora" · "Hace 12 min" · "Hace 3 h" · "Ayer" · "18 sep". Los días son los de Argentina. */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  const minutes = Math.floor((now.getTime() - at.getTime()) / 60_000);
  if (minutes < 1) return 'Ahora';
  if (minutes < 60) return `Hace ${minutes} min`;
  const day = businessDay(at);
  const today = businessDay(now);
  if (day === today) return `Hace ${Math.floor(minutes / 60)} h`;
  if (day === shiftDay(today, -1)) return 'Ayer';
  return formatDayShort(day);
}

export type DayGroup = 'Hoy' | 'Ayer' | 'Anteriores';

/** Encabezado de la lista: el día del aviso en Argentina. */
export function dayGroup(iso: string, now: Date = new Date()): DayGroup {
  const day = businessDay(iso);
  const today = businessDay(now);
  if (day === today) return 'Hoy';
  if (day === shiftDay(today, -1)) return 'Ayer';
  return 'Anteriores';
}

/** Agrupa conservando el orden (más nuevas primero). */
export function groupByDay<T extends { createdAt: string }>(
  items: readonly T[],
  now: Date = new Date(),
): { group: DayGroup; items: T[] }[] {
  const groups: { group: DayGroup; items: T[] }[] = [];
  for (const item of items) {
    const group = dayGroup(item.createdAt, now);
    const last = groups[groups.length - 1];
    if (last?.group === group) last.items.push(item);
    else groups.push({ group, items: [item] });
  }
  return groups;
}

/** "12 sep 2026" (día de Argentina): fecha de un trabajo ya realizado. */
export function formatPastDate(iso: string): string {
  const day = businessDay(iso);
  return `${formatDayShort(day)} ${day.slice(0, 4)}`;
}
