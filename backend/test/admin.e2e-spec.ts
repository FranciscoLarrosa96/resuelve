import { randomUUID } from 'crypto';
import { describeE2E, Harness, startApp } from './app.harness';
import { User } from '../src/users/user.entity';

const API = '/api/v1';
const PASSWORD = 'una-clave-bien-larga';

/**
 * Panel de matrículas: solo `is_admin` (404 idéntico a una ruta inexistente
 * para el resto), mismas reglas que el CLI y decisiones que no se pisan.
 */
describeE2E('Panel de administración (e2e)', () => {
  let h: Harness;
  const svc: Record<string, string> = {};
  const zone: Record<string, string> = {};
  let admin: { email: string; token: string };

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function register(label: string) {
    const email = `${label}-${randomUUID().slice(0, 8)}@test.dev`;
    const res = await h.http
      .post(`${API}/auth/register`)
      .send({ firstName: label, lastName: 'Admin', email, password: PASSWORD })
      .expect(201);
    return { email, token: res.body.accessToken as string };
  }

  /** Profesional de gas con una matrícula enviada (PENDING). */
  async function gasPro(label: string, reference = 'Mat. N.º 4218') {
    const user = await register(label);
    const profile = await h.http
      .post(`${API}/pro/profile`)
      .set(auth(user.token))
      .send({
        headline: `${label} gasista`,
        yearsExperience: 5,
        serviceIds: [svc.gas],
        zoneIds: [zone.centro],
      })
      .expect(201);
    await h.http
      .post(`${API}/pro/verifications`)
      .set(auth(user.token))
      .send({ type: 'LICENSE', serviceId: svc.gas, reference })
      .expect(201);
    const pending = await h.http.get(`${API}/admin/verifications`).set(auth(admin.token)).expect(200);
    const item = pending.body.items.find(
      (v: { professionalId: string }) => v.professionalId === profile.body.id,
    );
    return { ...user, proId: profile.body.id as string, verificationId: item.id as string };
  }

  const gasSearch = async () =>
    (
      await h.http.get(`${API}/professionals`).query({ service: 'gas', pageSize: 50 }).expect(200)
    ).body.items.map((p: { id: string }) => p.id);

  beforeAll(async () => {
    h = await startApp();
    for (const s of (await h.http.get(`${API}/services`).expect(200)).body) svc[s.slug] = s.id;
    for (const z of (await h.http.get(`${API}/zones`).expect(200)).body) zone[z.slug] = z.id;
    admin = await register('operador');
    await h.dataSource.getRepository(User).update({ email: admin.email }, { isAdmin: true });
  }, 60_000);

  afterAll(async () => {
    await h?.app.close();
  });

  it('un usuario común recibe el mismo 404 que una ruta que no existe', async () => {
    const user = await register('curioso');
    const denied = await h.http.get(`${API}/admin/verifications`).set(auth(user.token)).expect(404);
    const missing = await h.http.get(`${API}/admin/no-existe`).set(auth(user.token)).expect(404);
    expect(denied.body.code).toBe(missing.body.code);
    expect(denied.body.message).toBe(`Cannot GET ${API}/admin/verifications`);
    await h.http
      .post(`${API}/admin/verifications/${randomUUID()}/approve`)
      .set(auth(user.token))
      .send({})
      .expect(404);
    await h.http.get(`${API}/admin/verifications`).expect(401);
  });

  it('/auth/me dice si la cuenta es admin (y no hay forma de volverse admin por la API)', async () => {
    expect((await h.http.get(`${API}/auth/me`).set(auth(admin.token)).expect(200)).body.isAdmin).toBe(true);
    const user = await register('comun');
    expect((await h.http.get(`${API}/auth/me`).set(auth(user.token)).expect(200)).body.isAdmin).toBe(false);
    // Campos desconocidos se rechazan: no se puede colar isAdmin al registrarse.
    await h.http
      .post(`${API}/auth/register`)
      .send({
        firstName: 'x',
        lastName: 'y',
        email: `x-${randomUUID().slice(0, 8)}@test.dev`,
        password: PASSWORD,
        isAdmin: true,
      })
      .expect(400);
  });

  it('lista pendientes con el total, muestra el detalle y aprueba con vencimiento', async () => {
    const p = await gasPro('aprobable');
    const list = await h.http.get(`${API}/admin/verifications`).set(auth(admin.token)).expect(200);
    expect(list.body.pendingCount).toBe(list.body.items.length);
    expect(list.body.pendingCount).toBeGreaterThanOrEqual(1);

    const detail = await h.http
      .get(`${API}/admin/verifications/${p.verificationId}`)
      .set(auth(admin.token))
      .expect(200);
    expect(detail.body.item).toMatchObject({
      reference: 'Mat. N.º 4218',
      service: 'Gas',
      serviceSlug: 'gas',
      status: 'PENDING',
    });
    expect(detail.body.documentUrl).toBeNull();
    expect(detail.body.history).toEqual([]);
    expect(await gasSearch()).not.toContain(p.proId);

    const approved = await h.http
      .post(`${API}/admin/verifications/${p.verificationId}/approve`)
      .set(auth(admin.token))
      .send({ expiresAt: '2030-06-30' })
      .expect(200);
    expect(approved.body).toMatchObject({ status: 'VERIFIED', reviewedBy: admin.email });
    expect(new Date(approved.body.expiresAt).toISOString()).toBe('2030-07-01T02:59:59.000Z');
    expect(await gasSearch()).toContain(p.proId);

    const reviewed = await h.http
      .get(`${API}/admin/verifications`)
      .query({ status: 'reviewed' })
      .set(auth(admin.token))
      .expect(200);
    expect(reviewed.body.items.map((v: { id: string }) => v.id)).toContain(p.verificationId);
    expect(typeof reviewed.body.pendingCount).toBe('number');
  });

  it('rechaza con motivo legible; el profesional lo ve y el reenvío trae el historial', async () => {
    const p = await gasPro('rechazable', 'Mat. 999');
    await h.http
      .post(`${API}/admin/verifications/${p.verificationId}/reject`)
      .set(auth(admin.token))
      .send({ reason: 'no' })
      .expect(400);
    await h.http
      .post(`${API}/admin/verifications/${p.verificationId}/reject`)
      .set(auth(admin.token))
      .send({ reason: 'El número no figura en el registro de Camuzzi.' })
      .expect(200);

    const me = (await h.http.get(`${API}/pro/me`).set(auth(p.token)).expect(200)).body;
    expect(me.verificationRequests[0]).toMatchObject({
      status: 'REJECTED',
      rejectionReason: 'El número no figura en el registro de Camuzzi.',
    });
    expect(JSON.stringify(me)).not.toContain(admin.email);

    await h.http
      .post(`${API}/pro/verifications`)
      .set(auth(p.token))
      .send({ type: 'LICENSE', serviceId: svc.gas, reference: 'Mat. 4219' })
      .expect(201);
    const list = await h.http.get(`${API}/admin/verifications`).set(auth(admin.token)).expect(200);
    const again = list.body.items.find((v: { professionalId: string }) => v.professionalId === p.proId);
    const detail = await h.http
      .get(`${API}/admin/verifications/${again.id}`)
      .set(auth(admin.token))
      .expect(200);
    expect(detail.body.history).toEqual([
      expect.objectContaining({
        status: 'REJECTED',
        reference: 'Mat. 999',
        rejectionReason: 'El número no figura en el registro de Camuzzi.',
      }),
    ]);
  });

  it('dos decisiones a la vez: gana una sola y la otra recibe 409', async () => {
    const p = await gasPro('carrera');
    const url = `${API}/admin/verifications/${p.verificationId}`;
    const [a, b] = await Promise.all([
      h.http.post(`${url}/approve`).set(auth(admin.token)).send({}),
      h.http
        .post(`${url}/reject`)
        .set(auth(admin.token))
        .send({ reason: 'El número no coincide con el nombre.' }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const loser = a.status === 409 ? a : b;
    expect(loser.body.code).toBe('VERIFICATION_ALREADY_REVIEWED');
    // La decisión que ganó queda intacta.
    const final = (await h.http.get(url).set(auth(admin.token)).expect(200)).body.item.status;
    expect(final).toBe(a.status === 200 ? 'VERIFIED' : 'REJECTED');
  });

  it('valida el vencimiento, el id y que exista', async () => {
    const p = await gasPro('fechas');
    const url = `${API}/admin/verifications/${p.verificationId}`;
    await h.http.post(`${url}/approve`).set(auth(admin.token)).send({ expiresAt: '2020-01-01' }).expect(422);
    await h.http.post(`${url}/approve`).set(auth(admin.token)).send({ expiresAt: 'mañana' }).expect(400);
    await h.http.get(`${API}/admin/verifications/no-es-un-uuid`).set(auth(admin.token)).expect(400);
    await h.http.get(`${API}/admin/verifications/${randomUUID()}`).set(auth(admin.token)).expect(404);
  });

  it('con documento: link temporal y se puede borrar después de decidir', async () => {
    const user = await register('condoc');
    const profile = await h.http
      .post(`${API}/pro/profile`)
      .set(auth(user.token))
      .send({
        headline: 'Gasista con doc',
        yearsExperience: 2,
        serviceIds: [svc.gas],
        coversEntireCity: true,
      })
      .expect(201);
    const ticket = await h.http
      .post(`${API}/pro/verifications/upload`)
      .set(auth(user.token))
      .send({ serviceId: svc.gas })
      .expect(201);
    h.storage.upload(ticket.body.publicId, 'pdf', 300_000);
    await h.http
      .post(`${API}/pro/verifications`)
      .set(auth(user.token))
      .send({
        type: 'LICENSE',
        serviceId: svc.gas,
        reference: 'Mat. 77',
        documentPublicId: ticket.body.publicId,
      })
      .expect(201);
    const list = await h.http.get(`${API}/admin/verifications`).set(auth(admin.token)).expect(200);
    const id = list.body.items.find(
      (v: { professionalId: string }) => v.professionalId === profile.body.id,
    ).id;
    const url = `${API}/admin/verifications/${id}`;

    const detail = await h.http.get(url).set(auth(admin.token)).expect(200);
    expect(detail.body.documentUrl).toContain('signature=');
    expect(detail.body.item.document).toEqual({ format: 'pdf', bytes: 300_000 });

    await h.http.post(`${url}/purge-document`).set(auth(admin.token)).expect(409);
    await h.http.post(`${url}/approve`).set(auth(admin.token)).send({}).expect(200);
    const purged = await h.http.post(`${url}/purge-document`).set(auth(admin.token)).expect(200);
    expect(purged.body.document).toBeNull();
    expect(h.storage.destroyed).toContain(ticket.body.publicId);
  });

  it('quitar el rol corta el acceso al instante, aun con el mismo token', async () => {
    const other = await register('temporal');
    const repo = h.dataSource.getRepository(User);
    await repo.update({ email: other.email }, { isAdmin: true });
    await h.http.get(`${API}/admin/verifications`).set(auth(other.token)).expect(200);
    await repo.update({ email: other.email }, { isAdmin: false });
    await h.http.get(`${API}/admin/verifications`).set(auth(other.token)).expect(404);
  });
});
