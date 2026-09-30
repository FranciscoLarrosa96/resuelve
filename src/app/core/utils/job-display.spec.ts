import { jobScheduleLabel } from './job-display';

describe('jobScheduleLabel', () => {
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
