import { randomUUID } from 'crypto';
import { describeE2E, Harness, startApp } from './app.harness';

const API = '/api/v1';
const PASSWORD = 'una-clave-bien-larga';
const DAY = 24 * 60 * 60 * 1000;
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/**
 * Gestión de usuarios del panel admin: listado, detalle, baja (anonimiza, la
 * misma regla que la baja de cuenta) y borrado definitivo (cuentas de prueba).
 */
describeE2E('Panel admin: usuarios (e2e)', () => {
  let h: Harness;
  let serviceId: string;
  let zoneId: string;
  let admin: Awaited<ReturnType<typeof user>>;
  const tag = randomUUID().slice(0, 6);

  async function user(label: string) {
    const email = `${label.toLowerCase()}-${tag}-${randomUUID().slice(0, 4)}@test.dev`;
    const res = await h.http
      .post(`${API}/auth/register`)
      .send({ firstName: label, lastName: 'Gestion', email, password: PASSWORD })
      .expect(201);
    const me = await h.http.get(`${API}/auth/me`).set(auth(res.body.accessToken)).expect(200);
    return { email, token: res.body.accessToken as string, refreshToken: res.body.refreshToken as string, userId: me.body.id as string };
  }
  async function pro(label: string) {
    const u = await user(label);
    const res = await h.http
      .post(`${API}/pro/profile`)
      .set(auth(u.token))
      .send({ headline: `${label} en Tandil`, yearsExperience: 4, serviceIds: [serviceId], zoneIds: [zoneId] })
      .expect(201);
    return { ...u, id: res.body.id as string };
  }
  /** Presupuesto aceptado: trabajo por coordinar (bloquea la baja). */
  async function selectedJob(client: Awaited<ReturnType<typeof user>>, worker: Awaited<ReturnType<typeof pro>>) {
    const req = await h.http
      .post(`${API}/requests`)
      .set(auth(client.token))
      .send({ serviceId, zoneId, title: 'Pierde agua', description: 'Pierde la canilla de la cocina.', urgency: 'FLEXIBLE' })
      .expect(201);
    const requestId = req.body.id as string;
    await h.http
      .post(`${API}/requests/${requestId}/invitations`)
      .set(auth(client.token))
      .send({ professionalIds: [worker.id], targeted: true })
      .expect(200);
    const q = await h.http
      .post(`${API}/pro/requests/${requestId}/quote`)
      .set(auth(worker.token))
      .send({ description: 'Cambio de flexible', laborAmount: 30000 })
      .expect(201);
    await h.http.post(`${API}/quotes/${q.body.id}/accept`).set(auth(client.token)).expect(200);
    return requestId;
  }
  /** Flujo real hasta COMPLETED con cita confirmada y reseña (appointments y jobs apuntan al presupuesto). */
  async function reviewedJob(client: Awaited<ReturnType<typeof user>>, worker: Awaited<ReturnType<typeof pro>>) {
    const requestId = await selectedJob(client, worker);
    const appt = await h.http
      .post(`${API}/pro/requests/${requestId}/appointments`)
      .set(auth(worker.token))
      .send({ startsAt: new Date(Date.now() + 2 * DAY).toISOString(), durationMinutes: 60 })
      .expect(200);
    const id = appt.body.appointment.id as string;
    await h.http.post(`${API}/appointments/${id}/confirm`).set(auth(client.token)).expect(200);
    await h.dataSource.query(
      `UPDATE appointments SET scheduled_start = now() - interval '2 hours', scheduled_end = now() - interval '1 hour' WHERE id = $1`,
      [id],
    );
    await h.http.post(`${API}/requests/${requestId}/complete`).set(auth(worker.token)).expect(200);
    await h.http.post(`${API}/requests/${requestId}/review`).set(auth(client.token)).send({ rating: 5 }).expect(201);
    return requestId;
  }

  const list = async (query: Record<string, string | number>) =>
    (await h.http.get(`${API}/admin/users`).query(query).set(auth(admin.token)).expect(200)).body;
  const show = async (id: string) => (await h.http.get(`${API}/admin/users/${id}`).set(auth(admin.token)).expect(200)).body;
  const deactivate = (id: string) => h.http.post(`${API}/admin/users/${id}/deactivate`).set(auth(admin.token));
  const purge = (id: string, confirmEmail: string) =>
    h.http.post(`${API}/admin/users/${id}/purge`).set(auth(admin.token)).send({ confirmEmail });
  const count = async (sql: string, params: unknown[]) => (await h.dataSource.query(sql, params))[0].n as number;

  beforeAll(async () => {
    h = await startApp({ emailVerification: false });
    serviceId = (await h.http.get(`${API}/services`)).body.find((s: { slug: string }) => s.slug === 'plomeria').id;
    zoneId = (await h.http.get(`${API}/zones`)).body[0].id;
    admin = await user('Operador');
    await h.dataSource.query(`UPDATE users SET is_admin = true WHERE id = $1`, [admin.userId]);
  }, 60_000);
  afterAll(async () => h?.app.close());

  it('solo un admin: el resto recibe el 404 de una ruta inexistente', async () => {
    const common = await user('Comun');
    await h.http.get(`${API}/admin/users`).set(auth(common.token)).expect(404);
    await h.http.get(`${API}/admin/users/${common.userId}`).set(auth(common.token)).expect(404);
    await h.http.post(`${API}/admin/users/${admin.userId}/purge`).set(auth(common.token)).send({ confirmEmail: admin.email }).expect(404);
    await h.http.get(`${API}/admin/users`).expect(401);
  });

  it('lista con búsqueda, filtro por tipo y paginado', async () => {
    const c = await user('Buscable');
    const p = await pro('Buscable');
    const found = await list({ q: `buscable-${tag}` });
    expect(found.total).toBe(2);
    expect(found).toMatchObject({ page: 1, pageSize: 25 });
    const byId = Object.fromEntries(found.items.map((i: { id: string }) => [i.id, i]));
    expect(byId[c.userId]).toMatchObject({ email: c.email, professional: null, isAdmin: false, deletedAt: null });
    expect(byId[p.userId].professional).toMatchObject({ id: p.id, status: 'ACTIVE', pro: false });

    expect((await list({ q: `buscable-${tag}`, kind: 'professionals' })).items.map((i: { id: string }) => i.id)).toEqual([p.userId]);
    expect((await list({ q: `buscable-${tag}`, kind: 'clients' })).items.map((i: { id: string }) => i.id)).toEqual([c.userId]);
    expect((await list({ kind: 'admins', q: admin.email })).total).toBe(1);
    // `%` y `_` se buscan literales, no como comodines.
    expect((await list({ q: '%' })).total).toBe(0);
    await h.http.get(`${API}/admin/users`).query({ kind: 'otro' }).set(auth(admin.token)).expect(400);
    await h.http.get(`${API}/admin/users`).query({ page: 0 }).set(auth(admin.token)).expect(400);
  });

  it('detalle: actividad, contrapartes y bloqueos de la baja', async () => {
    const c = await user('Detalle');
    const p = await pro('Detalle');
    await selectedJob(c, p);
    const detail = await show(p.userId);
    expect(detail.user).toMatchObject({ id: p.userId, email: p.email });
    expect(detail.activity).toMatchObject({ requests: 0, quotes: 1, jobs: 1, counterparts: 1, openSubscriptions: 0 });
    expect(detail.blockers.map((b: { code: string }) => b.code)).toEqual(['ACTIVE_JOBS']);
    await h.http.get(`${API}/admin/users/${randomUUID()}`).set(auth(admin.token)).expect(404);
  });

  it('nunca a uno mismo ni a otro admin', async () => {
    const self = await deactivate(admin.userId).expect(409);
    expect(self.body.code).toBe('ADMIN_USER_PROTECTED');
    expect((await purge(admin.userId, admin.email).expect(409)).body.code).toBe('ADMIN_USER_PROTECTED');
    const other = await user('Otroadmin');
    await h.dataSource.query(`UPDATE users SET is_admin = true WHERE id = $1`, [other.userId]);
    expect((await purge(other.userId, other.email).expect(409)).body.code).toBe('ADMIN_USER_PROTECTED');
    expect(await count(`SELECT count(*)::int AS n FROM users WHERE id = $1`, [other.userId])).toBe(1);
  });

  it('dar de baja: misma baja de cuenta (anonimiza y respeta los bloqueos)', async () => {
    const c = await user('Bloqueado');
    const p = await pro('Bloqueado');
    await selectedJob(c, p);
    const blocked = await deactivate(p.userId).expect(409);
    expect(blocked.body.code).toBe('ACCOUNT_DELETE_BLOCKED');

    const free = await pro('Baja');
    const res = await deactivate(free.userId).expect(200);
    expect(res.body.user).toMatchObject({ firstName: 'Usuario', lastName: 'eliminado' });
    expect(res.body.user.deletedAt).not.toBeNull();
    expect(res.body.user.professional).toMatchObject({ status: 'PAUSED' });
    // Nadie vuelve a entrar: ni con la clave ni con el refresh token.
    await h.http.post(`${API}/auth/login`).send({ email: free.email, password: PASSWORD }).expect(401);
    await h.http.post(`${API}/auth/refresh`).send({ refreshToken: free.refreshToken }).expect(401);
    expect((await list({ kind: 'deleted', q: free.userId })).total).toBe(1);
    await deactivate(free.userId).expect(200); // idempotente
  });

  it('borrado definitivo: exige el email exacto y no toca nada si no coincide', async () => {
    const u = await user('Confirmar');
    const bad = await purge(u.userId, 'otro@test.dev').expect(422);
    expect(bad.body.code).toBe('ADMIN_CONFIRM_MISMATCH');
    await purge(u.userId, '').expect(422);
    expect(await count(`SELECT count(*)::int AS n FROM users WHERE id = $1`, [u.userId])).toBe(1);
  });

  it('borrado definitivo de un profesional con cita, trabajo y reseña: se va todo, también sus archivos', async () => {
    const c = await user('Clientetest');
    const p = await pro('Protest');
    const requestId = await reviewedJob(c, p);
    await h.dataSource.query(`UPDATE professional_profiles SET avatar_public_id = 'av/protest' WHERE id = $1`, [p.id]);

    await purge(p.userId, p.email.toUpperCase()).expect(200);
    expect(await count(`SELECT count(*)::int AS n FROM users WHERE id = $1`, [p.userId])).toBe(0);
    expect(await count(`SELECT count(*)::int AS n FROM professional_profiles WHERE id = $1`, [p.id])).toBe(0);
    expect(await count(`SELECT count(*)::int AS n FROM quotes WHERE professional_id = $1`, [p.id])).toBe(0);
    expect(await count(`SELECT count(*)::int AS n FROM jobs WHERE request_id = $1`, [requestId])).toBe(0);
    expect(await count(`SELECT count(*)::int AS n FROM appointments WHERE request_id = $1`, [requestId])).toBe(0);
    expect(h.avatars.destroyed).toContain('av/protest');
    // La solicitud del cliente sigue existiendo (es suya).
    expect(await count(`SELECT count(*)::int AS n FROM service_requests WHERE id = $1`, [requestId])).toBe(1);
    await h.http.post(`${API}/auth/refresh`).send({ refreshToken: p.refreshToken }).expect(401);
    // El email queda libre para registrarse de nuevo.
    await h.http.post(`${API}/auth/register`).send({ firstName: 'De', lastName: 'Nuevo', email: p.email, password: PASSWORD }).expect(201);
  });

  it('borrado definitivo de un cliente que reseñó: se recalcula el rating del profesional', async () => {
    const c = await user('Resenador');
    const p = await pro('Resenado');
    await reviewedJob(c, p);
    const before = (await h.dataSource.query(`SELECT reviews_count, completed_jobs_count FROM professional_profiles WHERE id = $1`, [p.id]))[0];
    expect(before).toMatchObject({ reviews_count: 1, completed_jobs_count: 1 });

    await purge(c.userId, c.email).expect(200);
    const after = (await h.dataSource.query(`SELECT reviews_count, completed_jobs_count, average_rating FROM professional_profiles WHERE id = $1`, [p.id]))[0];
    expect(after).toMatchObject({ reviews_count: 0, completed_jobs_count: 0 });
    expect(Number(after.average_rating)).toBe(0);
    expect(await count(`SELECT count(*)::int AS n FROM reviews WHERE client_id = $1`, [c.userId])).toBe(0);
  });

  it('también borra definitivamente una cuenta ya dada de baja', async () => {
    const u = await pro('Doblebaja');
    await deactivate(u.userId).expect(200);
    const anonymized = (await show(u.userId)).user.email as string;
    await purge(u.userId, anonymized).expect(200);
    await h.http.get(`${API}/admin/users/${u.userId}`).set(auth(admin.token)).expect(404);
  });
});
