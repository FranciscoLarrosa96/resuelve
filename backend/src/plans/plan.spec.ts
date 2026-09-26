import { PlanTier } from '../professionals/professional.enums';
import { effectivePlan, entitlementsFor, presentPlan } from './plan';
// Importarlo no ejecuta el comando (solo corre con require.main).
import { parseExpiry } from './plan-set.cli';

const NOW = new Date('2026-09-26T15:00:00Z');

describe('plan efectivo', () => {
  it('FREE es FREE aunque tenga fecha de vencimiento cargada', () => {
    expect(effectivePlan({ planTier: PlanTier.FREE, planExpiresAt: new Date('2027-01-01') }, NOW)).toBe(
      PlanTier.FREE,
    );
  });

  it('PRO sin vencimiento es PRO', () => {
    expect(effectivePlan({ planTier: PlanTier.PRO, planExpiresAt: null }, NOW)).toBe(PlanTier.PRO);
  });

  it('PRO temporal: vale hasta el vencimiento y después vuelve a FREE sin tocar datos', () => {
    const p = { planTier: PlanTier.PRO, planExpiresAt: new Date('2026-09-26T16:00:00Z') };
    expect(effectivePlan(p, NOW)).toBe(PlanTier.PRO);
    expect(effectivePlan(p, new Date('2026-09-26T16:00:00Z'))).toBe(PlanTier.FREE);
    expect(p.planTier).toBe(PlanTier.PRO);
  });
});

describe('entitlements', () => {
  it('FREE no tiene extras', () => {
    expect(entitlementsFor(PlanTier.FREE)).toEqual({
      canSendUnlimitedQuotes: false,
      canBeFeatured: false,
      canUseAdvancedAnalytics: false,
      canSeeExposureAnalytics: false,
      canUseQuoteTemplates: false,
    });
  });

  it('PRO habilita análisis y destacado; plantillas siguen apagadas por flag (no existen)', () => {
    expect(entitlementsFor(PlanTier.PRO)).toEqual({
      canSendUnlimitedQuotes: true,
      canBeFeatured: true,
      canUseAdvancedAnalytics: true,
      canSeeExposureAnalytics: true,
      canUseQuoteTemplates: false,
    });
  });

  it('un PRO vencido se presenta como FREE y sin fecha', () => {
    const plan = presentPlan({ planTier: PlanTier.PRO, planExpiresAt: new Date('2026-09-01') }, NOW);
    expect(plan).toMatchObject({
      tier: 'FREE',
      expiresAt: null,
      entitlements: { canUseAdvancedAnalytics: false },
    });
  });
});

describe('plan:set (vencimiento)', () => {
  it('sin flags: sin vencimiento', () => {
    expect(parseExpiry({}, NOW)).toBeNull();
  });

  it('--days 90 y --until (fin del día en Argentina)', () => {
    expect((parseExpiry({ days: '90' }, NOW) as Date).toISOString()).toBe('2026-12-25T15:00:00.000Z');
    expect((parseExpiry({ until: '2026-12-31' }, NOW) as Date).toISOString()).toBe(
      '2027-01-01T02:59:59.000Z',
    );
  });

  it('rechaza días inválidos, fechas pasadas o ambas cosas juntas', () => {
    const cases: Record<string, string>[] = [
      { days: '0' },
      { days: 'x' },
      { until: '2026-01-01' },
      { until: 'mañana' },
      { days: '3', until: '2027-01-01' },
    ];
    for (const flags of cases) expect(parseExpiry(flags, NOW)).toBe('invalid');
  });
});
