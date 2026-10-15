import { PlanTier } from '../professionals/professional.enums';
import { ConfigService } from '@nestjs/config';
import { proTrialDays, proTrialIneligibility } from './pro-trial';

const now = new Date('2026-10-13T15:00:00Z');
const free = {
  planTier: PlanTier.FREE,
  planExpiresAt: null,
  billingProUntil: null,
  transferProUntil: null,
  bonusProUntil: null,
  firstSuccessAt: new Date('2026-09-01T00:00:00Z'),
  firstPaidProAt: null,
};

describe('proTrialIneligibility', () => {
  it('Free después del primer cliente, sin prueba ni pago previo: puede', () => {
    expect(proTrialIneligibility(free, false, true, now)).toBeNull();
  });
  it('una sola vez, nunca a quien ya pagó PRO ni con PRO vigente de cualquier fuente', () => {
    expect(proTrialIneligibility(free, true, true, now)).toBe('ALREADY_HAD_TRIAL');
    expect(proTrialIneligibility({ ...free, firstPaidProAt: now }, false, true, now)).toBe('ALREADY_PAID_PRO');
    expect(proTrialIneligibility({ ...free, planTier: PlanTier.PRO }, false, true, now)).toBe('NOT_FREE');
    const later = new Date(now.getTime() + 86_400_000);
    expect(proTrialIneligibility({ ...free, bonusProUntil: later }, false, true, now)).toBe('NOT_FREE');
    expect(proTrialIneligibility({ ...free, billingProUntil: later }, false, true, now)).toBe('NOT_FREE');
    expect(proTrialIneligibility({ ...free, transferProUntil: later }, false, true, now)).toBe('NOT_FREE');
  });
  it('días de referidos ya vencidos no la impiden', () => {
    expect(proTrialIneligibility({ ...free, bonusProUntil: new Date('2026-10-01T00:00:00Z') }, false, true, now)).toBeNull();
  });
  it('antes del primer cliente no (ya responde sin límite) y apagada por config no', () => {
    expect(proTrialIneligibility({ ...free, firstSuccessAt: null }, false, true, now)).toBe('BEFORE_FIRST_SUCCESS');
    expect(proTrialIneligibility(free, false, false, now)).toBe('TRIAL_DISABLED');
  });
});


it('las pruebas nuevas duran como máximo 7 días, incluso con la configuración anterior de 14', () => {
  expect(proTrialDays(new ConfigService())).toBe(7);
  expect(proTrialDays(new ConfigService({ PRO_TRIAL_DAYS: 14 }))).toBe(7);
});
