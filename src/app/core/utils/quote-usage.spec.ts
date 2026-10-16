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

  it('2/5 y 3/5: quedan varias; sigue siendo solo informativo, sin enlace a PRO', () => {
    expect(quoteUsageNotice(free(2))).toMatchObject({
      tone: 'quiet',
      counter: '2 de 5',
      remaining: 'Te quedan 3 oportunidades Free.',
      detail: null,
      cta: null,
    });
    expect(quoteUsageNotice(free(3))).toMatchObject({ tone: 'quiet', remaining: 'Te quedan 2 oportunidades Free.', cta: null });
  });

  it('con el cupo por defecto (3), el enlace a PRO no aparece hasta que queda 1', () => {
    expect(quoteUsageNotice(free(0, 3))).toMatchObject({ tone: 'quiet', cta: null, detail: null });
    expect(quoteUsageNotice(free(1, 3))).toMatchObject({ tone: 'quiet', cta: null, detail: null });
    expect(quoteUsageNotice(free(2, 3))).toMatchObject({ tone: 'last', cta: 'Conocer PRO' });
    expect(quoteUsageNotice(free(3, 3))).toMatchObject({ tone: 'limit', cta: 'Conocer PRO' });
  });

  it('4/5: cambia el tratamiento, sin bloquear', () => {
    expect(quoteUsageNotice(free(4))).toMatchObject({
      tone: 'last',
      remaining: 'Te queda 1 oportunidad gratuita para enviar presupuestos.',
      detail: 'Con Resuelve PRO podés seguir participando y darle más visibilidad a tu perfil.',
      cta: 'Conocer PRO',
    });
    expect(quoteLimitReached(free(4))).toBe(false);
  });

  it('5/5: límite de Free con "Conocer PRO"', () => {
    expect(quoteUsageNotice(free(5))).toMatchObject({ tone: 'limit', counter: '5 de 5', remaining: null, cta: 'Conocer PRO' });
    expect(quoteLimitReached(free(5))).toBe(true);
    expect(FREE_LIMIT_COPY.title(3)).toBe('Ya usaste tus 3 oportunidades gratuitas.');
    // Agotar el cupo no corta nada de lo gratis: lo dice el aviso.
    expect(FREE_LIMIT_COPY.body).toBe('Vas a seguir recibiendo solicitudes, y WhatsApp y llamadas siguen funcionando gratis.');
    expect(FREE_LIMIT_COPY.pro).toBe(
      'Con Resuelve PRO podés seguir participando en nuevas solicitudes, destacar tu perfil y conocer el interés que genera.',
    );
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
