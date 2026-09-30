import { acceptanceRate, benchmarkEligible, daysInMonth, median, monthWeeks } from './month-math';

describe('privacidad de referencias', () => {
  it('7 profesionales, 7 respuestas o menos de 20 eventos mantienen la referencia oculta', () => {
    expect(benchmarkEligible(7, 7, 30, 8, 20)).toBe(false);
    expect(benchmarkEligible(8, 7, 30, 8, 20)).toBe(false);
    expect(benchmarkEligible(8, 8, 19, 8, 20)).toBe(false);
    expect(benchmarkEligible(8, 8, 20, 8, 20)).toBe(true);
  });
});

describe('tiempo de primera respuesta', () => {
  it('la mediana no cambia por una respuesta tardía aislada y no muta la entrada', () => {
    const minutes = [18, 8, 720, 24, 12];
    expect(median(minutes)).toBe(18);
    expect(minutes).toEqual([18, 8, 720, 24, 12]);
    expect(median([8, 24])).toBe(16);
    expect(median([])).toBeNull();
  });
});

describe('tasa de aceptación', () => {
  it('sin enviados no hay base: null (no 0 %)', () => {
    expect(acceptanceRate(0, 0)).toBeNull();
  });

  it('5 de 8 = 62,5 %', () => {
    expect(acceptanceRate(5, 8)).toBe(62.5);
    expect(acceptanceRate(1, 3)).toBe(33.3);
  });
});

describe('semanas del mes', () => {
  it('septiembre (30 días): 1–7, 8–14, 15–21, 22–28, 29–30', () => {
    expect(monthWeeks({ year: 2026, month: 9 })).toEqual([
      { fromDay: 1, toDay: 7 },
      { fromDay: 8, toDay: 14 },
      { fromDay: 15, toDay: 21 },
      { fromDay: 22, toDay: 28 },
      { fromDay: 29, toDay: 30 },
    ]);
  });

  it('febrero no bisiesto tiene 4 semanas justas; bisiesto suma el 29', () => {
    expect(monthWeeks({ year: 2026, month: 2 })).toHaveLength(4);
    expect(daysInMonth({ year: 2028, month: 2 })).toBe(29);
    expect(monthWeeks({ year: 2028, month: 2 }).at(-1)).toEqual({ fromDay: 29, toDay: 29 });
  });
});
