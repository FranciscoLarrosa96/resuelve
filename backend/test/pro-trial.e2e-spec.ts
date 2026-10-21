import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { describeE2E, Harness, startApp } from './app.harness';

const API = '/api/v1';
const PASSWORD = 'una-clave-bien-larga';
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/**
 * Prueba de PRO (Fase 3 comercial): opt-in, una vez por cuenta y sin tarjeta,
 * para Free con perfil preparado, aun sin primer cliente. Suma días a la misma fuente que
 * los referidos (`bonus_pro_until`) y, al terminar, un resumen con sus números
 * reales del período que se marca como visto una vez.
 */
describeE2E('Prueba de PRO (e2e)', () => {
  let h: Harness;
  let config: ConfigService;
  let serviceId: string;
  let zoneId: string;

  async function user(label: string) {
    const email = `${label.toLowerCase().replace(/[^a-z]+/g, '-')}-${randomUUID().slice(0, 8)}@test.dev`;
    const res = await h.http
      .post(`${API}/auth/register`)
      .send({ firstName: label, lastName: 'Prueba', email, password: PASSWORD })
      .expect(201);
    return { token: res.body.accessToken as string };
  }
  async function pro(label: string, opts: { firstSuccess?: boolean; ready?: boolean } = { firstSuccess: true }) {
    const u = await user(label);
    const res = await h.http
      .post(`${API}/pro/profile`)
      .set(auth(u.token))
      .send({ headline: `${label} en Tandil`, yearsExperience: 4, serviceIds: [serviceId], zoneIds: [zoneId] })
      .expect(201);
    const id = res.body.id as string;
    if (opts.firstSuccess) {
      await h.dataSource.query(`UPDATE professional_profiles SET first_success_at = now() WHERE id = $1`, [id]);
    }
    if (opts.ready !== false) {
      await h.dataSource.query(`UPDATE professional_profiles SET avatar_url = 'https://example.test/avatar.jpg' WHERE id = $1`, [id]);
      const [work] = await h.dataSource.query(
        `INSERT INTO professional_works(professional_id, title, done_on) VALUES($1, 'Mi trabajo', '2026-10-01') RETURNING id`, [id],
      );
      await h.dataSource.query(
        `INSERT INTO professional_work_photos(professional_id, work_id, public_id, image_url)
         VALUES($1, $2, $3, 'https://example.test/work.jpg')`, [id, work.id, `test/${id}`],
      );
    }
    return { ...u, id };
  }
  type Pro = Awaited<ReturnType<typeof pro>>;
  const me = async (p: Pro) => (await h.http.get(`${API}/pro/me`).set(auth(p.token)).expect(200)).body;
  const start = (p: Pro) => h.http.post(`${API}/pro/plan/trial`).set(auth(p.token));
  const summary = (p: Pro) => h.http.get(`${API}/pro/plan/trial/summary`).set(auth(p.token));
  /** Termina la prueba ahora (lo que pasó hasta acá queda dentro del período). */
  async function finish(p: Pro) {
    await h.dataSource.query(`UPDATE pro_trials SET ends_at = now() WHERE professional_id = $1`, [p.id]);
    await h.dataSource.query(`UPDATE professional_profiles SET bonus_pro_until = now() WHERE id = $1`, [p.id]);
  }

  async function request(client: { token: string }, ids: string[], targeted = false) {
    const req = await h.http
      .post(`${API}/requests`)
      .set(auth(client.token))
      .send({ serviceId, zoneId, title: 'Pierde agua', description: 'Pierde la canilla de la cocina.', urgency: 'FLEXIBLE' })
      .expect(201);
    await h.http
      .post(`${API}/requests/${req.body.id}/invitations`)
      .set(auth(client.token))
      .send({ professionalIds: ids, ...(targeted ? { targeted: true } : {}) })
      .expect(200);
    return req.body.id as string;
  }
  const quote = (p: Pro, requestId: string) =>
    h.http
      .post(`${API}/pro/requests/${requestId}/quote`)
      .set(auth(p.token))
      .send({ description: 'Cambio de cuerito y ajuste', laborAmount: 15000 })
      .expect(201);

  beforeAll(async () => {
    h = await startApp({ emailVerification: false });
    config = h.app.get(ConfigService);
    serviceId = (await h.http.get(`${API}/services`)).body.find((s: { slug: string }) => s.slug === 'plomeria').id;
    zoneId = (await h.http.get(`${API}/zones?city=tandil`)).body[0].id;
  }, 60_000);
  afterAll(async () => h?.app.close());

  it('respeta los 14 días prometidos a una prueba iniciada antes del cambio', async () => {
    const p = await pro('Prueba histórica');
    await start(p).expect(200);
    await h.dataSource.query(`UPDATE pro_trials SET days = 14, ends_at = started_at + interval '14 days' WHERE professional_id = $1`, [p.id]);
    await h.dataSource.query(`UPDATE professional_profiles SET bonus_pro_until = (SELECT ends_at FROM pro_trials WHERE professional_id = $1) WHERE id = $1`, [p.id]);
    const body = await me(p);
    expect(body.proTrial).toMatchObject({ state: 'ACTIVE', days: 14 });
    expect((new Date(body.proTrial.endsAt).getTime() - new Date(body.proTrial.startedAt).getTime()) / 86400000).toBe(14);
  });

  it('Free después del primer cliente: la activa con un botón, es PRO por días (misma fuente que referidos) y una sola vez', async () => {
    const p = await pro('Disponible');
    expect((await me(p)).proTrial).toEqual({ state: 'AVAILABLE', days: 7 });

    const body = (await start(p).expect(200)).body;
    expect(body.plan).toMatchObject({ tier: 'PRO', source: 'BONUS' });
    expect(body.plan.entitlements.canBeFeatured).toBe(true);
    expect(body.quoteUsage.limit).toBeNull();
    expect(body.proTrial).toMatchObject({ state: 'ACTIVE', days: 7, summaryPending: false });
    const days = (new Date(body.proTrial.endsAt).getTime() - new Date(body.proTrial.startedAt).getTime()) / 86_400_000;
    expect(days).toBe(7);
    const [row] = await h.dataSource.query(`SELECT bonus_pro_until FROM professional_profiles WHERE id = $1`, [p.id]);
    expect(new Date(row.bonus_pro_until).toISOString()).toBe(body.proTrial.endsAt);

    const again = await start(p).expect(409);
    expect(again.body).toMatchObject({ code: 'PRO_TRIAL_NOT_AVAILABLE', details: { reason: 'ALREADY_HAD_TRIAL' } });
    const events = await h.dataSource.query(
      `SELECT count(*)::int AS n FROM pro_funnel_events WHERE professional_id = $1 AND type = 'PRO_TRIAL_STARTED'`,
      [p.id],
    );
    expect(events[0].n).toBe(1);

    // Al terminar vuelve a Free solo y nunca se ofrece de nuevo.
    await finish(p);
    const after = await me(p);
    expect(after.plan.source).toBeNull();
    expect(after.proTrial).toMatchObject({ state: 'ENDED', summaryPending: true });
    expect((await start(p).expect(409)).body.details.reason).toBe('ALREADY_HAD_TRIAL');
  });

  it('permite probar antes del primer cliente, pero no a quien ya pagó ni con PRO vigente', async () => {
    const early = await pro('Sin cliente', { firstSuccess: false });
    expect((await me(early)).proTrial).toEqual({ state: 'AVAILABLE', days: 7 });
    await start(early).expect(200);

    const paid = await pro('Ya pago');
    await h.dataSource.query(`UPDATE professional_profiles SET first_paid_pro_at = now() WHERE id = $1`, [paid.id]);
    expect((await start(paid).expect(409)).body.details.reason).toBe('ALREADY_PAID_PRO');

    const manual = await pro('Con PRO');
    await h.dataSource.query(`UPDATE professional_profiles SET plan_tier = 'PRO' WHERE id = $1`, [manual.id]);
    expect((await me(manual)).proTrial).toEqual({ state: 'UNAVAILABLE', reason: 'NOT_FREE' });
    expect((await start(manual).expect(409)).body.details.reason).toBe('NOT_FREE');

    // Días de referidos vigentes también son PRO.
    const bonus = await pro('Con dias');
    await h.dataSource.query(
      `UPDATE professional_profiles SET bonus_pro_until = now() + interval '3 days' WHERE id = $1`,
      [bonus.id],
    );
    expect((await start(bonus).expect(409)).body.details.reason).toBe('NOT_FREE');

    config.set('PRO_TRIAL_ENABLED', false);
    try {
      const off = await pro('Apagada');
      expect((await me(off)).proTrial).toEqual({ state: 'UNAVAILABLE', reason: 'TRIAL_DISABLED' });
      await start(off).expect(409);
    } finally {
      config.set('PRO_TRIAL_ENABLED', true);
    }
  });

  it('revalida publicación y avatar; permite activar sin trabajos y publicarlos durante la prueba', async () => {
    const p = await pro('Preparando perfil', { ready: false });
    expect((await start(p).expect(409)).body.details.reason).toBe('MISSING_AVATAR');
    await h.dataSource.query(`UPDATE professional_profiles SET avatar_url = 'https://example.test/avatar.jpg' WHERE id = $1`, [p.id]);
    expect((await me(p)).proTrial.state).toBe('AVAILABLE');
    await h.dataSource.query(`UPDATE professional_profiles SET status = 'PAUSED' WHERE id = $1`, [p.id]);
    expect((await start(p).expect(409)).body.details.reason).toBe('PROFILE_NOT_PUBLISHED');
    expect(await h.dataSource.query(`SELECT 1 FROM pro_trials WHERE professional_id = $1`, [p.id])).toHaveLength(0);
    await h.dataSource.query(`UPDATE professional_profiles SET status = 'ACTIVE' WHERE id = $1`, [p.id]);
    await start(p).expect(200);
    const works = await h.http.post(`${API}/pro/profile/works`).set(auth(p.token))
      .send({ title: 'Durante mi prueba', doneOn: '2026-01' }).expect(201);
    expect(works.body).toMatchObject({ maxWorks: 30, activeWorks: 1 });
  });

  it('dos pestañas a la vez: una sola prueba', async () => {
    const p = await pro('Dos pestanas');
    const results = await Promise.all([start(p), start(p)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const [{ n }] = await h.dataSource.query(`SELECT count(*)::int AS n FROM pro_trials WHERE professional_id = $1`, [p.id]);
    expect(n).toBe(1);
  });

  it('resumen al terminar: sus números reales del período, una vez', async () => {
    config.set('FREE_QUOTE_LIMIT', 3);
    try {
      await trialWithNumbers();
    } finally {
      config.set('FREE_QUOTE_LIMIT', 5);
    }
  });

  async function trialWithNumbers() {
    const p = await pro('Resumen');
    const client = await user('Cliente');
    // Antes de la prueba usó 2 de sus 3 oportunidades Free: le queda 1.
    for (const id of [await request(client, [p.id]), await request(client, [p.id])]) await quote(p, id);
    // Lo de antes de la prueba no cuenta.
    await h.dataSource.query(
      `INSERT INTO exposure_events (professional_id, type, occurred_at, session_key_hash, dedupe_key, is_featured_placement)
       VALUES ($1, 'PROFILE_VIEW', now() - interval '1 hour', repeat('b', 64), md5($2) || md5($2), false)`,
      [p.id, `antes-${p.id}`],
    );
    await h.dataSource.query(`UPDATE quotes SET created_at = now() - interval '1 hour' WHERE professional_id = $1`, [p.id]);

    await start(p).expect(200);
    await summary(p).expect(404); // en curso: todavía no hay resumen

    const free = await pro('Free demorado');
    config.set('FREE_OPPORTUNITY_DELAY_MINUTES', 30);
    let shared: string;
    try {
      shared = await request(client, [p.id, free.id]); // le llega antes que al Free
    } finally {
      config.set('FREE_OPPORTUNITY_DELAY_MINUTES', 0);
    }
    const alone = await request(client, [p.id]); // sin Free demorado: no es "antes que Free"
    const third = await request(client, [p.id]);
    const targeted = await request(client, [p.id], true); // dirigida: nunca usa cupo
    for (const id of [shared, alone, third, targeted]) await quote(p, id);
    // Momento fijo dentro del período: al forzar el fin, pg conserva microsegundos y JS usa milisegundos.
    await h.dataSource.query(
      `INSERT INTO exposure_events (professional_id, type, occurred_at, session_key_hash, dedupe_key, is_featured_placement)
       SELECT $1, t.type::exposure_event_type, (SELECT started_at + interval '1 millisecond' FROM pro_trials WHERE professional_id = $1),
              repeat('c', 64), md5($2 || t.n) || md5($2 || t.n), t.featured
         FROM (VALUES ('SEARCH_IMPRESSION', 1, true), ('SEARCH_IMPRESSION', 2, true), ('SEARCH_IMPRESSION', 3, false),
                      ('PROFILE_VIEW', 4, false), ('PROFILE_VIEW', 5, false), ('PROFILE_VIEW', 6, false),
                      ('WHATSAPP_CLICK', 7, false), ('WHATSAPP_CLICK', 8, false), ('PHONE_CLICK', 9, false)) AS t(type, n, featured)`,
      [p.id, `durante-${p.id}`],
    );

    await finish(p);
    // Los toques anteriores y en el fin exclusivo del período no inflan el resumen.
    await h.dataSource.query(
      `INSERT INTO exposure_events (professional_id, type, occurred_at, session_key_hash, dedupe_key, is_featured_placement)
       SELECT $1, t.type::exposure_event_type,
              CASE WHEN t.n = 1 THEN started_at - interval '1 hour' ELSE ends_at END,
              repeat('d', 64), md5($2 || t.n) || md5($2 || t.n), false
         FROM pro_trials CROSS JOIN (VALUES ('WHATSAPP_CLICK', 1), ('PHONE_CLICK', 2)) AS t(type, n)
        WHERE professional_id = $1`,
      [p.id, `fuera-${p.id}`],
    );
    expect((await me(p)).proTrial).toMatchObject({ state: 'ENDED', summaryPending: true });
    const s = (await summary(p).expect(200)).body;
    expect(s).toMatchObject({
      days: 7,
      featuredImpressions: 2,
      earlyOpportunities: 1,
      profileViews: 3,
      whatsappTaps: 2,
      phoneTaps: 1,
      // 3 solicitudes nuevas presupuestadas durante la prueba, con 1 oportunidad Free libre: 2 por encima.
      quotesAboveFreeLimit: 2,
    });

    const seen = (await h.http.post(`${API}/pro/plan/trial/summary/seen`).set(auth(p.token)).expect(200)).body;
    expect(seen.proTrial).toMatchObject({ state: 'ENDED', summaryPending: false });
    await h.http.post(`${API}/pro/plan/trial/summary/seen`).set(auth(p.token)).expect(200); // idempotente
    // El resumen sigue disponible para Mi plan.
    expect((await summary(p).expect(200)).body.profileViews).toBe(3);
  }

  it('sin prueba no hay resumen', async () => {
    const p = await pro('Nunca');
    await summary(p).expect(404);
  });
});
