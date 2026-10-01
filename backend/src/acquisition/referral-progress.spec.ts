import { ConfigService } from '@nestjs/config';
import { incomingReferral } from './referrals';

const config = new ConfigService({ REFERRAL_REWARD_DAYS: 21 });
describe('Progreso propio del referral (solo lectura)', () => {
  it('cuenta normal devuelve null y no consulta requisitos', async () => {
    const db = { query: jest.fn().mockResolvedValue([]) };
    expect(await incomingReferral(db, 'own-profile', config)).toBeNull();
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.query.mock.calls[0][1]).toEqual(['own-profile']);
  });
  it('registered devuelve requisitos backend y días configurados sin datos del referente', async () => {
    const steps = {
      accountCreated: true,
      profileCompleted: false,
      serviceConfigured: true,
      coverageConfigured: false,
      licenseValid: null,
      firstValidQuoteSent: false,
    };
    const db = {
      query: jest
        .fn()
        .mockResolvedValueOnce([
          { status: 'REGISTERED', referrer_professional_id: 'referrer', reward_days: null },
        ])
        .mockResolvedValueOnce([steps]),
    };
    expect(await incomingReferral(db, 'own-profile', config)).toEqual({
      status: 'REGISTERED',
      rewardDays: 21,
      steps,
    });
    expect(db.query.mock.calls[1][1]).toEqual(['own-profile', 'referrer']);
    const sql = db.query.mock.calls[1][0];
    expect(sql).toContain('sr.client_id <> p.user_id AND sr.client_id <> ref.user_id');
    expect(sql).toContain("v.status = 'VERIFIED'");
    expect(sql).toContain('v.expires_at > now()');
  });
  it('rewarded conserva días realmente otorgados aunque cambie la configuración', async () => {
    const db = { query: jest.fn().mockResolvedValue([{ status: 'REWARDED', reward_days: 9 }]) };
    expect(await incomingReferral(db, 'own-profile', config)).toEqual({
      status: 'REWARDED',
      rewardDays: 9,
      steps: null,
    });
    expect(db.query).toHaveBeenCalledTimes(1);
  });
  it('activated no vuelve a evaluar un perfil que pudo cambiar después', async () => {
    const db = { query: jest.fn().mockResolvedValue([{ status: 'ACTIVATED', reward_days: null }]) };
    expect(await incomingReferral(db, 'own-profile', config)).toEqual({
      status: 'ACTIVATED',
      rewardDays: 21,
      steps: null,
    });
    expect(db.query).toHaveBeenCalledTimes(1);
  });
  it('invalid no expone recompensa ni motivo interno', async () => {
    const db = {
      query: jest
        .fn()
        .mockResolvedValue([
          { status: 'INVALID', invalid_reason: 'internal', referrer_professional_id: 'private' },
        ]),
    };
    expect(await incomingReferral(db, 'own-profile', config)).toEqual({
      status: 'INVALID',
      rewardDays: null,
      steps: null,
    });
    expect(db.query).toHaveBeenCalledTimes(1);
  });
});
