import { describe, expect, it } from 'vitest';
import { dayGroup, groupByDay, relativeTime } from './notification-time';

const NOW = new Date('2026-10-02T15:00:00-03:00');
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;

describe('relativeTime', () => {
  it('minutos, horas, ayer y fecha', () => {
    expect(relativeTime(ago(20_000), NOW)).toBe('Ahora');
    expect(relativeTime(ago(12 * MIN), NOW)).toBe('Hace 12 min');
    expect(relativeTime(ago(3 * HOUR), NOW)).toBe('Hace 3 h');
    expect(relativeTime(ago(20 * HOUR), NOW)).toBe('Ayer');
    expect(relativeTime(ago(5 * 24 * HOUR), NOW)).toMatch(/sep/);
  });
});

describe('agrupar por día de Argentina', () => {
  it('Hoy, Ayer y Anteriores, en orden', () => {
    expect(dayGroup(ago(HOUR), NOW)).toBe('Hoy');
    // Pasada la medianoche de Argentina ya es "Ayer", aunque falten menos de 24 h.
    expect(dayGroup('2026-10-01T23:30:00-03:00', NOW)).toBe('Ayer');
    expect(dayGroup(ago(3 * 24 * HOUR), NOW)).toBe('Anteriores');
    const groups = groupByDay(
      [
        { id: 1, createdAt: ago(HOUR) },
        { id: 2, createdAt: ago(2 * HOUR) },
        { id: 3, createdAt: ago(26 * HOUR) },
        { id: 4, createdAt: ago(9 * 24 * HOUR) },
      ],
      NOW,
    );
    expect(groups.map((g) => [g.group, g.items.map((i) => i.id)])).toEqual([
      ['Hoy', [1, 2]],
      ['Ayer', [3]],
      ['Anteriores', [4]],
    ]);
  });
});

describe('formatPastDate', () => {
  it('día de Argentina con año', async () => {
    const { formatPastDate } = await import('./notification-time');
    expect(formatPastDate('2026-09-12T22:30:00-03:00')).toBe('12 sep 2026');
    // 01:00 UTC del día 13 todavía es 12 en Argentina.
    expect(formatPastDate('2026-09-13T01:00:00Z')).toBe('12 sep 2026');
  });
});
