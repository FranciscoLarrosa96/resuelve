import { businessDayStart, businessToday } from './time';

describe('zona horaria de negocio (Argentina)', () => {
  it('el día empieza a las 03:00 UTC', () => {
    expect(businessDayStart('2026-09-28').toISOString()).toBe('2026-09-28T03:00:00.000Z');
  });

  it('un turno a las 22:30 de Tandil es del mismo día aunque en UTC ya sea el siguiente', () => {
    const start = new Date('2026-09-28T22:30:00-03:00');
    expect(start.toISOString()).toBe('2026-09-29T01:30:00.000Z');
    expect(businessToday(start)).toBe('2026-09-28');
    expect(start >= businessDayStart('2026-09-28') && start < businessDayStart('2026-09-29')).toBe(true);
  });
});
