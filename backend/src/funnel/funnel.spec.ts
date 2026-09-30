import { FunnelEventType as T } from './funnel-event.entity';
import { funnelDedupeKey } from './funnel';
import { funnelRates } from './funnel-report';

describe('funnelDedupeKey', () => {
  const pro = '11111111-1111-1111-1111-111111111111';
  it('ONCE: una por profesional, sin importar la referencia ni el día', () => {
    expect(funnelDedupeKey(T.FIRST_QUOTE_SENT, pro, 'a')).toBe(funnelDedupeKey(T.FIRST_QUOTE_SENT, pro, 'b'));
    expect(funnelDedupeKey(T.FIRST_SUCCESS_REACHED, pro)).toBe(`FIRST_SUCCESS_REACHED:${pro}`);
  });
  it('REF: una por referencia', () => {
    expect(funnelDedupeKey(T.FREE_QUOTE_USED, pro, 'r1')).not.toBe(
      funnelDedupeKey(T.FREE_QUOTE_USED, pro, 'r2'),
    );
  });
  it('DAY: por superficie y día de Argentina (23:30 del 30 y 00:30 del 1 son días distintos)', () => {
    const late = new Date('2026-09-30T23:30:00-03:00');
    const early = new Date('2026-10-01T00:30:00-03:00');
    expect(funnelDedupeKey(T.PRO_PLAN_VIEWED, pro, 'PLAN_PAGE', late)).toContain('2026-09-30');
    expect(funnelDedupeKey(T.PRO_PLAN_VIEWED, pro, 'PLAN_PAGE', early)).toContain('2026-10-01');
  });
  it('FREE_QUOTE_LIMIT_REACHED: una vez por profesional aunque cambie el mes', () => {
    const a = funnelDedupeKey(T.FREE_QUOTE_LIMIT_REACHED, pro, null, new Date('2026-09-02T12:00:00-03:00'));
    const b = funnelDedupeKey(T.FREE_QUOTE_LIMIT_REACHED, pro, null, new Date('2026-09-29T12:00:00-03:00'));
    const c = funnelDedupeKey(T.FREE_QUOTE_LIMIT_REACHED, pro, null, new Date('2026-10-01T00:10:00-03:00'));
    expect(a).toBe(b);
    expect(a).toBe(c);
  });
});

describe('funnelRates', () => {
  const zero = {
    registered: 0,
    profileCompleted: 0,
    firstOpportunity: 0,
    firstQuote: 0,
    firstAccepted: 0,
    firstSuccess: 0,
    proOffer: 0,
    checkout: 0,
    pro: 0,
    renewed: 0,
    proAfterFirstSuccess: 0,
    cancelled: 0,
  };
  it('sin denominador → null (nunca 0 % inventado)', () => {
    expect(Object.values(funnelRates(zero)).every((v) => v === null)).toBe(true);
  });
  it('definiciones', () => {
    const r = funnelRates({
      ...zero,
      registered: 10,
      firstQuote: 6,
      firstSuccess: 4,
      pro: 2,
      proAfterFirstSuccess: 2,
      renewed: 1,
      cancelled: 1,
    });
    expect(r).toEqual({
      activationRate: 60,
      firstSuccessRate: 40,
      freeToPro: 20,
      firstSuccessToPro: 50,
      proToSecondMonth: 50,
      cancellation: 50,
    });
  });
});
