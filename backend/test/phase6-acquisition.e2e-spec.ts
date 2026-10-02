import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { activateReferral, registerReferral } from '../src/acquisition/referrals';
import { describeE2E, Harness, startApp } from './app.harness';

const API = '/api/v1';
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
describeE2E('Fase 6: adquisición y referidos', () => {
  let h: Harness;
  let serviceId: string;
  let zoneId: string;
  async function user(name = 'Francisco', referralCode?: string) {
    const result = await h.http
      .post(`${API}/auth/register`)
      .send({
        firstName: name,
        lastName: 'Fernández',
        email: `${randomUUID()}@test.dev`,
        password: 'una-clave-bien-larga',
        ...(referralCode ? { referralCode } : {}),
      })
      .expect(201);
    const me = await h.http.get(`${API}/auth/me`).set(auth(result.body.accessToken)).expect(200);
    return { token: result.body.accessToken as string, userId: me.body.id as string };
  }
  async function pro(u: Awaited<ReturnType<typeof user>>) {
    const result = await h.http
      .post(`${API}/pro/profile`)
      .set(auth(u.token))
      .send({ headline: 'Plomero en Tandil', yearsExperience: 3, serviceIds: [serviceId], zoneIds: [zoneId] })
      .expect(201);
    return { ...u, id: result.body.id as string, slug: result.body.slug as string };
  }
  async function invite(token: string, proId: string, source = 'PUBLIC_PROFILE') {
    const created = await h.http
      .post(`${API}/requests`)
      .set(auth(token))
      .send({
        serviceId,
        zoneId,
        title: 'Reparar la canilla',
        description: 'La canilla de la cocina pierde agua.',
        acquisitionSource: source,
      })
      .expect(201);
    await h.http
      .post(`${API}/requests/${created.body.id}/invitations`)
      .set(auth(token))
      .send({ professionalIds: [proId], targeted: true, attributionSource: source })
      .expect(200);
    return created.body.id as string;
  }
  beforeAll(async () => {
    h = await startApp({ emailVerification: false });
    serviceId = (await h.http.get(`${API}/services`)).body.find(
      (s: { slug: string }) => s.slug === 'plomeria',
    ).id;
    zoneId = (await h.http.get(`${API}/zones`)).body[0].id;
  }, 60000);
  afterAll(async () => h?.app.close());

  it('la migración aplica, revierte y vuelve a aplicar sobre datos existentes', async () => {
    // Se revierte hasta Phase6 inclusive (las posteriores, como la Fase 7, dependen de `referrals`).
    while (
      (await h.dataSource.query(`SELECT 1 FROM typeorm_migrations WHERE name LIKE 'Phase6Acquisition%'`)).length
    ) {
      await h.dataSource.undoLastMigration({ transaction: 'each' });
    }
    expect(
      await h.dataSource.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name='professional_profiles' AND column_name='slug'`,
      ),
    ).toHaveLength(0);
    await h.dataSource.runMigrations({ transaction: 'each' });
    const [counts] = await h.dataSource.query(
      `SELECT count(*)::int AS total, count(DISTINCT slug)::int AS slugs FROM professional_profiles`,
    );
    expect(counts.total).toBe(counts.slugs);
  });

  it('slug único, URL-safe y estable; perfil público sin datos privados; pausado conserva URL', async () => {
    const p = await pro(await user());
    const p2 = await pro(await user());
    expect(p.slug).toMatch(/^francisco-fernandez(-\d+)?$/);
    expect(p2.slug).not.toBe(p.slug);
    await h.dataSource.query(`UPDATE users SET first_name='Otro nombre' WHERE id=$1`, [p.userId]);
    const detail = (await h.http.get(`${API}/professionals/public/${p.slug}`).expect(200)).body;
    expect(detail.id).toBe(p.id);
    expect(detail.slug).toBe(p.slug);
    expect(detail.acceptingRequests).toBe(true);
    for (const key of ['email', 'phone', 'exactAddress', 'referralCode', 'bonusProUntil', 'privateNotes'])
      expect(detail).not.toHaveProperty(key);
    await h.dataSource.query(`UPDATE professional_profiles SET status='PAUSED' WHERE id=$1`, [p.id]);
    expect(
      (await h.http.get(`${API}/professionals/public/${p.slug}`).expect(200)).body.acceptingRequests,
    ).toBe(false);
    await h.http.get(`${API}/professionals/public/${p.slug}/reviews?page=1`).expect(200);
    await h.http.get(`${API}/professionals/public/no-existe`).expect(404);
  });

  it.each(['PUBLIC_PROFILE', 'PROFILE_QR', 'PROFILE_SHARE'])(
    'TARGETED conserva %s en solicitud e invitación',
    async (source) => {
      const p = await pro(await user());
      const client = await user('Cliente');
      const id = await invite(client.token, p.id, source);
      const [r] = await h.dataSource.query(
        `SELECT sr.acquisition_source, i.attribution_source, i.targeted FROM service_requests sr JOIN request_invitations i ON i.request_id=sr.id WHERE sr.id=$1`,
        [id],
      );
      expect(r).toEqual({ acquisition_source: source, attribution_source: source, targeted: true });
      await h.dataSource.query(`UPDATE professional_profiles SET plan_tier='PRO' WHERE id=$1`, [p.id]);
      const counts = (await h.http.get(`${API}/pro/acquisition/month`).set(auth(p.token)).expect(200)).body;
      expect(
        counts[{ PUBLIC_PROFILE: 'publicProfile', PROFILE_QR: 'qr', PROFILE_SHARE: 'share' }[source]!],
      ).toBe(1);
    },
  );

  it('registro → activación → dos recompensas; repetición y concurrencia no duplican', async () => {
    const referrer = await pro(await user('Referente'));
    const code = (await h.http.get(`${API}/pro/acquisition/referrals`).set(auth(referrer.token)).expect(200))
      .body.code;
    const referredUser = await user('Referido', code);
    const referred = await pro(referredUser);
    expect((await h.http.get(`${API}/pro/acquisition/referrals`).set(auth(referrer.token))).body.incoming).toBeNull();
    expect((await h.http.get(`${API}/pro/acquisition/referrals`).set(auth(referred.token))).body.incoming).toEqual({
      status: 'REGISTERED', rewardDays: 15,
      steps: { accountCreated: true, profileCompleted: true, serviceConfigured: true,
        coverageConfigured: true, licenseValid: null, firstValidQuoteSent: false },
    });
    expect(
      (await h.http.get(`${API}/pro/acquisition/referrals`).set(auth(referrer.token))).body.items[0].status,
    ).toBe('REGISTERED');
    const client = await user('Cliente independiente');
    const requestId = await invite(client.token, referred.id);
    await h.http
      .post(`${API}/pro/requests/${requestId}/quote`)
      .set(auth(referred.token))
      .send({ description: 'Reparación de la canilla', laborAmount: 18000 })
      .expect(201);
    const config = h.app.get(ConfigService);
    await Promise.all(
      [1, 2].map(() => h.dataSource.transaction((m) => activateReferral(m, referred.id, config))),
    );
    const [r] = await h.dataSource.query(`SELECT * FROM referrals WHERE referred_user_id=$1`, [
      referredUser.userId,
    ]);
    expect(r.status).toBe('REWARDED');
    const rewards = await h.dataSource.query(`SELECT * FROM referral_rewards WHERE referral_id=$1`, [r.id]);
    expect(rewards).toHaveLength(2);
    expect(rewards.every((rw: { days: number }) => rw.days === 15)).toBe(true);
    expect((await h.http.get(`${API}/pro/acquisition/referrals`).set(auth(referred.token))).body.incoming)
      .toEqual({ status: 'REWARDED', rewardDays: 15, steps: null });
    const plan = (await h.http.get(`${API}/pro/me`).set(auth(referred.token))).body.plan;
    expect(plan.entitlementSource).toBe('BONUS_PRO');
    expect(plan.entitlements.canSendUnlimitedQuotes).toBe(true);
    expect(
      await h.dataSource.query(`SELECT * FROM billing_subscriptions WHERE professional_id IN ($1,$2)`, [
        referrer.id,
        referred.id,
      ]),
    ).toHaveLength(0);
  });

  it('permite activar con recompensas apagadas y otorgarlas después una sola vez', async () => {
    const referrer = await pro(await user('Referente pausado'));
    const code = (await h.http.get(`${API}/pro/acquisition/referrals`).set(auth(referrer.token))).body.code;
    const referred = await pro(await user('Referido pausado', code));
    const client = await user('Cliente real');
    const requestId = await invite(client.token, referred.id);
    const config = h.app.get(ConfigService);
    config.set('REFERRAL_REWARDS_ENABLED', false);
    try {
      await h.http
        .post(`${API}/pro/requests/${requestId}/quote`)
        .set(auth(referred.token))
        .send({ description: 'Reparar canilla', laborAmount: 18000 })
        .expect(201);
      const [r] = await h.dataSource.query(`SELECT * FROM referrals WHERE referred_user_id=$1`, [
        referred.userId,
      ]);
      expect(r.status).toBe('ACTIVATED');
      expect((await h.http.get(`${API}/pro/acquisition/referrals`).set(auth(referred.token))).body.incoming)
        .toEqual({ status: 'ACTIVATED', rewardDays: 15, steps: null });
      expect(
        await h.dataSource.query(`SELECT * FROM referral_rewards WHERE referral_id=$1`, [r.id]),
      ).toHaveLength(0);
      config.set('REFERRAL_REWARDS_ENABLED', true);
      await h.dataSource.transaction((m) => activateReferral(m, referred.id, config));
      await h.dataSource.transaction((m) => activateReferral(m, referred.id, config));
      expect(
        await h.dataSource.query(`SELECT * FROM referral_rewards WHERE referral_id=$1`, [r.id]),
      ).toHaveLength(2);
    } finally {
      config.set('REFERRAL_REWARDS_ENABLED', true);
    }
  });

  it('bloquea código inexistente y self-referral; un referido no tiene dos referentes', async () => {
    await h.http
      .post(`${API}/auth/register`)
      .send({
        firstName: 'Nuevo',
        lastName: 'Invitado',
        email: `${randomUUID()}@test.dev`,
        password: 'una-clave-bien-larga',
        referralCode: 'PRO-' + 'A'.repeat(32),
      })
      .expect(422);
    const p = await pro(await user('Antifraude'));
    const code = (await h.http.get(`${API}/pro/acquisition/referrals`).set(auth(p.token))).body.code;
    await expect(h.dataSource.transaction((m) => registerReferral(m, p.userId, code))).rejects.toThrow();
    const p2 = await pro(await user('Otro referente'));
    const code2 = (await h.http.get(`${API}/pro/acquisition/referrals`).set(auth(p2.token))).body.code;
    const u = await user('Un invitado', code);
    await h.dataSource.transaction((m) => registerReferral(m, u.userId, code2));
    const rows = await h.dataSource.query(
      `SELECT referrer_professional_id FROM referrals WHERE referred_user_id=$1`,
      [u.userId],
    );
    expect(rows).toEqual([{ referrer_professional_id: p.id }]);
    await h.http
      .post(`${API}/pro/acquisition/referrals`)
      .set(auth(u.token))
      .send({ code: code2 })
      .expect(404);
  });
});

describeE2E('Fase 6: referido con registro verificado', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await startApp({ emailVerification: true });
    // ConfigModule is loaded once in this file, shared with the non-verifying suite above.
    h.app.get(ConfigService).set('EMAIL_VERIFICATION_ENABLED', true);
  }, 60000);
  afterAll(async () => h?.app.close());
  it('conserva la invitación pendiente y la registra al verificar el email', async () => {
    const [referrer] = await h.dataSource.query(
      `SELECT id, referral_code FROM professional_profiles LIMIT 1`,
    );
    const email = `${randomUUID()}@test.dev`;
    const pending = await h.http
      .post(`${API}/auth/register`)
      .send({
        firstName: 'Invitado',
        lastName: 'Verificado',
        email,
        password: 'una-clave-bien-larga',
        referralCode: referrer.referral_code,
      })
      .expect(202);
    expect(
      await h.dataSource.query(
        `SELECT * FROM referrals r JOIN users u ON u.id=r.referred_user_id WHERE u.email=$1`,
        [email],
      ),
    ).toHaveLength(0);
    const verified = await h.http
      .post(`${API}/auth/register/verify`)
      .send({ verificationSessionId: pending.body.verificationSessionId, code: h.mail.lastCodeFor(email) })
      .expect(200);
    expect(verified.body.accessToken).toBeTruthy();
    const rows = await h.dataSource.query(
      `SELECT r.referrer_professional_id, r.status FROM referrals r JOIN users u ON u.id=r.referred_user_id WHERE u.email=$1`,
      [email],
    );
    expect(rows).toEqual([{ referrer_professional_id: referrer.id, status: 'REGISTERED' }]);
  });
});
