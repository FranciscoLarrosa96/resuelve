import { jobScheduleLabel } from './job-display';
import { formatCalendarDay, normalizeCalendarDay } from './dates';

describe('jobScheduleLabel', () => {
  it('acepta fecha de calendario serializada como ISO sin concatenar otra hora', () => {
    expect(jobScheduleLabel('COMPLETED', '2026-09-30T00:00:00.000Z', '14:30')).toBe(
      jobScheduleLabel('COMPLETED', '2026-09-30', '14:30'),
    );
    expect(formatCalendarDay('2026-09-30T00:00:00.000Z', { year: 'numeric' })).toBe(
      '30 de septiembre de 2026',
    );
    expect(normalizeCalendarDay('2026-09-30T00:00:00.000Z')).toBe('2026-09-30');
  });
  it.each(['invalid', '2026-02-30', '2026-13-01', '2026-09-30Tbad'])(
    'un valor inválido no interrumpe el render: %s',
    (value) => {
      expect(formatCalendarDay(value)).toBe('Fecha no disponible');
      expect(normalizeCalendarDay(value)).toBeNull();
      expect(() => jobScheduleLabel('COMPLETED', value, null)).not.toThrow();
    },
  );
  const date = '2026-09-30';

  it.each(['TO_COORDINATE', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED'] as const)(
    'conserva la fecha visible para estado %s',
    (status) => {
      expect(jobScheduleLabel(status, date, '14:30')).toContain('14:30');
    },
  );

  it('CANCELLED nunca muestra fecha pendiente ni copy de coordinación, con o sin fecha', () => {
    expect(jobScheduleLabel('CANCELLED', null, null)).toBe('Trabajo cancelado');
    expect(jobScheduleLabel('CANCELLED', date, null)).toBe('Trabajo cancelado');
    expect(jobScheduleLabel('CANCELLED', date, '14:30')).toBe('Trabajo cancelado');
  });

  it('permite copy contextual para un trabajo aún sin fecha', () => {
    expect(jobScheduleLabel('TO_COORDINATE', null, null, 'A coordinar')).toBe('A coordinar');
  });
});
