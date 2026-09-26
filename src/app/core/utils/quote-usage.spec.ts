import { proPriceText, quoteLimitReached, quoteUsageNotice } from './quote-usage';

const period = { year: 2026, month: 9 };
const free = (used: number, limit = 10) => ({ period, used, limit, remaining: Math.max(0, limit - used) });

describe('cupo FREE de presupuestos', () => {
  it('0–6 de 10: solo el contador, sin mensajes', () => {
    for (const used of [0, 1, 6]) {
      expect(quoteUsageNotice(free(used))).toEqual({ tone: 'quiet', counter: `${used} de 10`, message: null });
    }
  });

  it('7/10: "Te quedan 3 presupuestos este mes."', () => {
    expect(quoteUsageNotice(free(7))).toEqual({
      tone: 'warn',
      counter: '7 de 10',
      message: 'Te quedan 3 presupuestos este mes.',
    });
  });

  it('9/10: singular', () => {
    expect(quoteUsageNotice(free(9)).message).toBe('Te queda 1 presupuesto este mes.');
  });

  it('10/10: límite del mes con su nombre', () => {
    expect(quoteUsageNotice(free(10))).toEqual({
      tone: 'limit',
      counter: '10 de 10',
      message: 'Usaste tus 10 presupuestos de septiembre.',
    });
    expect(quoteLimitReached(free(10))).toBe(true);
    expect(quoteLimitReached(free(9))).toBe(false);
  });

  it('PRO / sin límite: nada que contar ni bloquear', () => {
    const unlimited = { period, used: 25, limit: null, remaining: null };
    expect(quoteUsageNotice(unlimited)).toEqual({ tone: 'quiet', counter: null, message: null });
    expect(quoteLimitReached(unlimited)).toBe(false);
    expect(quoteLimitReached(null)).toBe(false);
  });

  it('PRO que bajó a FREE con más de 10: bloqueado, contador real', () => {
    expect(quoteUsageNotice(free(14))).toMatchObject({ tone: 'limit', counter: '14 de 10' });
  });

  it('precio: "$19.000 / mes"', () => {
    expect(proPriceText(19000)).toBe('$19.000 / mes');
  });
});
