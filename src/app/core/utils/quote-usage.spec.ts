import { FREE_LIMIT_COPY, offerPriceLine, offerTitle, proPriceAmount, proPriceText, quoteLimitReached, quoteUsageNotice } from './quote-usage';

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
      detail: 'Con Resuelve PRO podés responder todas las oportunidades que te interesen.',
      cta: 'Ver PRO',
    });
    expect(quoteLimitReached(free(9))).toBe(false);
  });

  it('10/10: límite de Free con "Conocer PRO"', () => {
    expect(quoteUsageNotice(free(10))).toMatchObject({ tone: 'limit', counter: '10 de 10', remaining: null, cta: 'Conocer PRO' });
    expect(quoteLimitReached(free(10))).toBe(true);
    expect(FREE_LIMIT_COPY.title(10)).toBe('Usaste tus 10 presupuestos de este mes');
    expect(FREE_LIMIT_COPY.body).toBe('Vas a seguir recibiendo solicitudes.');
  });

  it('oferta: título y precios salen de los montos del backend', () => {
    const offer = { eligible: true, offerCode: 'PRO_FIRST_MONTH_20', discountPercent: 20, appliesToCycles: 1, basePriceArs: 15000, discountedPriceArs: 12000, reserved: false } as const;
    expect(offerTitle(offer)).toBe('20% OFF en tu primer mes');
    expect(offerPriceLine(offer)).toEqual({ first: '$12.000 el primer mes', then: 'Luego $15.000 / mes' });
    expect(offerTitle({ discountPercent: 30, appliesToCycles: 3 })).toBe('30% OFF en tus primeros 3 meses');
    expect(offerPriceLine({ ...offer, appliesToCycles: 3 }).first).toBe('$12.000 los primeros 3 meses');
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

  it('precio: "$15.000 / mes"', () => {
    expect(proPriceText(15000)).toBe('$15.000 / mes');
    expect(proPriceAmount(15000)).toBe('$15.000');
  });
});
