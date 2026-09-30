import type { ConfigService } from '@nestjs/config';
import { PlanTier } from '../professionals/professional.enums';
import { envConfig } from './plan-set.cli';
import { ProOfferEventType, ProOfferSurface } from './pro-offer-event.entity';
import {
  OfferContext,
  configuredOffers,
  findOffer,
  introOffer,
  offerEventDedupeKey,
  offerIneligibility,
  offerPricing,
} from './pro-offers';

const NOW = new Date('2026-09-26T15:00:00Z');
const config = (env: Record<string, string> = {}): ConfigService => envConfig(env);
const offer = introOffer(config())!;

const free = {
  planTier: PlanTier.FREE,
  planExpiresAt: null,
  firstPaidProAt: null,
  proInterestOfferCode: null,
};
const ctx = (
  patch: Partial<OfferContext> = {},
  profile: Partial<OfferContext['profile']> = {},
): OfferContext => ({
  profile: { ...free, ...profile },
  used: 9,
  freeLimit: 10,
  redeemed: false,
  now: NOW,
  ...patch,
});

describe('oferta de bienvenida: configuración', () => {
  it('default: PRO_FIRST_MONTH_20, 20 % un mes, desde 9 presupuestos', () => {
    expect(offer).toEqual({
      code: 'PRO_FIRST_MONTH_20',
      kind: 'INTRO',
      discountPercent: 20,
      cycles: 1,
      minFreeUsage: 9,
    });
  });

  it('se configura por env y se apaga con PRO_INTRO_OFFER_ENABLED=false', () => {
    const c = config({ PRO_INTRO_OFFER_CODE: 'PRO_FIRST_MONTH_30', PRO_INTRO_OFFER_DISCOUNT_PERCENT: '30' });
    expect(introOffer(c)).toMatchObject({ code: 'PRO_FIRST_MONTH_30', discountPercent: 30 });
    expect(findOffer(c, 'PRO_FIRST_MONTH_20')).toBeNull();
    const off = config({ PRO_INTRO_OFFER_ENABLED: 'false' });
    expect(introOffer(off)).toBeNull();
    expect(configuredOffers(off)).toEqual([]);
    expect(findOffer(off, 'PRO_FIRST_MONTH_20')).toBeNull();
  });

  it('el precio lo calcula el servidor: $15.000 → $12.000 el primer mes', () => {
    expect(offerPricing(offer, 15000)).toEqual({
      basePriceArs: 15000,
      discountPercent: 20,
      cycles: 1,
      discountedPriceArs: 12000,
    });
    expect(offerPricing({ ...offer, discountPercent: 33 }, 19999).discountedPriceArs).toBe(13399);
  });
});

describe('oferta de bienvenida: elegibilidad', () => {
  it('Free 8/10 → no (umbral 9)', () => {
    expect(offerIneligibility(offer, ctx({ used: 8 }))).toBe('USAGE_BELOW_THRESHOLD');
  });

  it('Free 9/10 y 10/10 → elegible', () => {
    expect(offerIneligibility(offer, ctx({ used: 9 }))).toBeNull();
    expect(offerIneligibility(offer, ctx({ used: 10 }))).toBeNull();
  });

  it('ya la usó → no', () => {
    expect(offerIneligibility(offer, ctx({ redeemed: true }))).toBe('ALREADY_REDEEMED');
  });

  it('PRO vigente → no; PRO vencido cuenta como Free', () => {
    expect(offerIneligibility(offer, ctx({}, { planTier: PlanTier.PRO }))).toBe('NOT_FREE');
    expect(
      offerIneligibility(offer, ctx({}, { planTier: PlanTier.PRO, planExpiresAt: new Date('2026-09-01') })),
    ).toBeNull();
  });

  it('tuvo PRO pago y volvió a Free → no, aunque llegue al cupo', () => {
    expect(offerIneligibility(offer, ctx({ used: 10 }, { firstPaidProAt: new Date('2026-05-01') }))).toBe(
      'ALREADY_HAD_PRO',
    );
  });

  it('Free sin tope configurado → no hay límite que resolver', () => {
    expect(offerIneligibility(offer, ctx({ freeLimit: null }))).toBe('NO_FREE_LIMIT');
  });

  it('el umbral se acota al cupo total (con límite 5, se ofrece al llegar a 5)', () => {
    expect(offerIneligibility(offer, ctx({ used: 5, freeLimit: 5 }))).toBeNull();
    expect(offerIneligibility(offer, ctx({ used: 4, freeLimit: 5 }))).toBe('USAGE_BELOW_THRESHOLD');
  });

  it('reservada al pedir PRO: sigue valiendo aunque el mes nuevo arranque en 0', () => {
    expect(offerIneligibility(offer, ctx({ used: 0 }, { proInterestOfferCode: offer.code }))).toBeNull();
    expect(offerIneligibility(offer, ctx({ used: 0 }, { proInterestOfferCode: 'OTRA_OFERTA' }))).toBe(
      'USAGE_BELOW_THRESHOLD',
    );
  });
});

describe('eventos de oferta', () => {
  const key = (type: ProOfferEventType, surface: ProOfferSurface | null, at = NOW) =>
    offerEventDedupeKey(type, 'pro-1', offer.code, surface, at);

  it('SHOWN: uno por superficie y día de Argentina', () => {
    const s = ProOfferSurface.PLAN_PAGE;
    expect(key(ProOfferEventType.SHOWN, s)).toBe(
      key(ProOfferEventType.SHOWN, s, new Date('2026-09-27T02:59:00Z')),
    );
    expect(key(ProOfferEventType.SHOWN, s)).not.toBe(
      key(ProOfferEventType.SHOWN, s, new Date('2026-09-27T03:00:00Z')),
    );
    expect(key(ProOfferEventType.SHOWN, s)).not.toBe(
      key(ProOfferEventType.SHOWN, ProOfferSurface.LIMIT_MODAL),
    );
    expect(key(ProOfferEventType.SHOWN, s)).not.toBe(key(ProOfferEventType.CLICKED, s));
  });

  it('REDEEMED: uno por profesional y oferta, para siempre', () => {
    expect(key(ProOfferEventType.REDEEMED, null)).toBe(
      key(ProOfferEventType.REDEEMED, null, new Date('2027-01-01T00:00:00Z')),
    );
    expect(key(ProOfferEventType.REDEEMED, null)).toMatch(/^[0-9a-f]{64}$/);
  });
});
