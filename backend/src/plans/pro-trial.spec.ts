import { PlanTier } from '../professionals/professional.enums';
import { ConfigService } from '@nestjs/config';
import { proTrialDays, proTrialIneligibility, proTrialReadiness } from './pro-trial';
import { ProfessionalProfile } from '../professionals/professional-profile.entity';

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
  it('Free sin prueba ni pago previo: puede, sin exigir un presupuesto aceptado', () => {
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
  it('no depende del primer cliente; apagada por config no', () => {
    const beforeFirstSuccess = { ...free, firstSuccessAt: null };
    expect(proTrialIneligibility(beforeFirstSuccess, false, true, now)).toBeNull();
    expect(proTrialIneligibility(free, false, false, now)).toBe('TRIAL_DISABLED');
  });
});

describe('perfil preparado para probar PRO', () => {
  const ready = {
    ...free, id: 'p1', status: 'ACTIVE', avatarUrl: 'https://example.test/avatar.jpg',
    services: [{ service: { active: true } }],
    localities: [{ cityId: 'c1', coversEntireCity: true, city: { active: true } }],
    serviceAreas: [], contactRequestsEnabled: true,
    contactWhatsappEnabled: false, contactCallsEnabled: false, contactConsentAt: null,
    contactWhatsappNumber: null, contactPhoneNumber: null,
  } as unknown as ProfessionalProfile;
  const db = (photo = true) => ({ query: jest.fn().mockResolvedValue(photo
    ? [{ professional_id: 'p1', title: 'Mi trabajo', url: 'https://example.test/work.jpg' }] : []) });

  it('acepta solo solicitudes o solo WhatsApp con consentimiento, sin primer éxito', async () => {
    expect(await proTrialReadiness(db(), ready)).toBeNull();
    expect(await proTrialReadiness(db(), { ...ready, contactRequestsEnabled: false,
      contactWhatsappEnabled: true, contactConsentAt: now, contactWhatsappNumber: '+5491112345678',
    })).toBeNull();
  });
  it('exige publicación, avatar, canal realmente publicable y trabajo con foto pública', async () => {
    expect(await proTrialReadiness(db(), { ...ready, services: [] })).toBe('PROFILE_NOT_PUBLISHED');
    expect(await proTrialReadiness(db(), { ...ready, localities: [] })).toBe('PROFILE_NOT_PUBLISHED');
    expect(await proTrialReadiness(db(), { ...ready, status: 'PAUSED' as ProfessionalProfile['status'] })).toBe('PROFILE_NOT_PUBLISHED');
    expect(await proTrialReadiness(db(), { ...ready, avatarUrl: null })).toBe('MISSING_AVATAR');
    expect(await proTrialReadiness(db(), { ...ready, contactRequestsEnabled: false,
      contactWhatsappEnabled: true, contactWhatsappNumber: '+5491112345678',
    })).toBe('NO_CONTACT_CHANNEL');
    expect(await proTrialReadiness(db(false), ready)).toBe('MISSING_WORK_PHOTO');
  });
});


it('las pruebas nuevas duran como máximo 7 días, incluso con la configuración anterior de 14', () => {
  expect(proTrialDays(new ConfigService())).toBe(7);
  expect(proTrialDays(new ConfigService({ PRO_TRIAL_DAYS: 14 }))).toBe(7);
});
