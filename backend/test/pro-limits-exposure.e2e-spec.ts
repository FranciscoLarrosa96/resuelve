import { randomUUID } from 'crypto';
import { businessMonthRange, currentBusinessMonth, previousBusinessMonth } from '../src/common/time';
import { describeE2E, Harness, startApp } from './app.harness';

const API = '/api/v1';
const PASSWORD = 'una-clave-bien-larga';
const LIMIT = 10;

/**
 * Cupo FREE de presupuestos (solicitudes distintas por mes de Argentina,
 * validado en el backend y a prueba de concurrencia), PRO sin límite, y
 * exposición real (apariciones y visitas al perfil) con su embudo en "Tu mes".
 */
describeE2E('Límite FREE, PRO ilimitado y exposición (e2e)', () => {
  let h: Harness;
  const svc: Record<string, string> = {};
  const zone: Record<string, string> = {};

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function register(label: string) {
    const email = `${label}-${randomUUID().slice(0, 8)}@test.dev`;
    const res = await h.http
      .post(`${API}/auth/register`)
      .send({ firstName: label, lastName: 'Cupo', email, password: PASSWORD })
      .expect(201);
    return { email, token: res.body.accessToken as string };
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

  const setPlan = (p: Pro, tier: 'FREE' | 'PRO') =>
    h.dataSource.query(
      `UPDATE professional_profiles SET plan_tier = $2, plan_expires_at = NULL WHERE id = $1`,
      [p.proId, tier],
    );

  async function request(client: { token: string }, p: Pro) {
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
    return req.body.id as string;
  }

  const requests = async (client: { token: string }, p: Pro, n: number) => {
    const ids: string[] = [];
    for (let i = 0; i < n; i++) ids.push(await request(client, p));
    return ids;
  };

  const sendQuote = (p: Pro, requestId: string) =>
    h.http
      .post(`${API}/pro/requests/${requestId}/quote`)
      .set(auth(p.token))
      .send({ description: 'Cambio de cuerito y ajuste', laborAmount: 15000 });

  const usage = async (p: Pro) =>
    (await h.http.get(`${API}/pro/me`).set(auth(p.token)).expect(200)).body.quoteUsage;

  const month = async (p: Pro) =>
    (await h.http.get(`${API}/pro/analytics/month`).set(auth(p.token)).expect(200)).body;

  const events = (body: object, token?: string) => {
    const req = h.http.post(`${API}/analytics/events`);
    if (token) req.set(auth(token));
    return req.send(body);
  };

  beforeAll(async () => {
    h = await startApp();
    for (const s of (await h.http.get(`${API}/services`).expect(200)).body) svc[s.slug] = s.id;
    for (const z of (await h.http.get(`${API}/zones`).expect(200)).body) zone[z.slug] = z.id;
  }, 60_000);

  afterAll(async () => {
    await h?.app.close();
  });

  // ---- Cupo FREE -------------------------------------------------------------
  describe('cupo FREE de presupuestos', () => {
    let free: Pro;
    let client: { token: string };
    let reqs: string[];
    let firstQuoteId: string;

    beforeAll(async () => {
      free = await pro('libre');
      client = await register('vecina');
      reqs = await requests(client, free, LIMIT + 2);
    });

    it('recibir solicitudes nunca tiene tope y el uso arranca en 0 de 10', async () => {
      const list = (await h.http.get(`${API}/pro/requests`).set(auth(free.token)).expect(200)).body;
      expect(list.total).toBe(LIMIT + 2);
      expect(await usage(free)).toEqual({
        period: currentBusinessMonth(),
        used: 0,
        limit: LIMIT,
        remaining: LIMIT,
      });
    });

    it('1..10 solicitudes distintas: permitido; el uso se actualiza', async () => {
      for (let i = 0; i < LIMIT; i++) {
        const res = await sendQuote(free, reqs[i]).expect(201);
        if (i === 0) firstQuoteId = res.body.id;
        if (i === 6) expect(await usage(free)).toMatchObject({ used: 7, remaining: 3 });
      }
      expect(await usage(free)).toMatchObject({ used: 10, limit: 10, remaining: 0 });
    });

    it('la 11.ª responde FREE_QUOTE_LIMIT_REACHED y no crea nada', async () => {
      const res = await sendQuote(free, reqs[LIMIT]).expect(403);
      expect(res.body.code).toBe('FREE_QUOTE_LIMIT_REACHED');
      expect(res.body.details).toMatchObject({ used: 10, limit: 10, remaining: 0 });
      const [{ n }] = await h.dataSource.query(
        `SELECT count(*)::int AS n FROM quotes WHERE request_id = $1`,
        [reqs[LIMIT]],
      );
      expect(n).toBe(0);
    });

    it('con el cupo lleno sigue viendo solicitudes y editando presupuestos existentes (no suma)', async () => {
      await h.http
        .get(`${API}/pro/requests/${reqs[LIMIT + 1]}`)
        .set(auth(free.token))
        .expect(200);
      await h.http
        .patch(`${API}/pro/quotes/${firstQuoteId}`)
        .set(auth(free.token))
        .send({ description: 'Cambio de cuerito, ajuste y sellador', laborAmount: 16000 })
        .expect(200);
      expect(await usage(free)).toMatchObject({ used: 10 });
    });

    it('retirar y volver a presupuestar la MISMA solicitud no consume ni libera cupo', async () => {
      await h.http.post(`${API}/pro/quotes/${firstQuoteId}/withdraw`).set(auth(free.token)).expect(200);
      expect(await usage(free)).toMatchObject({ used: 10 });
      await sendQuote(free, reqs[LIMIT]).expect(403);
      await sendQuote(free, reqs[0]).expect(201);
      expect(await usage(free)).toMatchObject({ used: 10 });
    });

    it('nuevo mes: lo del mes anterior no cuenta (sin cron, por query)', async () => {
      const prevStart = businessMonthRange(previousBusinessMonth(currentBusinessMonth())).start;
      await h.dataSource.query(`UPDATE quotes SET created_at = $2 WHERE professional_id = $1`, [
        free.proId,
        new Date(prevStart.getTime() + 3600_000),
      ]);
      expect(await usage(free)).toMatchObject({ used: 0, remaining: 10 });
      await sendQuote(free, reqs[LIMIT]).expect(201);
      expect(await usage(free)).toMatchObject({ used: 1 });
    });

    it('PRO: más de 10 permitido y sin límite en el uso', async () => {
      const p = await pro('ilimitado');
      await setPlan(p, 'PRO');
      const ids = await requests(await register('cliente-pro'), p, LIMIT + 2);
      for (const id of ids) await sendQuote(p, id).expect(201);
      expect(await usage(p)).toMatchObject({ used: LIMIT + 2, limit: null, remaining: null });

      // Downgrade: nada se borra, las nuevas quedan bloqueadas.
      const extra = await request(await register('cliente-extra'), p);
      await setPlan(p, 'FREE');
      expect(await usage(p)).toMatchObject({ used: LIMIT + 2, limit: LIMIT, remaining: 0 });
      expect((await sendQuote(p, extra).expect(403)).body.code).toBe('FREE_QUOTE_LIMIT_REACHED');
      const [{ n }] = await h.dataSource.query(
        `SELECT count(*)::int AS n FROM quotes WHERE professional_id = $1 AND status = 'PENDING'`,
        [p.proId],
      );
      expect(n).toBe(LIMIT + 2);
    });

    it('concurrencia: con 9/10 y dos envíos simultáneos, solo uno pasa', async () => {
      const p = await pro('carrera');
      const ids = await requests(await register('cliente-carrera'), p, LIMIT + 1);
      for (const id of ids.slice(0, LIMIT - 1)) await sendQuote(p, id).expect(201);
      const results = await Promise.all([sendQuote(p, ids[LIMIT - 1]), sendQuote(p, ids[LIMIT])]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 403]);
      expect(await usage(p)).toMatchObject({ used: LIMIT, remaining: 0 });
    });
  });

  // ---- Exposición ------------------------------------------------------------
  describe('exposición: apariciones y visitas al perfil', () => {
    let target: Pro;
    const session = () => `ses_${randomUUID().replace(/-/g, '')}`;
    const impression = (p: Pro, extra: object = {}) => ({
      type: 'SEARCH_IMPRESSION',
      professionalId: p.proId,
      serviceId: svc.plomeria,
      zoneId: zone['villa-italia'],
      page: 1,
      ...extra,
    });
    const view = (p: Pro) => ({ type: 'PROFILE_VIEW', professionalId: p.proId });

    beforeAll(async () => {
      target = await pro('expuesto');
    });

    it('dedupe: la misma aparición (rerender, reintento) cuenta una vez por sesión', async () => {
      const s = session();
      const first = await events({ sessionKey: s, events: [impression(target), impression(target)] }).expect(
        200,
      );
      expect(first.body).toEqual({ accepted: 1 });
      const again = await events({ sessionKey: s, events: [impression(target)] }).expect(200);
      expect(again.body).toEqual({ accepted: 0 });
    });

    it('otro contexto de búsqueda, otra página u otra sesión = otra aparición', async () => {
      const s = session();
      const body = await events({
        sessionKey: s,
        events: [
          impression(target),
          impression(target, { zoneId: zone.centro }),
          impression(target, { page: 2 }),
          impression(target, { isUrgent: true, isFeaturedPlacement: true }),
        ],
      }).expect(200);
      expect(body.body.accepted).toBe(4);
      expect((await events({ sessionKey: session(), events: [impression(target)] })).body.accepted).toBe(1);
    });

    it('visita al perfil: una por sesión en la ventana; la propia no cuenta', async () => {
      const s = session();
      expect((await events({ sessionKey: s, events: [view(target)] })).body.accepted).toBe(1);
      expect((await events({ sessionKey: s, events: [view(target)] })).body.accepted).toBe(0);
      expect(
        (await events({ sessionKey: session(), events: [view(target)] }, target.token)).body.accepted,
      ).toBe(0);
      expect(
        (await events({ sessionKey: session(), events: [impression(target)] }, target.token)).body.accepted,
      ).toBe(0);
    });

    it('valida la tanda y no guarda datos personales', async () => {
      await events({ sessionKey: 'corta', events: [view(target)] }).expect(400);
      await events({ sessionKey: session(), events: [] }).expect(400);
      await events({
        sessionKey: session(),
        events: Array.from({ length: 51 }, () => view(target)),
      }).expect(400);
      await events({ sessionKey: session(), events: [{ ...view(target), address: 'Pinto 1200' }] }).expect(
        400,
      );
      // Profesional inexistente: se descarta sin error.
      expect(
        (
          await events({
            sessionKey: session(),
            events: [{ type: 'PROFILE_VIEW', professionalId: randomUUID() }],
          })
        ).body.accepted,
      ).toBe(0);
      const cols = await h.dataSource.query<{ column_name: string }[]>(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'exposure_events'`,
      );
      const names = cols.map((c) => c.column_name);
      for (const forbidden of ['user_id', 'ip', 'address', 'email']) expect(names).not.toContain(forbidden);
    });

    it('Tu mes: FREE no recibe exposición; PRO ve apariciones, visitas, embudo y tasas reales', async () => {
      const freeView = await month(target);
      expect(freeView.exposure).toBeNull();

      await setPlan(target, 'PRO');
      const body = await month(target);
      // 1 + 4 + 1 apariciones; 1 visita (la propia y la repetida no cuentan).
      expect(body.exposure).toMatchObject({
        impressions: 6,
        featuredImpressions: 1,
        profileViews: 1,
        previous: null,
      });
      expect(body.exposure.rates).toEqual({ viewsPerImpression: 16.7, requestsPerView: 0, acceptance: null });
    });

    it('embudo real: aparición → visita → solicitud → presupuesto → aceptado', async () => {
      const p = await pro('embudo');
      await setPlan(p, 'PRO');
      const s = session();
      await events({ sessionKey: s, events: [impression(p)] }).expect(200);
      await events({ sessionKey: s, events: [view(p)] }).expect(200);
      const client = await register('cliente-embudo');
      const reqId = await request(client, p);
      const quoteId = (await sendQuote(p, reqId).expect(201)).body.id;
      await h.http.post(`${API}/quotes/${quoteId}/accept`).set(auth(client.token)).expect(200);

      const body = await month(p);
      expect(body.exposure).toMatchObject({ impressions: 1, profileViews: 1 });
      expect(body.basic).toMatchObject({ requestsReceived: 1, quotesSent: 1, quotesAccepted: 1 });
      expect(body.exposure.rates).toEqual({ viewsPerImpression: 100, requestsPerView: 100, acceptance: 100 });
    });

    it('límites de mes en hora de Argentina y comparación con el mes anterior', async () => {
      const p = await pro('mensual');
      await setPlan(p, 'PRO');
      await events({ sessionKey: session(), events: [impression(p), view(p)] }).expect(200);
      await events({ sessionKey: session(), events: [impression(p)] }).expect(200);
      const { start } = businessMonthRange(currentBusinessMonth());
      // 23:59 del último día del mes anterior en Tandil: cuenta en ESE mes.
      await h.dataSource.query(
        `UPDATE exposure_events SET occurred_at = $2
          WHERE id = (SELECT min(id) FROM exposure_events WHERE professional_id = $1 AND type = 'SEARCH_IMPRESSION')`,
        [p.proId, new Date(start.getTime() - 60_000)],
      );
      const body = await month(p);
      expect(body.exposure).toMatchObject({
        impressions: 1,
        profileViews: 1,
        previous: { impressions: 1, profileViews: 0 },
      });
    });
  });
});
