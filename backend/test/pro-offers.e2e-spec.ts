import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { redeemOffer } from '../src/plans/pro-offers';
import { describeE2E, Harness, startApp } from './app.harness';

const API = '/api/v1';
const PASSWORD = 'una-clave-bien-larga';
const CODE = 'PRO_FIRST_MONTH_20';

/**
 * Oferta de bienvenida de PRO (20 % el primer mes): la decide el backend
 * (umbral de uso, plan, historial, una sola vez), viaja en /pro/me y en el
 * rechazo del cupo, su embudo se deduplica y el frontend nunca manda montos.
 */
describeE2E('Oferta PRO_FIRST_MONTH_20 (e2e)', () => {
  let h: Harness;
  let config: ConfigService;
  const svc: Record<string, string> = {};
  const zone: Record<string, string> = {};

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function register(label: string) {
    const email = `${label}-${randomUUID().slice(0, 8)}@test.dev`;
    const res = await h.http
      .post(`${API}/auth/register`)
      .send({ firstName: label, lastName: 'Oferta', email, password: PASSWORD })
      .expect(202);
    const verify = await h.http
      .post(`${API}/auth/register/verify`)
      .send({ verificationSessionId: res.body.verificationSessionId, code: h.mail.lastCodeFor(email) })
      .expect(200);
    return { email, token: verify.body.accessToken as string };
  }

  async function pro(label: string) {
    const user = await register(label);
    const res = await h.http
      .post(`${API}/pro/profile`)
      .set(auth(user.token))
      .send({
        headline: `${label} en Tandil`,
        yearsExperience: 3,
        serviceIds: [svc.plomeria],
        zoneIds: [zone['villa-italia']],
      })
      .expect(201);
    return { ...user, proId: res.body.id as string };
  }
  type Pro = Awaited<ReturnType<typeof pro>>;

  const me = async (p: Pro) => (await h.http.get(`${API}/pro/me`).set(auth(p.token)).expect(200)).body;

  async function requests(client: { token: string }, p: Pro, n: number) {
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      const req = await h.http
        .post(`${API}/requests`)
        .set(auth(client.token))
        .send({
          serviceId: svc.plomeria,
          zoneId: zone['villa-italia'],
          title: 'Canilla que gotea',
          description: 'Gotea la canilla del baño desde ayer.',
          exactAddress: 'Pinto 1200',
          urgency: 'FLEXIBLE',
        })
        .expect(201);
      await h.http
        .post(`${API}/requests/${req.body.id}/invitations`)
        .set(auth(client.token))
        .send({ professionalIds: [p.proId] })
        .expect(200);
      ids.push(req.body.id as string);
    }
    return ids;
  }

  const sendQuote = (p: Pro, requestId: string) =>
    h.http
      .post(`${API}/pro/requests/${requestId}/quote`)
      .set(auth(p.token))
      .send({ description: 'Cambio de cuerito y ajuste', laborAmount: 15000 });

  const offerEvent = (p: Pro, body: object) =>
    h.http.post(`${API}/pro/plan/offer-events`).set(auth(p.token)).send(body);

  const setPlan = (p: Pro, tier: 'FREE' | 'PRO') =>
    h.dataSource.query(
      `UPDATE professional_profiles SET plan_tier = $2, plan_expires_at = NULL WHERE id = $1`,
      [p.proId, tier],
    );

  const redeem = (p: Pro, code = CODE) =>
    h.dataSource.transaction((m) => redeemOffer(m, p.proId, code, config));

  /** Profesional Free con `used` oportunidades respondidas (y solicitudes de sobra). */
  async function freeWith(label: string, used: number) {
    const p = await pro(label);
    const client = await register(`cliente-${label}`);
    const reqs = await requests(client, p, used + 1);
    for (let i = 0; i < used; i++) await sendQuote(p, reqs[i]).expect(201);
    return { p, next: reqs[used] };
  }

  beforeAll(async () => {
    h = await startApp();
    config = h.app.get(ConfigService);
    for (const s of (await h.http.get(`${API}/services`).expect(200)).body) svc[s.slug] = s.id;
    for (const z of (await h.http.get(`${API}/zones`).expect(200)).body) zone[z.slug] = z.id;
  }, 60_000);

  afterAll(async () => {
    await h?.app.close();
  });

  it('GET /plans publica la condición general (código, %, ciclos y precio calculado)', async () => {
    const body = (await h.http.get(`${API}/plans`).expect(200)).body;
    expect(body.pro.monthlyPriceArs).toBe(15000);
    expect(body.introOffer).toEqual({
      code: CODE,
      discountPercent: 20,
      cycles: 1,
      discountedPriceArs: 12000,
    });
  });

  describe('escalera de uso', () => {
    let p: Pro;
    let next: string;
    let spare: string[];

    beforeAll(async () => {
      ({ p, next } = await freeWith('escalera', 4));
      spare = await requests(await register('otra-vecina'), p, 2);
    });

    it('Free 4/5 → sin oferta', async () => {
      const body = await me(p);
      expect(body.quoteUsage).toMatchObject({ used: 4, remaining: 1 });
      expect(body.proIntroOffer).toEqual({ eligible: false, reason: 'USAGE_BELOW_THRESHOLD' });
    });

    it('Free 5/5 → elegible, con los montos del servidor', async () => {
      await sendQuote(p, next).expect(201);
      expect((await me(p)).proIntroOffer).toEqual({
        eligible: true,
        offerCode: CODE,
        discountPercent: 20,
        appliesToCycles: 1,
        basePriceArs: 15000,
        discountedPriceArs: 12000,
        reserved: false,
      });
    });

    it('Free 5/5 → elegible; el intento 6 responde FREE_QUOTE_LIMIT_REACHED con la oferta', async () => {
      expect((await me(p)).proIntroOffer.eligible).toBe(true);
      const res = await sendQuote(p, spare[0]).expect(403);
      expect(res.body.code).toBe('FREE_QUOTE_LIMIT_REACHED');
      expect(res.body.details).toMatchObject({
        used: 5,
        limit: 5,
        remaining: 0,
        offer: { eligible: true, offerCode: CODE, discountPercent: 20, appliesToCycles: 1 },
      });
    });
  });

  describe('embudo (mostrada / click)', () => {
    it('solo cuenta si hoy es elegible, una vez por superficie y día; REDEEMED no llega del frontend', async () => {
      const { p } = await freeWith('embudo', 5);
      const shown = { type: 'SHOWN', surface: 'PLAN_PAGE', offerCode: CODE };
      expect((await offerEvent(p, shown).expect(200)).body).toEqual({ recorded: true });
      expect((await offerEvent(p, shown).expect(200)).body).toEqual({ recorded: false });
      expect((await offerEvent(p, { ...shown, surface: 'LIMIT_MODAL' }).expect(200)).body.recorded).toBe(
        true,
      );
      expect((await offerEvent(p, { ...shown, type: 'CLICKED' }).expect(200)).body.recorded).toBe(true);
      expect(
        (await offerEvent(p, { ...shown, offerCode: 'PRO_FIRST_MONTH_90' }).expect(200)).body.recorded,
      ).toBe(false);
      await offerEvent(p, { ...shown, type: 'REDEEMED' }).expect(400);
      await offerEvent(p, { ...shown, surface: 'HOME' }).expect(400);
      await offerEvent(p, { ...shown, discountPercent: 90 }).expect(400);
      const rows = await h.dataSource.query(
        `SELECT type::text, surface::text FROM pro_offer_events WHERE professional_id = $1 ORDER BY id`,
        [p.proId],
      );
      expect(rows).toEqual([
        { type: 'SHOWN', surface: 'PLAN_PAGE' },
        { type: 'SHOWN', surface: 'LIMIT_MODAL' },
        { type: 'CLICKED', surface: 'PLAN_PAGE' },
      ]);

      const early = await pro('temprano');
      expect((await offerEvent(early, shown).expect(200)).body.recorded).toBe(false);
      await h.http.post(`${API}/pro/plan/offer-events`).send(shown).expect(401);
    });
  });

  describe('"Quiero PRO" con oferta', () => {
    it('reserva la oferta solo si es elegible; el descuento no se acepta desde el frontend', async () => {
      const { p } = await freeWith('reserva', 5);
      await h.http
        .post(`${API}/pro/plan/interest`)
        .set(auth(p.token))
        .send({ offerCode: CODE, discountPercent: 90 })
        .expect(400);
      await h.http.post(`${API}/pro/plan/interest`).set(auth(p.token)).send({ priceArs: 1 }).expect(400);
      const body = (
        await h.http.post(`${API}/pro/plan/interest`).set(auth(p.token)).send({ offerCode: CODE }).expect(200)
      ).body;
      expect(body.proInterestAt).toEqual(expect.any(String));
      expect(body.plan.tier).toBe('FREE');
      expect(body.proIntroOffer).toMatchObject({ eligible: true, reserved: true, discountedPriceArs: 12000 });

      // Reservada: cambiar la fecha de actividad no reinicia el cupo ni la oferta.
      await h.dataSource.query(
        `UPDATE quotes SET created_at = created_at - interval '40 days' WHERE professional_id = $1`,
        [p.proId],
      );
      await h.dataSource.query(
        `UPDATE quote_quota_usages SET consumed_at = consumed_at - interval '40 days' WHERE professional_id = $1`,
        [p.proId],
      );
      const later = await me(p);
      expect(later.quoteUsage.used).toBe(5);
      expect(later.proIntroOffer).toMatchObject({ eligible: true, reserved: true });
    });

    it('sin elegibilidad, pedir con un código registra el pedido pero no reserva nada', async () => {
      const p = await pro('sinumbral');
      const body = (
        await h.http.post(`${API}/pro/plan/interest`).set(auth(p.token)).send({ offerCode: CODE }).expect(200)
      ).body;
      expect(body.proInterestAt).toEqual(expect.any(String));
      expect(body.proIntroOffer).toEqual({ eligible: false, reason: 'USAGE_BELOW_THRESHOLD' });
      const [row] = await h.dataSource.query(
        `SELECT pro_interest_offer_code FROM professional_profiles WHERE id = $1`,
        [p.proId],
      );
      expect(row.pro_interest_offer_code).toBeNull();
      const fake = await pro('inventado');
      await h.http
        .post(`${API}/pro/plan/interest`)
        .set(auth(fake.token))
        .send({ offerCode: 'pro 100%' })
        .expect(400);
    });
  });

  describe('una sola vez', () => {
    it('redimida → deja de ser elegible; PRO → sin oferta; vuelve a Free → nunca más', async () => {
      const { p } = await freeWith('unavez', 5);
      const first = await redeem(p);
      expect(first).toMatchObject({
        ok: true,
        redemption: {
          offerCode: CODE,
          discountPercent: 20,
          cycles: 1,
          basePriceArs: 15000,
          discountedPriceArs: 12000,
        },
      });
      expect((await me(p)).proIntroOffer).toEqual({ eligible: false, reason: 'ALREADY_HAD_PRO' });
      expect(await redeem(p)).toEqual({ ok: false, reason: 'ALREADY_REDEEMED' });

      await setPlan(p, 'PRO');
      expect((await me(p)).proIntroOffer).toEqual({ eligible: false, reason: 'NOT_FREE' });
      await setPlan(p, 'FREE');
      expect((await me(p)).proIntroOffer.eligible).toBe(false);

      // Aunque se borrara el historial de PRO pago, la redención sigue bloqueando.
      await h.dataSource.query(`UPDATE professional_profiles SET first_paid_pro_at = NULL WHERE id = $1`, [
        p.proId,
      ]);
      expect((await me(p)).proIntroOffer).toEqual({ eligible: false, reason: 'ALREADY_REDEEMED' });
      const [{ n }] = await h.dataSource.query(
        `SELECT count(*)::int AS n FROM pro_offer_redemptions WHERE professional_id = $1`,
        [p.proId],
      );
      expect(n).toBe(1);
      const events = await h.dataSource.query(
        `SELECT type::text FROM pro_offer_events WHERE professional_id = $1`,
        [p.proId],
      );
      expect(events).toEqual([{ type: 'REDEEMED' }]);
    });

    it('dos redenciones simultáneas (dos pestañas) → una sola válida', async () => {
      const { p } = await freeWith('pestanas', 5);
      const results = await Promise.all([redeem(p), redeem(p)]);
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      const [{ n }] = await h.dataSource.query(
        `SELECT count(*)::int AS n FROM pro_offer_redemptions WHERE professional_id = $1`,
        [p.proId],
      );
      expect(n).toBe(1);
    });

    it('no elegible o código desconocido → no se redime', async () => {
      const p = await pro('antes');
      expect(await redeem(p)).toEqual({ ok: false, reason: 'USAGE_BELOW_THRESHOLD' });
      expect(await redeem(p, 'PRO_FIRST_MONTH_90')).toEqual({ ok: false, reason: 'UNKNOWN_OFFER' });
    });

    it('PRO vigente → no hay oferta de bienvenida', async () => {
      const p = await pro('yapro');
      await setPlan(p, 'PRO');
      expect((await me(p)).proIntroOffer).toEqual({ eligible: false, reason: 'NOT_FREE' });
      expect(await redeem(p)).toEqual({ ok: false, reason: 'NOT_FREE' });
    });
  });
});
