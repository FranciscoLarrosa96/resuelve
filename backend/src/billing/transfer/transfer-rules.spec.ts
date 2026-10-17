import {
  isValidCbu,
  isValidRefundDestination,
  newTransferReference,
  retimeAfterRevocation,
  transferAmount,
  transferPeriodEnd,
  transferOutcomeVisible,
  transferPeriodStart,
  transferWithdrawableUntil,
  withdrawalPeriodState,
} from './transfer-rules';

const DAY = 86_400_000;

describe('reglas de transferencia', () => {
  it('el resultado de la revisión se muestra 7 días y solo si fue confirmado o rechazado', () => {
    const reviewedAt = new Date('2026-10-01T12:00:00Z');
    const at = (days: number) => new Date(reviewedAt.getTime() + days * DAY);
    expect(transferOutcomeVisible({ status: 'REJECTED', reviewedAt }, at(0))).toBe(true);
    expect(transferOutcomeVisible({ status: 'APPROVED', reviewedAt }, at(6.9))).toBe(true);
    expect(transferOutcomeVisible({ status: 'REJECTED', reviewedAt }, at(7))).toBe(false);
    expect(transferOutcomeVisible({ status: 'WITHDRAWN', reviewedAt }, at(1))).toBe(false);
    expect(transferOutcomeVisible({ status: 'REJECTED', reviewedAt: null }, at(1))).toBe(false);
  });

  it('monto: precio × meses; la bienvenida solo en el primer mes', () => {
    expect(transferAmount(15000, 1, null)).toBe(15000);
    expect(transferAmount(15000, 3, null)).toBe(45000);
    expect(transferAmount(15000, 6, null)).toBe(90000);
    expect(transferAmount(15000, 1, 12000)).toBe(12000);
    expect(transferAmount(15000, 6, 12000)).toBe(87000);
  });

  it('el período arranca al terminar el PRO vigente que vence (nunca pisa días), o ahora', () => {
    const now = new Date('2026-10-09T12:00:00Z');
    const bonus = new Date('2026-10-20T00:00:00Z');
    const transfer = new Date('2026-11-01T00:00:00Z');
    const manual = new Date('2026-12-01T00:00:00Z');
    expect(transferPeriodStart({ manualPro: false }, now)).toEqual(now);
    expect(transferPeriodStart({ bonusProUntil: bonus, manualPro: false }, now)).toEqual(bonus);
    expect(transferPeriodStart({ bonusProUntil: bonus, transferProUntil: transfer, manualPro: false }, now)).toEqual(transfer);
    expect(transferPeriodStart({ planExpiresAt: manual, manualPro: true }, now)).toEqual(manual);
    // Un vencimiento manual que no es PRO (FREE con fecha vieja) no cuenta; fechas pasadas tampoco.
    expect(transferPeriodStart({ planExpiresAt: manual, manualPro: false }, now)).toEqual(now);
    expect(transferPeriodStart({ bonusProUntil: new Date('2026-01-01'), manualPro: false }, now)).toEqual(now);
    expect(transferPeriodEnd(now, 3).getTime() - now.getTime()).toBe(90 * DAY);
  });

  it('CBU/CVU con dígitos verificadores; alias de 6 a 20 caracteres', () => {
    expect(isValidCbu('2850590940090418135201')).toBe(true);
    expect(isValidCbu('2850590940090418135202')).toBe(false);
    expect(isValidCbu('285059094009041813520')).toBe(false);
    expect(isValidRefundDestination('mi.alias.mp')).toBe(true);
    expect(isValidRefundDestination('2850590940090418135201')).toBe(true);
    expect(isValidRefundDestination('corto')).toBe(false);
    expect(isValidRefundDestination('con espacio')).toBe(false);
  });

  it('código del concepto: RES- + 6 caracteres sin ambiguos', () => {
    for (let i = 0; i < 50; i++) expect(newTransferReference()).toMatch(/^RES-[A-HJ-KM-NP-Z2-9]{6}$/);
  });

  it('arrepentimiento: días corridos desde que se confirmó', () => {
    const approved = new Date('2026-10-01T00:00:00Z');
    expect(transferWithdrawableUntil(approved, 10)).toEqual(new Date('2026-10-11T00:00:00Z'));
    expect(transferWithdrawableUntil(null, 10)).toBeNull();
  });

  it('arrepentimiento: la ventana corre desde la confirmación, pero un período que arranca después "todavía no empezó"', () => {
    const confirmed = new Date('2026-10-18T12:00:00Z');
    const plusStart = new Date('2026-11-05T12:00:00Z');
    const day = (n: number) => new Date(confirmed.getTime() + n * DAY);
    // Ventana: 10 días desde la confirmación, aunque Plus empiece a los 18.
    expect(transferWithdrawableUntil(confirmed, 10)).toEqual(day(10));
    expect(withdrawalPeriodState(plusStart, day(4))).toBe('NOT_STARTED');
    expect(withdrawalPeriodState(plusStart, plusStart)).toBe('STARTED');
    expect(withdrawalPeriodState(confirmed, day(0))).toBe('STARTED'); // confirmación tardía: empieza ya
    expect(withdrawalPeriodState(null, day(0))).toBe('STARTED');
  });
});

describe('retimeAfterRevocation', () => {
  const now = new Date('2026-10-20T12:00:00Z');
  const at = (days: number) => new Date(now.getTime() + days * DAY);

  it('sin el período revocado, el Plus programado se adelanta a ahora y conserva su duración', () => {
    // PRO revocado: hoy→+30. Plus: +30→+60. Sin otras fuentes de acceso.
    const [plus] = retimeAfterRevocation([{ id: 'plus', months: 1, periodStart: at(30) }], { manualPro: false }, now);
    expect(plus.periodStart).toEqual(now);
    expect(plus.periodEnd).toEqual(at(30));
  });

  it('respeta el acceso que queda (pagos anteriores, bonus): no empieza antes de que termine', () => {
    const [plus] = retimeAfterRevocation(
      [{ id: 'plus', months: 1, periodStart: at(60) }],
      { transferProUntil: at(10), bonusProUntil: at(15), manualPro: false },
      now,
    );
    expect(plus.periodStart).toEqual(at(15));
    expect(plus.periodEnd).toEqual(at(45));
  });

  it('encadena varios pagos posteriores y nunca atrasa uno', () => {
    const out = retimeAfterRevocation(
      [
        { id: 'b', months: 3, periodStart: at(60) },
        { id: 'a', months: 1, periodStart: at(30) },
      ],
      { manualPro: false },
      now,
    );
    expect(out.map((o) => o.id)).toEqual(['a', 'b']);
    expect(out[0].periodStart).toEqual(now);
    expect(out[1].periodStart).toEqual(out[0].periodEnd);
    expect(out[1].periodEnd.getTime() - out[1].periodStart.getTime()).toBe(90 * DAY);
    for (const [i, o] of out.entries()) expect(o.periodStart.getTime()).toBeLessThanOrEqual([at(30), at(60)][i].getTime());
  });
});
