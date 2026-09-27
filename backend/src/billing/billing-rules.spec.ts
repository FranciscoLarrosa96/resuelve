import { BillingPaymentStatus, BillingSubscriptionStatus as S } from './billing.enums';
import {
  billingProUntil,
  paidThrough,
  paymentStatusFromProvider,
  safeReturnPath,
  subscriptionAccessUntil,
  subscriptionStatusFromProvider,
} from './billing-rules';

const DAY = 86_400_000;
const now = new Date('2026-09-27T12:00:00Z');
const days = (n: number) => new Date(now.getTime() + n * DAY);
const sub = (over: Partial<Parameters<typeof subscriptionAccessUntil>[0]>) => ({
  status: S.ACTIVE,
  nextPaymentAt: null,
  authorizedAt: null,
  pastDueSince: null,
  accessUntil: null,
  ...over,
});

describe('billing-rules', () => {
  it('traduce el estado del preapproval sin strings crudos fuera de acá', () => {
    expect(subscriptionStatusFromProvider('pending', S.PENDING)).toBe(S.PENDING);
    expect(subscriptionStatusFromProvider('authorized', S.PENDING)).toBe(S.ACTIVE);
    expect(subscriptionStatusFromProvider('paused', S.ACTIVE)).toBe(S.PAUSED);
    expect(subscriptionStatusFromProvider('cancelled', S.ACTIVE)).toBe(S.CANCELLED);
    expect(subscriptionStatusFromProvider('canceled', S.ACTIVE)).toBe(S.CANCELLED);
    expect(subscriptionStatusFromProvider('algo-nuevo', S.ACTIVE)).toBe(S.ACTIVE);
  });

  it('authorized no borra un PAST_DUE: eso lo deciden los cobros', () => {
    expect(subscriptionStatusFromProvider('authorized', S.PAST_DUE)).toBe(S.PAST_DUE);
  });

  it('traduce el cobro (invoice)', () => {
    expect(paymentStatusFromProvider({ status: 'processed', paymentStatus: 'approved' })).toBe(BillingPaymentStatus.APPROVED);
    expect(paymentStatusFromProvider({ status: 'recycling', paymentStatus: 'rejected' })).toBe(BillingPaymentStatus.REJECTED);
    expect(paymentStatusFromProvider({ status: 'cancelled', paymentStatus: 'rejected' })).toBe(BillingPaymentStatus.CANCELLED);
    expect(paymentStatusFromProvider({ status: 'scheduled', paymentStatus: null })).toBe(BillingPaymentStatus.PENDING);
  });

  it('ACTIVE da PRO hasta el próximo cobro + gracia', () => {
    expect(subscriptionAccessUntil(sub({ nextPaymentAt: days(20) }), 10, now)).toEqual(days(30));
  });

  it('PAST_DUE da PRO durante la gracia desde el primer rechazo', () => {
    expect(subscriptionAccessUntil(sub({ status: S.PAST_DUE, pastDueSince: days(-3) }), 10, now)).toEqual(days(7));
  });

  it('PENDING y PAUSED nunca dan PRO; CANCELLED solo hasta accessUntil', () => {
    expect(subscriptionAccessUntil(sub({ status: S.PENDING, nextPaymentAt: days(5) }), 10, now)).toBeNull();
    expect(subscriptionAccessUntil(sub({ status: S.PAUSED, nextPaymentAt: days(5) }), 10, now)).toBeNull();
    expect(subscriptionAccessUntil(sub({ status: S.CANCELLED, accessUntil: days(4) }), 10, now)).toEqual(days(4));
  });

  it('el perfil toma la mayor vigencia entre suscripciones', () => {
    const subs = [sub({ status: S.CANCELLED, accessUntil: days(2) }), sub({ nextPaymentAt: days(25) })];
    expect(billingProUntil(subs, 10, now)).toEqual(days(35));
    expect(billingProUntil([], 10, now)).toBeNull();
  });

  describe('paidThrough (acceso al cancelar)', () => {
    it('sin cobro aprobado no hay período pago', () => {
      expect(paidThrough({ status: S.ACTIVE, lastPaymentAt: null, nextPaymentAt: days(10) }, days(10))).toBeNull();
    });
    it('en mora termina ya', () => {
      expect(paidThrough({ status: S.PAST_DUE, lastPaymentAt: days(-35), nextPaymentAt: days(-5) }, null)).toBeNull();
    });
    it('usa el próximo cobro del proveedor', () => {
      expect(paidThrough({ status: S.ACTIVE, lastPaymentAt: days(-10), nextPaymentAt: null }, days(20))).toEqual(days(20));
    });
    it('nunca regala más de un ciclo desde el último pago', () => {
      expect(paidThrough({ status: S.ACTIVE, lastPaymentAt: days(-10), nextPaymentAt: null }, days(200))).toEqual(days(22));
    });
  });

  it('returnTo solo acepta rutas internas del panel', () => {
    expect(safeReturnPath('/pro/solicitudes/0b7c5a1e-1111-4a2b-9c3d-123456789abc')).toBe(
      '/pro/solicitudes/0b7c5a1e-1111-4a2b-9c3d-123456789abc',
    );
    for (const bad of ['https://evil.test', '//evil.test', '/pro/../admin', '/perfil', '/pro/x?y=1', 'javascript:x']) {
      expect(safeReturnPath(bad)).toBeNull();
    }
  });
});
