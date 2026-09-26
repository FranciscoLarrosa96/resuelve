import { FREE_LIMIT_COPY, proPriceAmount, proPriceText, quoteLimitReached, quoteUsageNotice } from './quote-usage';

const period = { year: 2026, month: 9 };
const free = (used: number, limit = 10) => ({ period, used, limit, remaining: Math.max(0, limit - used) });

describe('cupo FREE de presupuestos', () => {
  it('0–6 de 10: contador y lo que queda, sin PRO', () => {
    for (const used of [0, 1, 6]) {
      expect(quoteUsageNotice(free(used))).toEqual({
        tone: 'quiet',
        counter: `${used} de 10`,
        used,
        limit: 10,
        remaining: `Te quedan ${10 - used} este mes.`,
        detail: null,
        cta: null,
      });
    }
  });

  it('7/10: "Te quedan 3 este mes." + enlace discreto a PRO', () => {
    expect(quoteUsageNotice(free(7))).toMatchObject({
      tone: 'warn',
      counter: '7 de 10',
      remaining: 'Te quedan 3 este mes.',
      cta: 'Presupuestá sin límite con PRO',
    });
  });

  it('9/10: cambia el tratamiento, sin bloquear', () => {
    expect(quoteUsageNotice(free(9))).toMatchObject({
      tone: 'last',
      remaining: 'Te queda 1 presupuesto este mes.',
      detail: 'Con PRO podés responder todas las oportunidades que te interesen.',
      cta: 'Ver Resuelve PRO',
    });
    expect(quoteLimitReached(free(9))).toBe(false);
  });

  it('10/10: límite de Free con "Pasarme a PRO"', () => {
    expect(quoteUsageNotice(free(10))).toMatchObject({ tone: 'limit', counter: '10 de 10', remaining: null, cta: 'Pasarme a PRO' });
    expect(quoteLimitReached(free(10))).toBe(true);
    expect(FREE_LIMIT_COPY.body).toBe(
      'Vas a seguir recibiendo solicitudes, pero no vas a poder enviar nuevos presupuestos hasta el próximo mes.',
    );
  });

  it('PRO / sin límite: nada que contar ni bloquear', () => {
    const unlimited = { period, used: 25, limit: null, remaining: null };
    expect(quoteUsageNotice(unlimited)).toMatchObject({ tone: 'quiet', counter: null, remaining: null, cta: null });
    expect(quoteLimitReached(unlimited)).toBe(false);
    expect(quoteLimitReached(null)).toBe(false);
  });

  it('PRO que bajó a FREE con más de 10: bloqueado, contador real', () => {
    expect(quoteUsageNotice(free(14))).toMatchObject({ tone: 'limit', counter: '14 de 10' });
  });

  it('precio: "$19.000 / mes"', () => {
    expect(proPriceText(19000)).toBe('$19.000 / mes');
    expect(proPriceAmount(19000)).toBe('$19.000');
  });
});
