import {
  businessDayStart,
  businessMonthRange,
  businessToday,
  currentBusinessMonth,
  previousBusinessMonth,
} from './time';

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

describe('mes de negocio', () => {
  it('septiembre va del 1 a las 00:00 al 1 de octubre a las 00:00 de Argentina', () => {
    const { start, end } = businessMonthRange({ year: 2026, month: 9 });
    expect(start.toISOString()).toBe('2026-09-01T03:00:00.000Z');
    expect(end.toISOString()).toBe('2026-10-01T03:00:00.000Z');
  });

  it('diciembre termina en enero del año siguiente', () => {
    expect(businessMonthRange({ year: 2026, month: 12 }).end.toISOString()).toBe('2027-01-01T03:00:00.000Z');
    expect(previousBusinessMonth({ year: 2027, month: 1 })).toEqual({ year: 2026, month: 12 });
  });

  it('el 30/9 a las 23:30 de Tandil sigue siendo septiembre (en UTC ya es octubre)', () => {
    expect(currentBusinessMonth(new Date('2026-10-01T02:30:00Z'))).toEqual({ year: 2026, month: 9 });
    expect(currentBusinessMonth(new Date('2026-10-01T03:00:00Z'))).toEqual({ year: 2026, month: 10 });
  });
});
