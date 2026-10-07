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

  const referrals = async (token: string) =>
    (await h.http.get(`${API}/pro/acquisition/referrals`).set(auth(token)).expect(200)).body;

  it('registro → alta del perfil → dos recompensas al instante; repetición y concurrencia no duplican', async () => {
    const referrer = await pro(await user('Referente'));
    const code = (await referrals(referrer.token)).code;
    const referredUser = await user('Referido', code);
    expect((await referrals(referrer.token)).items[0].status).toBe('REGISTERED');
    // Crear el perfil profesional es lo único que hace falta: sin presupuestos ni más pasos.
    const referred = await pro(referredUser);
    expect((await referrals(referrer.token)).incoming).toBeNull();
    expect((await referrals(referred.token)).incoming).toEqual({ status: 'REWARDED', rewardDays: 15 });
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
    for (const who of [referred, referrer]) {
      const plan = (await h.http.get(`${API}/pro/me`).set(auth(who.token))).body.plan;
      expect(plan.entitlementSource).toBe('BONUS_PRO');
      expect(plan.entitlements.canSendUnlimitedQuotes).toBe(true);
    }
    expect(
      await h.dataSource.query(`SELECT * FROM billing_subscriptions WHERE professional_id IN ($1,$2)`, [
        referrer.id,
        referred.id,
      ]),
    ).toHaveLength(0);
  });

  it('festejo: una vez para cada uno, con el nombre de pila del amigo; cerrarlo es propio e idempotente', async () => {
    const referrer = await pro(await user('Juan'));
    const referred = await pro(await user('Pepe', (await referrals(referrer.token)).code));
    const me = async (token: string) => (await h.http.get(`${API}/pro/me`).set(auth(token)).expect(200)).body;

    const juan = (await me(referrer.token)).referralCelebration;
    expect(juan).toMatchObject({ role: 'REFERRER', friendName: 'Pepe', days: 15, rewardsLeft: 2 });
    expect(JSON.stringify(juan)).not.toContain('Fernández');
    const pepe = (await me(referred.token)).referralCelebration;
    expect(pepe).toMatchObject({ role: 'REFERRED', friendName: 'Juan', days: 15, rewardsLeft: null });

    // El premio de otro no se puede cerrar.
    await h.http.post(`${API}/pro/acquisition/referrals/celebrations/${juan.rewardId}/ack`).set(auth(referred.token)).expect(200);
    expect((await me(referrer.token)).referralCelebration).not.toBeNull();
    for (let i = 0; i < 2; i++) {
      await h.http.post(`${API}/pro/acquisition/referrals/celebrations/${juan.rewardId}/ack`).set(auth(referrer.token)).expect(200);
    }
    expect((await me(referrer.token)).referralCelebration).toBeNull();
    expect((await me(referred.token)).referralCelebration).not.toBeNull();
  });

  it('tope: quien invita suma días por 3 amigos; del 4º en adelante solo el amigo', async () => {
    const referrer = await pro(await user('Tope'));
    const code = (await referrals(referrer.token)).code;
    const bonusUntil = async () =>
      (await h.dataSource.query(`SELECT bonus_pro_until FROM professional_profiles WHERE id=$1`, [referrer.id]))[0]
        .bonus_pro_until as Date;
    await Promise.all([1, 2, 3, 4].map(async (i) => pro(await user(`Amigo ${i}`, code))));
    const counts = (await h.dataSource.query(
      `SELECT count(*) FILTER (WHERE rw.professional_id = r.referrer_professional_id)::int AS referrer,
              count(*) FILTER (WHERE rw.professional_id <> r.referrer_professional_id)::int AS friends
         FROM referral_rewards rw JOIN referrals r ON r.id = rw.referral_id WHERE r.referrer_professional_id = $1`,
      [referrer.id],
    ))[0];
    expect(counts).toEqual({ referrer: 3, friends: 4 });
    const until = await bonusUntil();
    const days = (until.getTime() - Date.now()) / 86400000;
    expect(days).toBeGreaterThan(44);
    expect(days).toBeLessThanOrEqual(45);
    const summary = await referrals(referrer.token);
    expect(summary).toMatchObject({ maxRewards: 3, rewardsLeft: 0 });
    expect(summary.counts).toMatchObject({ registered: 4, rewarded: 4 });

    const fifth = await pro(await user('Amigo 5', code));
    expect((await bonusUntil()).getTime()).toBe(until.getTime());
    expect((await referrals(fifth.token)).incoming).toEqual({ status: 'REWARDED', rewardDays: 15 });
    // Sin días para quien invita: el aviso llega igual, sin días.
    const feed = (await h.http.get(`${API}/me/notifications`).query({ audience: 'PROFESSIONAL' }).set(auth(referrer.token)).expect(200)).body.items;
    const activated = feed.filter((n: { type: string }) => n.type === 'PRO_REFERRAL_ACTIVATED');
    expect(activated).toHaveLength(5);
    expect(activated.filter((n: { rewardDays: number | null }) => n.rewardDays === 15)).toHaveLength(3);
  });

  it('cuenta creada como cliente con el enlace: el premio sale cuando más tarde arma su perfil', async () => {
    const referrer = await pro(await user('Referente cliente'));
    const later = await user('Primero cliente', (await referrals(referrer.token)).code);
    expect(
      await h.dataSource.query(`SELECT 1 FROM referral_rewards rw JOIN referrals r ON r.id = rw.referral_id WHERE r.referred_user_id=$1`, [
        later.userId,
      ]),
    ).toHaveLength(0);
    const p = await pro(later);
    expect((await referrals(p.token)).incoming).toEqual({ status: 'REWARDED', rewardDays: 15 });
  });

  it('invitación anterior a la regla (REGISTERED con perfil): "Activar" la premia una vez', async () => {
    const referrer = await pro(await user('Referente viejo'));
    // Simula una invitación vieja: registrada, con el perfil ya creado y sin activar.
    const u = await user('Referido viejo');
    const referred = await pro(u);
    await h.dataSource.query(
      `INSERT INTO referrals(referrer_professional_id, referred_user_id, code)
       SELECT $1, $2, referral_code FROM professional_profiles WHERE id = $1`,
      [referrer.id, u.userId],
    );
    expect((await referrals(referred.token)).incoming).toEqual({ status: 'REGISTERED', rewardDays: 15 });
    const res = await h.http.post(`${API}/pro/acquisition/referrals/claim`).set(auth(referred.token)).expect(200);
    expect(res.body.incoming).toEqual({ status: 'REWARDED', rewardDays: 15 });
    await h.http.post(`${API}/pro/acquisition/referrals/claim`).set(auth(referred.token)).expect(200);
    expect(
      await h.dataSource.query(`SELECT 1 FROM referral_rewards rw JOIN referrals r ON r.id = rw.referral_id WHERE r.referred_user_id=$1`, [
        referred.userId,
      ]),
    ).toHaveLength(2);
    // Sin invitación, "Activar" no hace nada.
    const solo = await pro(await user('Sin invitación'));
    expect((await h.http.post(`${API}/pro/acquisition/referrals/claim`).set(auth(solo.token)).expect(200)).body.incoming).toBeNull();
  });

  it('permite activar con recompensas apagadas y otorgarlas después una sola vez', async () => {
    const referrer = await pro(await user('Referente pausado'));
    const code = (await referrals(referrer.token)).code;
    const config = h.app.get(ConfigService);
    config.set('REFERRAL_REWARDS_ENABLED', false);
    try {
      const referred = await pro(await user('Referido pausado', code));
      const [r] = await h.dataSource.query(`SELECT * FROM referrals WHERE referred_user_id=$1`, [
        referred.userId,
      ]);
      expect(r.status).toBe('ACTIVATED');
      expect((await referrals(referred.token)).incoming).toEqual({ status: 'ACTIVATED', rewardDays: 15 });
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
