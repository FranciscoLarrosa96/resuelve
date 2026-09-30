import { FREE_LIMIT_COPY, offerPriceLine, offerTitle, proPriceAmount, proPriceText, quoteLimitReached, quoteUsageNotice } from './quote-usage';

const free = (used: number, limit = 5) => ({ used, limit, remaining: Math.max(0, limit - used) });

describe('cupo FREE de presupuestos', () => {
  it('0–1 de 5: contador y lo que queda, sin PRO', () => {
    for (const used of [0, 1]) {
      expect(quoteUsageNotice(free(used))).toEqual({
        tone: 'quiet',
        counter: `${used} de 5`,
        used,
        limit: 5,
        remaining: `Te quedan ${5 - used} oportunidades Free.`,
        detail: null,
        cta: null,
      });
    }
  });

  it('2/5: quedan 3 + enlace discreto a PRO', () => {
    expect(quoteUsageNotice(free(2))).toMatchObject({
      tone: 'warn',
      counter: '2 de 5',
      remaining: 'Te quedan 3 oportunidades Free.',
      cta: 'Presupuestá sin límite con PRO',
    });
  });

  it('4/5: cambia el tratamiento, sin bloquear', () => {
    expect(quoteUsageNotice(free(4))).toMatchObject({
      tone: 'last',
      remaining: 'Te queda 1 oportunidad Free.',
      detail: 'Con Resuelve PRO podés responder todas las oportunidades que te interesen.',
      cta: 'Ver PRO',
    });
    expect(quoteLimitReached(free(4))).toBe(false);
  });

  it('5/5: límite de Free con "Conocer PRO"', () => {
    expect(quoteUsageNotice(free(5))).toMatchObject({ tone: 'limit', counter: '5 de 5', remaining: null, cta: 'Conocer PRO' });
    expect(quoteLimitReached(free(5))).toBe(true);
    expect(FREE_LIMIT_COPY.title(5)).toBe('Usaste tus 5 oportunidades Free.');
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
    const unlimited = { used: 25, limit: null, remaining: null };
    expect(quoteUsageNotice(unlimited)).toMatchObject({ tone: 'quiet', counter: null, remaining: null, cta: null });
    expect(quoteLimitReached(unlimited)).toBe(false);
    expect(quoteLimitReached(null)).toBe(false);
  });

  it('PRO que bajó a FREE con más de 5: bloqueado, contador real', () => {
    expect(quoteUsageNotice(free(8))).toMatchObject({ tone: 'limit', counter: '8 de 5' });
  });

  it('precio: "$15.000 / mes"', () => {
    expect(proPriceText(15000)).toBe('$15.000 / mes');
    expect(proPriceAmount(15000)).toBe('$15.000');
  });
});
