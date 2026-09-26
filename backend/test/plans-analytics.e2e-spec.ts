import { randomUUID } from 'crypto';
import { businessMonthRange, currentBusinessMonth, previousBusinessMonth } from '../src/common/time';
import { describeE2E, Harness, startApp } from './app.harness';

const API = '/api/v1';
const PASSWORD = 'una-clave-bien-larga';
const DAY = 24 * 3600 * 1000;

/**
 * "Tu mes" real (GET /pro/analytics/month), planes con entitlements
 * (FREE / PRO / vencimiento, sin mutación por la API) y espacios
 * "Destacado" en la búsqueda (PRO que cumple TODAS las reglas normales).
 */
describeE2E('Tu mes, planes y destacados (e2e)', () => {
  let h: Harness;
  const svc: Record<string, string> = {};
  const zone: Record<string, string> = {};

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function register(label: string, lastName = 'Mensual') {
    const email = `${label}-${randomUUID().slice(0, 8)}@test.dev`;
    const res = await h.http
      .post(`${API}/auth/register`)
      .send({ firstName: label, lastName, email, password: PASSWORD })
      .expect(201);
    return { email, token: res.body.accessToken as string };
  }

  async function pro(
    label: string,
    opts: { services?: string[]; zones?: string[]; available?: boolean } = {},
  ) {
    const user = await register(label, 'Profesional');
    const res = await h.http
      .post(`${API}/pro/profile`)
      .set(auth(user.token))
      .send({
        headline: `${label} en Tandil`,
        yearsExperience: 4,
        serviceIds: (opts.services ?? ['plomeria']).map((s) => svc[s]),
        zoneIds: (opts.zones ?? ['villa-italia']).map((z) => zone[z]),
      })
      .expect(201);
    if (opts.available)
      await h.http
        .patch(`${API}/pro/availability`)
        .set(auth(user.token))
        .send({ availableToday: true })
        .expect(200);
    return { ...user, proId: res.body.id as string };
  }
  type Pro = Awaited<ReturnType<typeof pro>>;

  const setPlan = (p: Pro, tier: 'FREE' | 'PRO', expiresAt: Date | null = null) =>
    h.dataSource.query(
      `UPDATE professional_profiles SET plan_tier = $2, plan_expires_at = $3 WHERE id = $1`,
      [p.proId, tier, expiresAt],
    );

  async function request(client: { token: string }, pros: Pro[], zoneSlug = 'villa-italia') {
    const req = await h.http
      .post(`${API}/requests`)
      .set(auth(client.token))
      .send({
        serviceId: svc.plomeria,
        zoneId: zone[zoneSlug],
        title: 'Pérdida bajo mesada',
        description: 'Gotea la pileta de la cocina desde ayer.',
        exactAddress: 'Quintana 860',
        urgency: 'FLEXIBLE',
      })
      .expect(201);
    await h.http
      .post(`${API}/requests/${req.body.id}/invitations`)
      .set(auth(client.token))
      .send({ professionalIds: pros.map((p) => p.proId) })
      .expect(200);
    return req.body.id as string;
  }

  const quote = async (p: Pro, requestId: string, laborAmount = 20000) =>
    (
      await h.http
        .post(`${API}/pro/requests/${requestId}/quote`)
        .set(auth(p.token))
        .send({ description: 'Cambio de sifón y flexibles', laborAmount })
        .expect(201)
    ).body.id as string;

  /** Aceptado → cita confirmada → realizado → reseña (flujo real completo). */
  async function fullJob(p: Pro, client: { token: string }, requestId: string, quoteId: string) {
    await h.http.post(`${API}/quotes/${quoteId}/accept`).set(auth(client.token)).expect(200);
    const appt = await h.http
      .post(`${API}/pro/requests/${requestId}/appointments`)
      .set(auth(p.token))
      .send({ startsAt: new Date(Date.now() + 2 * DAY).toISOString(), durationMinutes: 60 })
      .expect(200);
    const id = appt.body.appointment.id as string;
    await h.http.post(`${API}/appointments/${id}/confirm`).set(auth(client.token)).expect(200);
    // El trabajo ya ocurrió hoy (dentro del mes en curso).
    await h.dataSource.query(
      `UPDATE appointments SET scheduled_start = now() - interval '2 hours', scheduled_end = now() - interval '1 hour' WHERE id = $1`,
      [id],
    );
    await h.http.post(`${API}/requests/${requestId}/complete`).set(auth(p.token)).expect(200);
    await h.http
      .post(`${API}/requests/${requestId}/review`)
      .set(auth(client.token))
      .send({ rating: 5, comment: 'Llegó puntual y dejó todo limpio.' })
      .expect(201);
  }

  const month = (p: { token: string }, query: { year?: number; month?: number } = {}) =>
    h.http.get(`${API}/pro/analytics/month`).set(auth(p.token)).query(query);

  const search = async (query: Record<string, string | number>) =>
    (await h.http.get(`${API}/professionals`).query(query).expect(200)).body as {
      items: { id: string; pro: boolean; isFeaturedPlacement: boolean }[];
      total: number;
    };

  beforeAll(async () => {
    h = await startApp();
    for (const s of (await h.http.get(`${API}/services`).expect(200)).body) svc[s.slug] = s.id;
    for (const z of (await h.http.get(`${API}/zones`).expect(200)).body) zone[z.slug] = z.id;
  }, 60_000);

  afterAll(async () => {
    await h?.app.close();
  });

  // ---- Tu mes ----------------------------------------------------------------
  describe('Tu mes', () => {
    it('mes vacío: todo en cero, sin rating inventado ni análisis avanzado (FREE)', async () => {
      const p = await pro('nuevo');
      const body = (await month(p).expect(200)).body;
      expect(body.period).toMatchObject({ ...currentBusinessMonth(), isCurrent: true });
      expect(body.plan).toBe('FREE');
      expect(body.basic).toEqual({
        requestsReceived: 0,
        quotesSent: 0,
        quotesAccepted: 0,
        scheduledJobs: 0,
        completedJobs: 0,
        reviewsReceived: 0,
        currentRating: null,
        reviewCount: 0,
      });
      expect(body.recentReviews).toEqual([]);
      expect(body.advanced).toBeNull();
    });

    it('solo profesionales: sin sesión 401, cliente sin perfil 403', async () => {
      await h.http.get(`${API}/pro/analytics/month`).expect(401);
      const client = await register('cliente');
      const res = await month(client).expect(403);
      expect(res.body.code).toBe('PROFESSIONAL_PROFILE_REQUIRED');
    });

    it('valida el período: mes inválido 400, año sin mes o mes futuro 422', async () => {
      const p = await pro('periodo');
      await month(p, { year: 2026, month: 13 }).expect(400);
      expect((await month(p, { year: 2026 }).expect(422)).body.code).toBe('VALIDATION_ERROR');
      const now = currentBusinessMonth();
      await month(p, { year: now.year + 1, month: now.month }).expect(422);
    });

    describe('actividad real', () => {
      let winner: Pro;
      let rival: Pro;

      beforeAll(async () => {
        winner = await pro('ganador', { zones: ['villa-italia', 'centro'] });
        rival = await pro('rival', { zones: ['villa-italia', 'centro'] });
        const client = await register('clienta', 'Apellidoprivado');
        // Solicitud 1: ganan y hacen el trabajo. Solicitud 2: presupuesta y no lo eligen.
        const r1 = await request(client, [winner, rival]);
        const q1 = await quote(winner, r1, 30000);
        await quote(rival, r1, 25000);
        const r2 = await request(client, [winner, rival], 'centro');
        await quote(winner, r2, 18000);
        const q2rival = await quote(rival, r2, 15000);
        await h.http.post(`${API}/quotes/${q2rival}/accept`).set(auth(client.token)).expect(200);
        await fullJob(winner, client, r1, q1);
        // Solicitud 3: invitado, sin responder.
        await request(client, [winner]);
      });

      it('cuenta solicitudes, presupuestos, aceptados, agendados, realizados y reseñas del mes', async () => {
        const body = (await month(winner).expect(200)).body;
        expect(body.basic).toEqual({
          requestsReceived: 3,
          quotesSent: 2,
          quotesAccepted: 1,
          scheduledJobs: 1,
          completedJobs: 1,
          reviewsReceived: 1,
          currentRating: 5,
          reviewCount: 1,
        });
        expect(body.recentReviews).toHaveLength(1);
        expect(body.recentReviews[0]).toMatchObject({ rating: 5, reviewerDisplayName: 'clienta' });
        expect(JSON.stringify(body)).not.toContain('Apellidoprivado');
        expect(JSON.stringify(body)).not.toContain('Quintana');
      });

      it('ownership: cada profesional ve SOLO su actividad', async () => {
        const body = (await month(rival).expect(200)).body;
        expect(body.basic).toMatchObject({
          requestsReceived: 2,
          quotesSent: 2,
          quotesAccepted: 1,
          completedJobs: 0,
        });
        expect(body.recentReviews).toEqual([]);
      });

      it('FREE: sin valor aceptado, tasa, comparación ni desgloses', async () => {
        const body = (await month(winner).expect(200)).body;
        expect(body.entitlements).toMatchObject({ canUseAdvancedAnalytics: false, canBeFeatured: false });
        expect(body.advanced).toBeNull();
        expect(body.exposure).toBeNull();
        expect(JSON.stringify(body)).not.toContain('30000');
      });

      it('PRO: valor aceptado, tasa con la misma base, semanas, servicios y barrios reales', async () => {
        await setPlan(winner, 'PRO');
        const body = (await month(winner).expect(200)).body;
        expect(body.plan).toBe('PRO');
        const a = body.advanced;
        expect(a.acceptedQuotesValue).toBe('30000.00');
        expect(a.acceptance).toEqual({ sent: 2, accepted: 1, rate: 50 });
        expect(a.previous).toBeNull(); // el mes anterior no tuvo actividad: sin base
        const weekSum = (k: string) => a.weekly.reduce((s: number, w: Record<string, number>) => s + w[k], 0);
        expect([weekSum('requestsReceived'), weekSum('quotesSent'), weekSum('completedJobs')]).toEqual([
          3, 2, 1,
        ]);
        expect(a.weekly[0]).toMatchObject({ fromDay: 1, toDay: 7 });
        expect(a.byService).toEqual([
          { id: svc.plomeria, name: 'Plomería', requestsReceived: 3, quotesSent: 2, quotesAccepted: 1 },
        ]);
        expect(
          a.byZone.map((z: { name: string; requestsReceived: number }) => [z.name, z.requestsReceived]),
        ).toEqual([
          ['Villa Italia', 2],
          ['Centro', 1],
        ]);
        await setPlan(winner, 'FREE');
      });

      it('PRO vencido vuelve a FREE en el acto (sin borrar datos)', async () => {
        await setPlan(winner, 'PRO', new Date(Date.now() - 60_000));
        const body = (await month(winner).expect(200)).body;
        expect(body.plan).toBe('FREE');
        expect(body.advanced).toBeNull();
        expect(body.basic.completedJobs).toBe(1);
        await setPlan(winner, 'FREE');
      });
    });

    it('zona horaria y mes anterior: las 23:30 del último día cuentan en ESE mes; comparación solo con base', async () => {
      const p = await pro('horario');
      const client = await register('vecino');
      const r1 = await request(client, [p]);
      const r2 = await request(client, [p]);
      const r3 = await request(client, [p]);
      const now = currentBusinessMonth();
      const prev = previousBusinessMonth(now);
      const { start } = businessMonthRange(now);
      // 23:30 del último día del mes anterior en Tandil = 02:30 UTC del día 1 del mes en curso.
      const lastNightPrev = new Date(start.getTime() - 30 * 60_000);
      await h.dataSource.query(`UPDATE request_invitations SET sent_at = $2 WHERE request_id = ANY($1)`, [
        [r1, r2],
        lastNightPrev,
      ]);
      await h.dataSource.query(`UPDATE request_invitations SET sent_at = $2 WHERE request_id = $1`, [
        r3,
        start,
      ]);
      expect(lastNightPrev.toISOString().slice(11, 16)).toBe('02:30');

      const cur = (await month(p).expect(200)).body;
      expect(cur.basic.requestsReceived).toBe(1);
      const before = (await month(p, prev).expect(200)).body;
      expect(before.period).toMatchObject({ ...prev, isCurrent: false });
      expect(before.basic.requestsReceived).toBe(2);

      await setPlan(p, 'PRO');
      const withPro = (await month(p).expect(200)).body;
      expect(withPro.advanced.previous).toMatchObject({ ...prev, requestsReceived: 2, quotesSent: 0 });
      expect(withPro.advanced.acceptance).toEqual({ sent: 0, accepted: 0, rate: null }); // sin base: null, no 0 %
    });
  });

  // ---- Planes ----------------------------------------------------------------
  describe('planes', () => {
    it('GET /plans: 10 presupuestos FREE y PRO a $19.000 por defecto, sin contratación desde la app', async () => {
      const body = (await h.http.get(`${API}/plans`).expect(200)).body;
      expect(body).toEqual({
        free: { monthlyQuoteLimit: 10 },
        pro: { monthlyPriceArs: 19000, selfServe: false, features: { quoteTemplates: false } },
      });
    });

    it('/pro/me informa el plan EFECTIVO con entitlements y vencimiento', async () => {
      const p = await pro('plan');
      const free = (await h.http.get(`${API}/pro/me`).set(auth(p.token)).expect(200)).body;
      expect(free.plan).toEqual({
        tier: 'FREE',
        expiresAt: null,
        entitlements: {
          canSendUnlimitedQuotes: false,
          canBeFeatured: false,
          canUseAdvancedAnalytics: false,
          canSeeExposureAnalytics: false,
          canUseQuoteTemplates: false,
        },
      });
      expect(free.quoteUsage).toEqual({ period: currentBusinessMonth(), used: 0, limit: 10, remaining: 10 });
      const until = new Date(Date.now() + 90 * DAY);
      await setPlan(p, 'PRO', until);
      const paid = (await h.http.get(`${API}/pro/me`).set(auth(p.token)).expect(200)).body;
      expect(paid.planTier).toBe('PRO');
      expect(paid.plan).toMatchObject({
        tier: 'PRO',
        entitlements: { canSendUnlimitedQuotes: true, canBeFeatured: true, canSeeExposureAnalytics: true },
      });
      expect(paid.quoteUsage).toMatchObject({ limit: null, remaining: null });
      expect(new Date(paid.plan.expiresAt).getTime()).toBe(until.getTime());
    });

    it('nadie se da PRO por la API', async () => {
      const p = await pro('vivo');
      for (const body of [{ planTier: 'PRO' }, { plan: 'PRO' }, { planExpiresAt: '2030-01-01' }]) {
        await h.http.patch(`${API}/pro/profile`).set(auth(p.token)).send(body).expect(400);
      }
      await h.http.patch(`${API}/auth/me`).set(auth(p.token)).send({ planTier: 'PRO' });
      const me = (await h.http.get(`${API}/pro/me`).set(auth(p.token)).expect(200)).body;
      expect(me.plan.tier).toBe('FREE');
    });
  });

  // ---- Destacados ------------------------------------------------------------
  describe('espacios destacados en la búsqueda', () => {
    // Herrería en Uncas: nadie del seed la ofrece; los perfiles de este bloque son los únicos.
    const where = () => ({ service: svc.herreria, zone: zone.uncas, pageSize: 20 });
    let freeA: Pro;
    let freeB: Pro;
    let proP: Pro;

    beforeAll(async () => {
      const opts = { services: ['herreria'], zones: ['uncas'] };
      freeA = await pro('libreA', { ...opts, available: true });
      freeB = await pro('libreB', { ...opts, available: true });
      proP = await pro('destacado', opts); // no disponible hoy: orgánicamente último
      await setPlan(proP, 'PRO');
    });

    it('el PRO elegible ocupa el espacio destacado, identificado; los FREE siguen apareciendo', async () => {
      const body = await search(where());
      expect(body.total).toBe(3);
      expect(body.items.map((p) => p.id)).toEqual([proP.proId, ...body.items.slice(1).map((p) => p.id)]);
      expect(body.items[0]).toMatchObject({ pro: true, isFeaturedPlacement: true });
      const free = body.items.filter((p) => p.id !== proP.proId);
      expect(free.map((p) => p.id).sort()).toEqual([freeA.proId, freeB.proId].sort());
      for (const p of free) expect(p).toMatchObject({ pro: false, isFeaturedPlacement: false });
      expect(new Set(body.items.map((p) => p.id)).size).toBe(3); // sin duplicados
    });

    it('estable y paginable: mismo orden en cada consulta y sin repetir entre páginas', async () => {
      const full = (await search(where())).items.map((p) => p.id);
      expect((await search(where())).items.map((p) => p.id)).toEqual(full);
      const paged: string[] = [];
      for (let page = 1; page <= 3; page++) {
        const body = await search({ ...where(), pageSize: 1, page });
        expect(body.total).toBe(3);
        paged.push(...body.items.map((p) => p.id));
      }
      expect(paged).toEqual(full);
    });

    it('PRO sin cobertura del barrio no aparece (ni destacado)', async () => {
      const body = await search({ service: svc.herreria, zone: zone['la-movediza'] });
      expect(body.items.map((p) => p.id)).not.toContain(proP.proId);
    });

    it('PRO sin matrícula válida no aparece en un servicio regulado; FREE matriculado sí', async () => {
      const opts = { services: ['gas'], zones: ['uncas'] };
      const unlicensed = await pro('gasistaPro', opts);
      await setPlan(unlicensed, 'PRO');
      const licensed = await pro('gasistaFree', opts);
      await h.dataSource.query(
        `INSERT INTO professional_verifications (professional_id, type, status, service_id, reference, reviewed_at)
         VALUES ($1, 'LICENSE', 'VERIFIED', $2, 'MG 4321', now())`,
        [licensed.proId, svc.gas],
      );
      const ids = (await search({ service: svc.gas, zone: zone.uncas })).items.map((p) => p.id);
      expect(ids).toContain(licensed.proId);
      expect(ids).not.toContain(unlicensed.proId);
    });

    it('PRO vencido o pausado no se destaca', async () => {
      await setPlan(proP, 'PRO', new Date(Date.now() - 1000));
      let body = await search(where());
      expect(body.items.find((p) => p.id === proP.proId)).toMatchObject({
        pro: false,
        isFeaturedPlacement: false,
      });
      expect(body.items.at(-1)!.id).toBe(proP.proId); // vuelve a su lugar orgánico
      await setPlan(proP, 'PRO');
      await h.http.patch(`${API}/pro/status`).set(auth(proP.token)).send({ status: 'PAUSED' }).expect(200);
      body = await search(where());
      expect(body.items.map((p) => p.id)).not.toContain(proP.proId);
      await h.http.patch(`${API}/pro/status`).set(auth(proP.token)).send({ status: 'ACTIVE' }).expect(200);
    });

    it('nunca destaca hacia abajo: un PRO que ya está primero queda orgánico', async () => {
      await h.http
        .patch(`${API}/pro/availability`)
        .set(auth(proP.token))
        .send({ availableToday: true })
        .expect(200);
      // Mejor posición orgánica garantizada: los FREE dejan de estar disponibles.
      for (const p of [freeA, freeB])
        await h.http
          .patch(`${API}/pro/availability`)
          .set(auth(p.token))
          .send({ availableToday: false })
          .expect(200);
      const body = await search(where());
      expect(body.items[0]).toMatchObject({ id: proP.proId, pro: true, isFeaturedPlacement: false });
    });

    it('el perfil público marca PRO, pero no expone vencimiento, uso ni tier', async () => {
      const body = (await h.http.get(`${API}/professionals/${proP.proId}`).expect(200)).body;
      expect(body.pro).toBe(true);
      for (const key of ['planTier', 'plan', 'planExpiresAt', 'quoteUsage'])
        expect(body).not.toHaveProperty(key);
    });
  });
});
