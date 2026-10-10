import { randomUUID } from 'crypto';
import { funnelCounts, funnelRates } from '../src/funnel/funnel-report';
import { describeE2E, Harness, startApp } from './app.harness';

const API = '/api/v1';
const PASSWORD = 'una-clave-bien-larga';

/**
 * Fase 0 — embudo del profesional: cada hito lo registra el servidor en la
 * acción real (una vez, sin datos personales) y `first_success_at` es el
 * primer presupuesto aceptado, inmutable.
 */
describeE2E('Embudo del profesional y primer éxito (e2e)', () => {
  let h: Harness;
  const svc: Record<string, string> = {};
  const zone: Record<string, string> = {};
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function register(label: string) {
    const email = `${label}-${randomUUID().slice(0, 8)}@test.dev`;
    const res = await h.http
      .post(`${API}/auth/register`)
      .send({ firstName: label, lastName: 'Embudo', email, password: PASSWORD })
      .expect(201);
    return { email, token: res.body.accessToken as string };
  }

  async function pro(label: string, serviceSlug = 'plomeria') {
    const user = await register(label);
    const res = await h.http
      .post(`${API}/pro/profile`)
      .set(auth(user.token))
      .send({
        headline: `${label} en Tandil`,
        yearsExperience: 3,
        serviceIds: [svc[serviceSlug]],
        coversEntireCity: true,
      })
      .expect(201);
    return { ...user, proId: res.body.id as string };
  }

  async function request(client: { token: string }, proIds: string[]) {
    const req = await h.http
      .post(`${API}/requests`)
      .set(auth(client.token))
      .send({
        serviceId: svc.plomeria,
        zoneId: zone['villa-italia'],
        title: 'Pérdida en la cocina',
        description: 'Pierde agua debajo de la bacha.',
        urgency: 'FLEXIBLE',
      })
      .expect(201);
    await h.http
      .post(`${API}/requests/${req.body.id}/invitations`)
      .set(auth(client.token))
      .send({ professionalIds: proIds })
      .expect(200);
    return req.body.id as string;
  }

  const quote = (p: { token: string }, requestId: string) =>
    h.http
      .post(`${API}/pro/requests/${requestId}/quote`)
      .set(auth(p.token))
      .send({ description: 'Cambio de sifón', laborAmount: 20000 })
      .expect(201);

  const events = async (proId: string) =>
    (
      await h.dataSource.query<{ type: string }[]>(
        `SELECT type FROM pro_funnel_events WHERE professional_id = $1 ORDER BY id`,
        [proId],
      )
    ).map((r) => r.type);

  const firstSuccessAt = async (proId: string) =>
    (
      await h.dataSource.query<{ at: Date | null }[]>(
        `SELECT first_success_at AS at FROM professional_profiles WHERE id = $1`,
        [proId],
      )
    )[0].at;

  beforeAll(async () => {
    h = await startApp({ emailVerification: false });
    for (const s of (await h.http.get(`${API}/services`).expect(200)).body) svc[s.slug] = s.id;
    for (const z of (await h.http.get(`${API}/zones`).expect(200)).body) zone[z.slug] = z.id;
  }, 60_000);

  afterAll(async () => {
    await h?.app.close();
  });

  it('registro → perfil completo → oportunidad → presupuesto → aceptado = primer éxito (una vez, inmutable)', async () => {
    const p = await pro('Ana');
    expect(await events(p.proId)).toEqual(['PROFESSIONAL_REGISTERED', 'PROFILE_COMPLETED']);
    expect(await firstSuccessAt(p.proId)).toBeNull();

    const client = await register('Cliente');
    const r1 = await request(client, [p.proId]);
    const q1 = await quote(p, r1);
    expect(await events(p.proId)).toEqual(
      expect.arrayContaining(['FIRST_COMPATIBLE_OPPORTUNITY_RECEIVED', 'FIRST_QUOTE_SENT']),
    );

    await h.http.post(`${API}/quotes/${q1.body.id}/accept`).set(auth(client.token)).expect(200);
    const first = await firstSuccessAt(p.proId);
    expect(first).toBeInstanceOf(Date);
    expect(await events(p.proId)).toEqual(
      expect.arrayContaining(['FIRST_QUOTE_ACCEPTED', 'FIRST_SUCCESS_REACHED']),
    );

    // Un segundo presupuesto aceptado no cambia la fecha ni duplica eventos.
    const r2 = await request(client, [p.proId]);
    const q2 = await quote(p, r2);
    await h.http.post(`${API}/quotes/${q2.body.id}/accept`).set(auth(client.token)).expect(200);
    expect(await firstSuccessAt(p.proId)).toEqual(first);
    const all = await events(p.proId);
    expect(all.filter((t) => t === 'FIRST_SUCCESS_REACHED')).toHaveLength(1);
    expect(all.filter((t) => t === 'FIRST_QUOTE_SENT')).toHaveLength(1);
  });

  it('un servicio con matrícula completa el perfil sin esperarla; aprobarla no lo repite', async () => {
    const p = await pro('Gasista', 'gas');
    expect(await events(p.proId)).toEqual(['PROFESSIONAL_REGISTERED', 'PROFILE_COMPLETED']);
    await h.dataSource.query(
      `INSERT INTO professional_verifications (professional_id, type, status, service_id, reference)
       VALUES ($1, 'LICENSE', 'PENDING', $2, 'MP-1234')`,
      [p.proId, svc.gas],
    );
    const [v] = await h.dataSource.query<{ id: string }[]>(
      `SELECT id FROM professional_verifications WHERE professional_id = $1`,
      [p.proId],
    );
    const { VerificationReviewService } = await import('../src/verifications/verification-review.service');
    await h.app.get(VerificationReviewService).approve(v.id, 'qa');
    expect(await events(p.proId)).toEqual(['PROFESSIONAL_REGISTERED', 'PROFILE_COMPLETED']);
  });

  it('POST /pro/funnel-events: solo vistas y clicks de PRO, uno por superficie y día', async () => {
    const p = await pro('Beto');
    const send = (body: object) => h.http.post(`${API}/pro/funnel-events`).set(auth(p.token)).send(body);
    expect((await send({ type: 'PRO_PLAN_VIEWED', surface: 'PLAN_PAGE' }).expect(200)).body).toEqual({
      recorded: true,
    });
    expect((await send({ type: 'PRO_PLAN_VIEWED', surface: 'PLAN_PAGE' }).expect(200)).body).toEqual({
      recorded: false,
    });
    expect((await send({ type: 'PRO_CTA_CLICKED', surface: 'LIMIT_MODAL' }).expect(200)).body).toEqual({
      recorded: true,
    });
    // Lo que decide el servidor no se acepta desde el frontend.
    await send({ type: 'PRO_PAYMENT_APPROVED', surface: 'PLAN_PAGE' }).expect(400);
    await send({ type: 'FIRST_SUCCESS_REACHED', surface: 'PLAN_PAGE' }).expect(400);
    await send({ type: 'PRO_PLAN_VIEWED', surface: 'OTRA' }).expect(400);
    const client = await register('Cliente2');
    await h.http
      .post(`${API}/pro/funnel-events`)
      .set(auth(client.token))
      .send({ type: 'PRO_PLAN_VIEWED', surface: 'PLAN_PAGE' })
      .expect(403);
  });

  it('el reporte cuenta profesionales distintos de la cohorte y calcula las tasas', async () => {
    const counts = await funnelCounts(
      h.dataSource.manager,
      new Date(Date.now() - 3600_000),
      new Date(Date.now() + 3600_000),
    );
    expect(counts.registered).toBe(3);
    expect(counts.profileCompleted).toBe(3);
    expect(counts.firstQuote).toBe(1);
    expect(counts.firstSuccess).toBe(1);
    expect(counts.proOffer).toBe(1);
    const rates = funnelRates(counts);
    expect(rates.activationRate).toBe(33.3);
    expect(rates.firstSuccessRate).toBe(33.3);
    expect(rates.proToSecondMonth).toBeNull();
  });
});
