import { effectivePlan, planSource, resolveProfessionalAccess } from '../plans/plan';
import { PlanTier } from '../professionals/professional.enums';
const now = new Date('2026-09-30T12:00:00Z'),
  future = new Date('2026-10-15T12:00:00Z');
describe('bonus PRO separado de billing', () => {
  it('bonus vigente da PRO; vencido vuelve al resolver normal', () => {
    const p = { planTier: PlanTier.FREE, planExpiresAt: null, bonusProUntil: future, firstSuccessAt: now };
    expect(resolveProfessionalAccess(p, {}, now).source).toBe('BONUS_PRO');
    expect(effectivePlan(p, future)).toBe(PlanTier.FREE);
  });
  it('manual y Mercado Pago mantienen prioridad; bonus mantiene acceso después de vencer billing', () => {
    const paid = {
      planTier: PlanTier.FREE,
      planExpiresAt: null,
      billingProUntil: new Date('2026-10-02'),
      bonusProUntil: future,
    };
    expect(planSource(paid, now)).toBe('BILLING');
    expect(planSource(paid, new Date('2026-10-03'))).toBe('BONUS');
    expect(planSource({ ...paid, planTier: PlanTier.PRO }, now)).toBe('MANUAL');
  });
});
