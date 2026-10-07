import { ConfigService } from '@nestjs/config';
import { incomingReferral } from './referrals';

const config = new ConfigService({ REFERRAL_REWARD_DAYS: 21 });
describe('Invitación propia del referido (solo lectura)', () => {
  it('cuenta normal devuelve null', async () => {
    const db = { query: jest.fn().mockResolvedValue([]) };
    expect(await incomingReferral(db, 'own-profile', config)).toBeNull();
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.query.mock.calls[0][1]).toEqual(['own-profile']);
  });
  it('registered (invitación anterior a la regla nueva) devuelve los días configurados, sin datos del referente', async () => {
    const db = {
      query: jest.fn().mockResolvedValue([{ status: 'REGISTERED', referrer_professional_id: 'referrer', reward_days: null }]),
    };
    const res = await incomingReferral(db, 'own-profile', config);
    expect(res).toEqual({ status: 'REGISTERED', rewardDays: 21 });
    expect(JSON.stringify(res)).not.toContain('referrer');
    expect(db.query).toHaveBeenCalledTimes(1);
  });
  it('rewarded conserva días realmente otorgados aunque cambie la configuración', async () => {
    const db = { query: jest.fn().mockResolvedValue([{ status: 'REWARDED', reward_days: 9 }]) };
    expect(await incomingReferral(db, 'own-profile', config)).toEqual({ status: 'REWARDED', rewardDays: 9 });
  });
  it('activated (recompensas apagadas) muestra los días configurados', async () => {
    const db = { query: jest.fn().mockResolvedValue([{ status: 'ACTIVATED', reward_days: null }]) };
    expect(await incomingReferral(db, 'own-profile', config)).toEqual({ status: 'ACTIVATED', rewardDays: 21 });
  });
  it('invalid no expone recompensa ni motivo interno', async () => {
    const db = {
      query: jest
        .fn()
        .mockResolvedValue([{ status: 'INVALID', invalid_reason: 'internal', referrer_professional_id: 'private' }]),
    };
    expect(await incomingReferral(db, 'own-profile', config)).toEqual({ status: 'INVALID', rewardDays: null });
  });
});
