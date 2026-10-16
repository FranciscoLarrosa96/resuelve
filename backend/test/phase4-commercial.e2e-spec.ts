import { randomUUID } from 'crypto';
import { describeE2E, Harness, startApp } from './app.harness';
import { sendProWeeklySummaries, weeklyWindow } from '../src/notifications/weekly/pro-weekly-summary';
import { PUSH_COPY } from '../src/notifications/push/push-copy';

const API = '/api/v1';
const PASSWORD = 'una-clave-bien-larga';
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/**
 * Fase 4 comercial: que se note que el PRO paga (portadas en resultados, resumen semanal,
 * diagnóstico en vez de ceros) y razones reales para pagar (demanda de su zona, el momento
 * de la pérdida, el precio anclado en un trabajo suyo), y presupuestos que ayudan a elegir.
 */
describeE2E('Fase 4 comercial (e2e)', () => {
  let h: Harness;
  let serviceId: string;
  let zoneId: string;
  let cityId: string;

  async function user(label: string) {
    const email = `${label.toLowerCase().replace(/[^a-z]+/g, '-')}-${randomUUID().slice(0, 8)}@test.dev`;
    const res = await h.http
      .post(`${API}/auth/register`)
      .send({ firstName: label, lastName: 'Cuatro', email, password: PASSWORD })
      .expect(201);
    return { token: res.body.accessToken as string };
  }
  async function pro(label: string, plan: 'FREE' | 'PRO' = 'FREE') {
    const u = await user(label);
    const res = await h.http
      .post(`${API}/pro/profile`)
      .set(auth(u.token))
      .send({ headline: `${label} en Tandil`, yearsExperience: 4, serviceIds: [serviceId], zoneIds: [zoneId] })
      .expect(201);
    const id = res.body.id as string;
    await h.dataSource.query(
      `UPDATE professional_profiles SET first_success_at = now(), plan_tier = $2 WHERE id = $1`,
      [id, plan],
    );
    return { ...u, id };
  }
  type Pro = Awaited<ReturnType<typeof pro>>;

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
  const quote = (p: Pro, requestId: string, laborAmount = 15000) =>
    h.http
      .post(`${API}/pro/requests/${requestId}/quote`)
      .set(auth(p.token))
      .send({ description: 'Cambio de cuerito y ajuste', laborAmount })
      .expect(201);
  async function addWork(p: Pro, title: string, doneOn: string) {
    const [work] = await h.dataSource.query(
      `INSERT INTO professional_works (professional_id, title, done_on) VALUES ($1, $2, $3) RETURNING id`,
      [p.id, title, doneOn],
    );
    await h.dataSource.query(
      `INSERT INTO professional_work_photos (professional_id, work_id, public_id, image_url, sort_order)
       VALUES ($1, $2, $3, $4, 0)`,
      [p.id, work.id, `resuelve/professional-work/${p.id}/${work.id}`, `https://res.cloudinary.com/demo/${work.id}.jpg`],
    );
  }
  const month = async (p: Pro) => (await h.http.get(`${API}/pro/analytics/month`).set(auth(p.token)).expect(200)).body;

  beforeAll(async () => {
    h = await startApp({ emailVerification: false, freeOpportunityDelayMinutes: 30 });
    serviceId = (await h.http.get(`${API}/services`)).body.find((s: { slug: string }) => s.slug === 'plomeria').id;
    const zones = (await h.http.get(`${API}/zones?city=tandil`)).body;
    zoneId = zones[0].id;
    [{ id: cityId }] = await h.dataSource.query(`SELECT city_id AS id FROM zones WHERE id = $1`, [zoneId]);
  }, 60_000);
  afterAll(async () => h?.app.close());

  it('resultados: portadas de hasta 3 trabajos solo para PRO vigente (Free, aunque tenga trabajos, sin)', async () => {
    const paid = await pro('Con fotos', 'PRO');
    const free = await pro('Sin PRO');
    for (const [i, month] of ['2026-01-01', '2026-03-01', '2026-05-01', '2026-07-01'].entries()) {
      await addWork(paid, `Trabajo ${i + 1}`, month);
    }
    await addWork(free, 'Baño', '2026-04-01');
    const res = await h.http
      .get(`${API}/professionals`)
      .query({ service: 'plomeria', locality: cityId, pageSize: 50 })
      .expect(200);
    const byId = (id: string) => res.body.items.find((p: { id: string }) => p.id === id);
    expect(byId(paid.id).workCovers.map((w: { title: string }) => w.title)).toEqual(['Trabajo 4', 'Trabajo 3', 'Trabajo 2']);
    expect(byId(free.id).workCovers).toEqual([]);
    // Bajó a Free: las portadas dejan de mostrarse (los trabajos siguen guardados).
    await h.dataSource.query(`UPDATE professional_profiles SET plan_tier = 'FREE' WHERE id = $1`, [paid.id]);
    const after = await h.http.get(`${API}/professionals`).query({ service: 'plomeria', locality: cityId, pageSize: 50 });
    expect(after.body.items.find((p: { id: string }) => p.id === paid.id).workCovers).toEqual([]);
  });

  it('presupuestos: matrícula verificada del servicio pedido y "Suele responder en…" con datos reales', async () => {
    const client = await user('Cliente compara');
    const licensed = await pro('Matriculado', 'PRO');
    const other = await pro('Sin matrícula', 'PRO');
    await h.dataSource.query(
      `INSERT INTO professional_verifications (professional_id, type, status, service_id, reference)
       VALUES ($1, 'LICENSE', 'VERIFIED', $2, 'MP-123')`,
      [licensed.id, serviceId],
    );
    const id = await request(client, [licensed.id, other.id]);
    await quote(licensed, id);
    await quote(other, id);
    // Presupuestar lo recalcula (con menos de 3 respuestas, null): se simula un historial ya calculado.
    await h.dataSource.query(`UPDATE professional_profiles SET average_response_minutes = 25 WHERE id = $1`, [licensed.id]);
    const quotes = (await h.http.get(`${API}/requests/${id}/quotes`).set(auth(client.token)).expect(200)).body;
    const byPro = (pid: string) => quotes.find((q: { professionalId: string }) => q.professionalId === pid).professional;
    expect(byPro(licensed.id)).toMatchObject({ licenseVerified: true, averageResponseMinutes: 25 });
    expect(byPro(other.id)).toMatchObject({ licenseVerified: false, averageResponseMinutes: null });
  });

  it('el momento de la pérdida: al Free demorado le dice cuántos presupuestos ya había cuando se le habilitó', async () => {
    const client = await user('Cliente apurado');
    const fast = await pro('PRO rápido', 'PRO');
    const late = await pro('Free tarde');
    const id = await request(client, [fast.id, late.id]);
    await quote(fast, id);
    // Pasan los 30 minutos: la solicitud se le habilita al Free.
    await h.dataSource.query(
      `UPDATE request_invitations SET sent_at = sent_at - interval '31 minutes', available_at = available_at - interval '31 minutes'
        WHERE request_id = $1`,
      [id],
    );
    // Lo registrado en el momento (acceso anticipado del PRO) se corre igual que las invitaciones.
    await h.dataSource.query(
      `UPDATE pro_funnel_events SET occurred_at = occurred_at - interval '31 minutes' WHERE ref = $1`,
      [id],
    );
    await h.dataSource.query(`UPDATE quotes SET created_at = now() - interval '20 minutes' WHERE request_id = $1`, [id]);
    const detail = (await h.http.get(`${API}/pro/requests/${id}`).set(auth(late.token)).expect(200)).body;
    expect(detail.opportunity).toMatchObject({ delayed: false, lateByMinutes: 30, quotesBeforeYou: 1 });
    const asPro = (await h.http.get(`${API}/pro/requests/${id}`).set(auth(fast.token)).expect(200)).body;
    expect(asPro.opportunity).toMatchObject({ lateByMinutes: 0, quotesBeforeYou: 0 });
  });

  it('la demanda en tu zona: agregada, con mínimo de muestra; y el precio anclado en su presupuesto aceptado más alto', async () => {
    const watcher = await pro('Mira la demanda');
    await h.dataSource.query(`UPDATE professional_profiles SET primary_city_id = $2 WHERE id = $1`, [watcher.id, cityId]);
    const before = await month(watcher);
    const base = before.demand?.requests ?? 0;
    const client = await user('Cliente demanda');
    const helper = await pro('Responde', 'PRO');
    for (let i = 0; i < 3; i++) await request(client, [helper.id]);
    const body = await month(watcher);
    expect(body.demand).toMatchObject({
      locality: 'Tandil',
      services: expect.arrayContaining(['Plomería']),
      requests: base + 3,
      otherProProfiles: expect.any(Number),
    });
    expect(body.demand.otherProProfiles).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(body.demand)).not.toContain(helper.id);
    expect(body.largestAcceptedQuoteValue).toBeNull();

    // Un presupuesto aceptado suyo: el más alto ancla el precio.
    const id = await request(client, [watcher.id], true);
    const sent = await quote(watcher, id, 129000);
    await h.http.post(`${API}/quotes/${sent.body.id}/accept`).set(auth(client.token)).expect(200);
    expect((await month(watcher)).largestAcceptedQuoteValue).toBe('129000.00');
  });

  it('resumen semanal de PRO: una vez por semana, solo si hubo algo, in-app y push', async () => {
    const busy = await pro('PRO con semana', 'PRO');
    const quiet = await pro('PRO sin semana', 'PRO');
    const free = await pro('Free con visitas');
    const now = new Date();
    const w = weeklyWindow(now);
    const inWeek = new Date(w.start.getTime() + 2 * 86_400_000);
    for (const [p, type, featured, n] of [
      [busy, 'SEARCH_IMPRESSION', true, 3],
      [busy, 'PROFILE_VIEW', false, 2],
      [free, 'PROFILE_VIEW', false, 4],
    ] as const) {
      for (let i = 0; i < n; i++) {
        await h.dataSource.query(
          `INSERT INTO exposure_events (professional_id, type, occurred_at, session_key_hash, dedupe_key, is_featured_placement)
           VALUES ($1, $2, $3, repeat('b', 64), md5($4) || md5($4), $5)`,
          [p.id, type, inWeek, `${p.id}-${type}-${i}`, featured],
        );
      }
    }
    // Antes del lunes a las 9 no sale nada.
    expect(await sendProWeeklySummaries(h.dataSource, new Date(w.sendFrom.getTime() - 60_000))).toBe(0);
    const at = new Date(w.sendFrom.getTime() + 60_000);
    expect(await sendProWeeklySummaries(h.dataSource, at)).toBeGreaterThanOrEqual(1);
    expect(await sendProWeeklySummaries(h.dataSource, at)).toBe(0); // una vez por semana

    const list = async (p: Pro) =>
      (await h.http.get(`${API}/me/notifications`).query({ audience: 'PROFESSIONAL' }).set(auth(p.token)).expect(200)).body
        .items as { type: string; weekly: unknown; route: string }[];
    const weekly = (await list(busy)).filter((n) => n.type === 'PRO_WEEKLY_SUMMARY');
    expect(weekly).toHaveLength(1);
    expect(weekly[0]).toMatchObject({ weekly: { featured: 3, early: 0, views: 2 }, route: '/pro/estadisticas' });
    expect((await list(quiet)).some((n) => n.type === 'PRO_WEEKLY_SUMMARY')).toBe(false);
    expect((await list(free)).some((n) => n.type === 'PRO_WEEKLY_SUMMARY')).toBe(false);
    // Sale por push con un texto sin números ni datos personales.
    const [row] = await h.dataSource.query(
      `SELECT push_status FROM notifications n JOIN professional_profiles p ON p.user_id = n.user_id
        WHERE p.id = $1 AND n.type = 'PRO_WEEKLY_SUMMARY'`,
      [busy.id],
    );
    expect(row).toBeDefined(); // queda para el dispatcher de push de siempre (push_status NULL = pendiente)
    expect(PUSH_COPY.PRO_WEEKLY_SUMMARY).toEqual({ title: 'Tu semana con PRO', body: 'Mirá lo que pasó en tu perfil esta semana.' });
  });

  it('la semana resumida es de lunes a domingo (hora de Argentina) y sale desde el lunes a las 9', () => {
    // Miércoles 14 de octubre de 2026, 15:00 en Argentina.
    const w = weeklyWindow(new Date('2026-10-14T18:00:00Z'));
    expect(w.key).toBe('2026-10-05');
    expect(w.start.toISOString()).toBe('2026-10-05T03:00:00.000Z');
    expect(w.end.toISOString()).toBe('2026-10-12T03:00:00.000Z');
    expect(w.sendFrom.toISOString()).toBe('2026-10-12T12:00:00.000Z');
    // El domingo a la noche todavía resume la semana anterior.
    expect(weeklyWindow(new Date('2026-10-12T02:00:00Z')).key).toBe('2026-09-28');
  });
});
