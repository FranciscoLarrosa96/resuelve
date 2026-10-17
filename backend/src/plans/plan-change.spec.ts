import { BillingSubscriptionStatus } from '../billing/billing.enums';
import { PlanTier } from '../professionals/professional.enums';
import {
  chargeActivatesPlan,
  hasChargeMargin,
  isScheduledUpgrade,
  mpPlanChangeState,
  planChangeFlags,
} from './plan-change';

const NOW = new Date('2026-10-20T12:00:00Z');
const HOUR = 3_600_000;

describe('plan-change (reglas puras)', () => {
  it('solo PRO → PRO Plus se programa; el cambio inverso y los iguales no', () => {
    expect(isScheduledUpgrade(PlanTier.PRO, PlanTier.PRO_PLUS)).toBe(true);
    expect(isScheduledUpgrade(PlanTier.PRO_PLUS, PlanTier.PRO)).toBe(false);
    expect(isScheduledUpgrade(PlanTier.PRO, PlanTier.PRO)).toBe(false);
    expect(isScheduledUpgrade(PlanTier.FREE, PlanTier.PRO_PLUS)).toBe(false);
  });

  it('las funciones nuevas de cobro están apagadas por defecto', () => {
    expect(planChangeFlags({ get: (_k: string, d?: unknown) => d } as never)).toEqual({
      transfer: false,
      mercadoPago: false,
      minHoursBeforeCharge: 24,
    });
    const on = planChangeFlags({ get: (k: string, d?: unknown) => (k.endsWith('ENABLED') ? true : d) } as never);
    expect(on).toMatchObject({ transfer: true, mercadoPago: true });
  });

  it('estados: solicitado, confirmado por el proveedor y descartando (activo ya no es un cambio pendiente)', () => {
    const base = { pendingPlanTier: PlanTier.PRO_PLUS, pendingConfirmedAt: null, pendingRevertingAt: null };
    expect(mpPlanChangeState({ ...base, pendingPlanTier: null })).toBeNull();
    expect(mpPlanChangeState(base)).toBe('REQUESTED');
    expect(mpPlanChangeState({ ...base, pendingConfirmedAt: NOW })).toBe('CONFIRMED');
    expect(mpPlanChangeState({ ...base, pendingConfirmedAt: NOW, pendingRevertingAt: NOW })).toBe('REVERTING');
  });

  it('el margen antes del cobro: sin fecha o con menos horas que el mínimo no se pide', () => {
    expect(hasChargeMargin(null, NOW, 24)).toBe(false);
    expect(hasChargeMargin(new Date(NOW.getTime() + 23 * HOUR), NOW, 24)).toBe(false);
    expect(hasChargeMargin(new Date(NOW.getTime() + 24 * HOUR), NOW, 24)).toBe(true);
    expect(hasChargeMargin(new Date(NOW.getTime() - HOUR), NOW, 24)).toBe(false);
  });

  describe('qué cobro activa Plus', () => {
    const pending = {
      pendingPlanTier: PlanTier.PRO_PLUS,
      pendingAmount: 24900,
      pendingRequestedAt: new Date(NOW.getTime() - 5 * HOUR),
      status: BillingSubscriptionStatus.ACTIVE,
      withdrawnAt: null,
    };
    it('solo el cobro con el monto de Plus, posterior al pedido', () => {
      expect(chargeActivatesPlan(pending, 24900, NOW)).toBe(true);
    });
    it('un cobro con el monto anterior (o cualquier otro) nunca lo activa', () => {
      expect(chargeActivatesPlan(pending, 15000, NOW)).toBe(false);
      expect(chargeActivatesPlan(pending, 12000, NOW)).toBe(false);
    });
    it('un cobro anterior al pedido, sin cambio pendiente, cancelada o revocada, tampoco', () => {
      expect(chargeActivatesPlan(pending, 24900, new Date(NOW.getTime() - 6 * HOUR))).toBe(false);
      expect(chargeActivatesPlan({ ...pending, pendingPlanTier: null }, 24900, NOW)).toBe(false);
      expect(chargeActivatesPlan({ ...pending, status: BillingSubscriptionStatus.CANCELLED }, 24900, NOW)).toBe(false);
      expect(chargeActivatesPlan({ ...pending, withdrawnAt: NOW }, 24900, NOW)).toBe(false);
    });
  });
});
