import { randomUUID } from 'crypto';
import { describeE2E, Harness, startApp } from './app.harness';

const API = '/api/v1';
const PASSWORD = 'una-clave-bien-larga';
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/**
 * Baja de cuenta: anonimiza (nunca borra la fila: las claves hacia `users` son
 * CASCADE), cierra lo abierto, borra archivos y respeta a la contraparte.
 */
describeE2E('Baja de cuenta (e2e)', () => {
  let h: Harness;
  let serviceId: string;
  let zoneId: string;

  async function user(label: string) {
    const email = `${label.toLowerCase()}-${randomUUID().slice(0, 8)}@test.dev`;
    const res = await h.http
      .post(`${API}/auth/register`)
      .send({ firstName: label, lastName: 'Baja', email, password: PASSWORD, phone: '+54 249 555 1212' })
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
  async function createRequest(token: string, title = 'Problema de agua') {
    const res = await h.http
      .post(`${API}/requests`)
      .set(auth(token))
      .send({ serviceId, zoneId, title, description: 'Pierde la canilla de la cocina.', exactAddress: 'Calle Privada 742', urgency: 'FLEXIBLE' })
      .expect(201);
    return res.body.id as string;
  }
  /** Cliente + profesional con el presupuesto aceptado (trabajo por coordinar). */
  async function activeJob(client = undefined as Awaited<ReturnType<typeof user>> | undefined, worker = undefined as Awaited<ReturnType<typeof pro>> | undefined) {
    const c = client ?? (await user('Cliente'));
    const p = worker ?? (await pro('Profesional'));
    const requestId = await createRequest(c.token);
    await h.http.post(`${API}/requests/${requestId}/invitations`).set(auth(c.token)).send({ professionalIds: [p.id], targeted: true }).expect(200);
    const q = await h.http
      .post(`${API}/pro/requests/${requestId}/quote`)
      .set(auth(p.token))
      .send({ description: 'Cambio de flexible y cierre', laborAmount: 30000 })
      .expect(201);
    await h.http.post(`${API}/quotes/${q.body.id}/accept`).set(auth(c.token)).expect(200);
    return { client: c, worker: p, requestId };
  }
  const check = async (token: string) => (await h.http.get(`${API}/account/deletion-check`).set(auth(token)).expect(200)).body;
  const del = (token: string, password = PASSWORD) => h.http.post(`${API}/account/delete`).set(auth(token)).send({ password });
  const userRow = async (id: string) => (await h.dataSource.query(`SELECT * FROM users WHERE id = $1`, [id]))[0];

  beforeAll(async () => {
    h = await startApp({ emailVerification: false });
    serviceId = (await h.http.get(`${API}/services`)).body.find((s: { slug: string }) => s.slug === 'plomeria').id;
    zoneId = (await h.http.get(`${API}/zones?city=tandil`)).body[0].id;
  }, 60_000);
  afterAll(async () => h?.app.close());

  it('contraseña incorrecta → 403 (no 401: la sesión sigue) y no cambia nada', async () => {
    const u = await user('Clave');
    const res = await del(u.token, 'otra-clave-cualquiera').expect(403);
    expect(res.body.code).toBe('ACCOUNT_PASSWORD_INCORRECT');
    await h.http.get(`${API}/auth/me`).set(auth(u.token)).expect(200);
    expect((await userRow(u.userId)).deleted_at).toBeNull();
  });

  it('cliente: anonimiza la cuenta, cierra sesiones y libera el email', async () => {
    const u = await user('Cliente');
    expect(await check(u.token)).toEqual({ canDelete: true, blockers: [] });
    await del(u.token).expect(200);

    const row = await userRow(u.userId);
    expect(row).toMatchObject({ first_name: 'Usuario', last_name: 'eliminado', phone: null, avatar_url: null, is_admin: false });
    expect(row.email).toBe(`eliminado-${u.userId}@eliminado.invalid`);
    expect(row.deleted_at).not.toBeNull();
    // Nadie vuelve a entrar: ni con la clave de antes, ni con el refresh token.
    await h.http.post(`${API}/auth/login`).send({ email: u.email, password: PASSWORD }).expect(401);
    await h.http.post(`${API}/auth/refresh`).send({ refreshToken: u.refreshToken }).expect(401);
    // Y el email queda libre para una cuenta nueva.
    await h.http.post(`${API}/auth/register`).send({ firstName: 'Otra', lastName: 'Vez', email: u.email, password: PASSWORD }).expect(201);
  });

  it('solicitudes abiertas se cancelan solas y se borra lo privado (dirección, texto, fotos)', async () => {
    const u = await user('Abierta');
    const requestId = await createRequest(u.token);
    await h.dataSource.query(`INSERT INTO request_photos (request_id, url, sort_order) VALUES ($1, 'https://x.test/a.jpg', 0)`, [requestId]);
    await del(u.token).expect(200);
    const [r] = await h.dataSource.query(`SELECT status, exact_address, description FROM service_requests WHERE id = $1`, [requestId]);
    expect(r.status).toBe('CANCELLED');
    expect(r.exact_address).toBeNull();
    expect(r.description).not.toContain('canilla');
    expect(await h.dataSource.query(`SELECT 1 FROM request_photos WHERE request_id = $1`, [requestId])).toHaveLength(0);
  });

  it('un trabajo en curso bloquea la baja (cliente y profesional) hasta que se cancela', async () => {
    const job = await activeJob();
    for (const who of [job.client, job.worker]) {
      const c = await check(who.token);
      expect(c.canDelete).toBe(false);
      expect(c.blockers[0]).toMatchObject({ code: 'ACTIVE_JOBS', count: 1 });
      const res = await del(who.token).expect(409);
      expect(res.body.code).toBe('ACCOUNT_DELETE_BLOCKED');
      expect(res.body.details.blockers[0].code).toBe('ACTIVE_JOBS');
      expect((await userRow(who.userId)).deleted_at).toBeNull();
    }
    await h.http.post(`${API}/requests/${job.requestId}/cancel`).set(auth(job.client.token)).expect(200);
    await del(job.worker.token).expect(200);
    await del(job.client.token).expect(200);
  });

  it('una suscripción PRO viva bloquea la baja hasta cancelarla en Mi plan', async () => {
    const p = await pro('Suscripta');
    await h.http.post(`${API}/billing/pro/checkout`).set(auth(p.token)).send({}).expect(200);
    expect((await check(p.token)).blockers.map((b: { code: string }) => b.code)).toEqual(['OPEN_SUBSCRIPTION']);
    await del(p.token).expect(409);
    await h.http.post(`${API}/billing/pro/cancel`).set(auth(p.token)).expect(200);
    await del(p.token).expect(200);
  });

  it('profesional: sale de la búsqueda, pierde nombre y datos, borra foto y archivos, retira presupuestos', async () => {
    const worker = await pro('Maestro');
    const [{ slug }] = await h.dataSource.query(`SELECT slug FROM professional_profiles WHERE id = $1`, [worker.id]);
    await h.http.get(`${API}/professionals/public/${slug}`).expect(200);
    await h.dataSource.query(`UPDATE professional_profiles SET avatar_public_id = 'av/maestro', avatar_url = 'https://x.test/a.jpg', bio = 'Hola' WHERE id = $1`, [worker.id]);
    await h.dataSource.query(
      `INSERT INTO professional_work_photos (professional_id, public_id, image_url, sort_order) VALUES ($1, 'work/maestro-1', 'https://x.test/w.jpg', 0)`,
      [worker.id],
    );
    // Un presupuesto pendiente que el cliente todavía podría aceptar.
    const client = await user('Esperando');
    const requestId = await createRequest(client.token);
    await h.http.post(`${API}/requests/${requestId}/invitations`).set(auth(client.token)).send({ professionalIds: [worker.id], targeted: true }).expect(200);
    const q = await h.http.post(`${API}/pro/requests/${requestId}/quote`).set(auth(worker.token)).send({ description: 'Arreglo', laborAmount: 10000 }).expect(201);

    await del(worker.token).expect(200);

    expect(h.avatars.destroyed).toEqual(expect.arrayContaining(['av/maestro', 'work/maestro-1']));
    const [p] = await h.dataSource.query(`SELECT * FROM professional_profiles WHERE id = $1`, [worker.id]);
    expect(p).toMatchObject({ headline: null, bio: null, status: 'PAUSED', avatar_url: null, avatar_public_id: null });
    expect(p.slug).toBe(`profesional-eliminado-${worker.id.slice(0, 8)}`);
    await h.http.get(`${API}/professionals/public/${slug}`).expect(404);
    expect(await h.dataSource.query(`SELECT 1 FROM professional_work_photos WHERE professional_id = $1`, [worker.id])).toHaveLength(0);
    // El cliente ya no puede aceptar el presupuesto del profesional dado de baja.
    const [quote] = await h.dataSource.query(`SELECT status FROM quotes WHERE id = $1`, [q.body.id]);
    expect(quote.status).toBe('WITHDRAWN');
    await h.http.post(`${API}/quotes/${q.body.id}/accept`).set(auth(client.token)).expect(409);
  });

  it('documentos de matrícula: se borran de Cloudinary y se limpia el número', async () => {
    const worker = await pro('Matriculado');
    await h.dataSource.query(
      `INSERT INTO professional_verifications (professional_id, type, status, service_id, reference, document_public_id, document_format, document_bytes)
       VALUES ($1, 'LICENSE', 'VERIFIED', $2, 'MP-1234', 'doc/matriculado', 'jpg', 1000)`,
      [worker.id, serviceId],
    );
    await del(worker.token).expect(200);
    expect(h.storage.destroyed).toContain('doc/matriculado');
    const [v] = await h.dataSource.query(`SELECT reference, document_public_id, document_deleted_at FROM professional_verifications WHERE professional_id = $1`, [worker.id]);
    expect(v.reference).toBeNull();
    expect(v.document_public_id).toBeNull();
    expect(v.document_deleted_at).not.toBeNull();
  });

  it('si Cloudinary falla no cambia nada y se puede reintentar', async () => {
    const worker = await pro('Reintento');
    await h.dataSource.query(`UPDATE professional_profiles SET avatar_public_id = 'av/reintento', avatar_url = 'https://x.test/a.jpg' WHERE id = $1`, [worker.id]);
    h.avatars.failDestroys = 1;
    const res = await del(worker.token).expect(502);
    expect(res.body.code).toBe('ACCOUNT_DELETE_FAILED');
    expect((await userRow(worker.userId)).deleted_at).toBeNull();
    const [p] = await h.dataSource.query(`SELECT headline, status FROM professional_profiles WHERE id = $1`, [worker.id]);
    expect(p).toMatchObject({ headline: 'Reintento en Tandil', status: 'ACTIVE' });
    await del(worker.token).expect(200);
  });

  it('respeta a la contraparte: el historial y las reseñas del otro quedan', async () => {
    const client = await user('Historia');
    const worker = await pro('Reseñado');
    const job = await activeJob(client, worker);
    await h.dataSource.query(`UPDATE jobs SET status = 'COMPLETED', completed_at = now() WHERE request_id = $1`, [job.requestId]);
    await h.dataSource.query(`UPDATE service_requests SET status = 'COMPLETED', completed_at = now() WHERE id = $1`, [job.requestId]);
    await h.http.post(`${API}/requests/${job.requestId}/review`).set(auth(client.token)).send({ rating: 5, comment: 'Muy prolijo' }).expect(201);
    await del(client.token).expect(200);
    // El profesional conserva su trabajo y su reseña; el cliente figura como "Usuario eliminado".
    expect(await h.dataSource.query(`SELECT 1 FROM jobs WHERE request_id = $1`, [job.requestId])).toHaveLength(1);
    const reviews = (await h.http.get(`${API}/professionals/${worker.id}/reviews`).expect(200)).body;
    expect(JSON.stringify(reviews)).toContain('Muy prolijo');
    expect(JSON.stringify(reviews)).toContain('Usuario');
    expect(JSON.stringify(reviews)).not.toContain('Historia');
  });

  it('repetir la baja con el token todavía vigente no falla', async () => {
    const u = await user('Doble');
    await del(u.token).expect(200);
    await del(u.token).expect(200);
  });
});
