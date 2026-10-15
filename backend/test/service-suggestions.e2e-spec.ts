import { randomUUID } from 'crypto';
import { describeE2E, Harness, startApp } from './app.harness';

const API = '/api/v1';
describeE2E('Oficios sugeridos y aprobación administrativa (e2e)', () => {
  let h: Harness;
  let admin: string;
  let categoryId: string;
  let existingId: string;
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  async function user(isAdmin = false) {
    const email = `oficio-${randomUUID()}@test.dev`;
    const response = await h.http.post(`${API}/auth/register`).send({ firstName: 'Oficio', lastName: 'Prueba', email, password: 'una-clave-bien-larga' }).expect(201);
    if (isAdmin) await h.dataSource.query(`UPDATE users SET is_admin = true WHERE email = $1`, [email]);
    return response.body.accessToken as string;
  }
  const suggest = (token: string, name: string) => h.http.post(`${API}/service-suggestions`).set(auth(token)).send({ name });
  const approve = (id: string, body: Record<string, unknown>, token = admin) => h.http.post(`${API}/admin/service-suggestions/${id}/approve`).set(auth(token)).send(body);
  const reject = (id: string, reason: string) => h.http.post(`${API}/admin/service-suggestions/${id}/reject`).set(auth(admin)).send({ reason });

  beforeAll(async () => {
    h = await startApp({ emailVerification: false });
    admin = await user(true);
    const [category] = (await h.http.get(`${API}/categories`).expect(200)).body;
    categoryId = category.id; existingId = category.services[0].id;
  }, 60000);
  afterAll(async () => { await h?.app.close(); });

  it('exige cuenta, permite sugerir antes de tener perfil y oculta la administración al resto', async () => {
    const token = await user();
    await h.http.get(`${API}/service-suggestions`).expect(401);
    await h.http.post(`${API}/service-suggestions`).send({ name: 'Corta pastos' }).expect(401);
    await h.http.get(`${API}/admin/service-suggestions`).set(auth(token)).expect(404);
    await approve(randomUUID(), { serviceId: existingId }, token).expect(404);
    const row = (await suggest(token, 'Corta pastos').expect(201)).body;
    expect(row).toMatchObject({ name: 'Corta pastos', status: 'PENDING', serviceId: null });
    expect((await h.http.get(`${API}/service-suggestions`).set(auth(await user())).expect(200)).body).toEqual([]);
    const services = (await h.http.get(`${API}/services`).expect(200)).body;
    expect(services.some((s: { name: string }) => s.name === 'Corta pastos')).toBe(false);
  });

  it('aprueba con un nombre corregido y permite completar el alta con el oficio real', async () => {
    const token = await user();
    const row = (await suggest(token, 'Corte de césped residencial').expect(201)).body;
    const reviewed = (await approve(row.id, { name: 'Corte de césped', categoryId, requiresLicense: false }).expect(201)).body;
    expect(reviewed).toMatchObject({ status: 'APPROVED', serviceName: 'Corte de césped', serviceActive: true });
    expect(reviewed.reviewedAt).toBeTruthy();
    const service = (await h.http.get(`${API}/services/corte-de-cesped`).expect(200)).body;
    expect(service).toMatchObject({ id: reviewed.serviceId, name: 'Corte de césped', requiresLicense: false });
    expect((await h.http.get(`${API}/categories`).expect(200)).body.find((c: { id: string }) => c.id === categoryId).services.some((s: { id: string }) => s.id === service.id)).toBe(true);
    const [zone] = (await h.http.get(`${API}/zones?city=tandil`).expect(200)).body;
    await h.http.post(`${API}/pro/profile`).set(auth(token)).send({ headline: 'Corto el pasto en Tandil', yearsExperience: 2, serviceIds: [service.id], zoneIds: [zone.id] }).expect(201);
    const profile = (await h.http.get(`${API}/pro/me`).set(auth(token)).expect(200)).body;
    expect(profile.offeredServices.some((s: { id: string }) => s.id === service.id)).toBe(true);
    expect((await h.http.get(`${API}/service-suggestions`).set(auth(token)).expect(200)).body[0].serviceName).toBe('Corte de césped');
    await approve(row.id, { serviceId: existingId }).expect(409);
    await reject(row.id, 'Ya revisado').expect(409);
  });

  it('evita duplicar el catálogo y permite vincular propuestas equivalentes', async () => {
    const token = await user();
    const row = (await suggest(token, 'Cortar césped').expect(201)).body;
    const before = (await h.http.get(`${API}/services`).expect(200)).body.length;
    await approve(row.id, { name: 'CORTE DE CESPED', categoryId, requiresLicense: false }).expect(409);
    await approve(row.id, { serviceId: existingId, name: 'No mezclar modos' }).expect(422);
    await approve(row.id, { serviceId: existingId }).expect(201);
    expect((await h.http.get(`${API}/services`).expect(200)).body).toHaveLength(before);
  });

  it('rechaza con motivo y no revela otras cuentas ni datos administrativos', async () => {
    const token = await user();
    const row = (await suggest(token, 'Servicio de prueba rechazado').expect(201)).body;
    await reject(row.id, '').expect(400);
    await reject(row.id, 'No corresponde a un oficio de servicios.').expect(201);
    const result = (await h.http.get(`${API}/service-suggestions`).set(auth(token)).expect(200)).body[0];
    expect(result).toMatchObject({ status: 'REJECTED', reason: 'No corresponde a un oficio de servicios.', serviceId: null });
    expect(result).not.toHaveProperty('reviewedBy'); expect(result).not.toHaveProperty('userId');
    const list = await h.http.get(`${API}/admin/service-suggestions?status=REJECTED&page=1`).set(auth(admin)).expect(200);
    expect(list.body.items.some((i: { id: string }) => i.id === row.id)).toBe(true);
    await h.http.get(`${API}/admin/service-suggestions?page=0`).set(auth(admin)).expect(400);
  });

  it('valida texto, categorías, oficios y matrícula sin modificar el catálogo ante errores', async () => {
    const token = await user();
    for (const name of [null, 42, '', 'ab', 'x'.repeat(81)]) await suggest(token, name as string).expect(400);
    for (const name of ['Consulta www.ejemplo.com', 'Escribir a prueba@example.com', '<script>alert</script>']) await suggest(token, name).expect(422);
    const row = (await suggest(token, 'Nuevo oficio valido').expect(201)).body;
    await approve(row.id, { name: 'Nuevo oficio valido', categoryId, requiresLicense: null }).expect(400);
    await approve(row.id, { name: 'Nuevo oficio valido', categoryId }).expect(422);
    await approve(row.id, { name: 'Nuevo oficio valido', categoryId: randomUUID(), requiresLicense: false }).expect(422);
    await approve(row.id, { serviceId: randomUUID() }).expect(422);
    await approve(randomUUID(), { serviceId: existingId }).expect(404);
  });

  it('deduplica reintentos simultáneos y limita pendientes y sugerencias recientes por cuenta', async () => {
    const token = await user();
    const responses = await Promise.all([suggest(token, 'Riego especializado'), suggest(token, '  RIEGO   ESPECIALIZADO  ')]);
    expect(responses.map((r) => r.status)).toEqual([201, 201]);
    expect(responses[0].body.id).toBe(responses[1].body.id);
    for (let i = 0; i < 4; i++) await suggest(token, `Oficio pendiente ${i}`).expect(201);
    await suggest(token, 'Sexto oficio pendiente').expect(409);
    const rows = (await h.http.get(`${API}/service-suggestions`).set(auth(token)).expect(200)).body;
    for (const row of rows) await reject(row.id, 'No corresponde al catálogo').expect(201);
    for (let i = 0; i < 5; i++) {
      const row = (await suggest(token, `Oficio posterior ${i}`).expect(201)).body;
      await reject(row.id, 'No corresponde al catálogo').expect(201);
    }
    await suggest(token, 'Undecimo oficio del mes').expect(409);
  });

  it('dos revisiones simultáneas producen un único resultado y la baja borra las sugerencias propias', async () => {
    const token = await user();
    const row = (await suggest(token, 'Oficio de revision simultanea').expect(201)).body;
    const responses = await Promise.all([approve(row.id, { serviceId: existingId }), reject(row.id, 'No corresponde')]);
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
    await h.http.post(`${API}/account/delete`).set(auth(token)).send({ password: 'una-clave-bien-larga' }).expect(200);
    expect((await h.dataSource.query(`SELECT id FROM service_suggestions WHERE id = $1`, [row.id]))).toEqual([]);
  });

  it('conserva visibles todas las pendientes aunque el historial revisado sea largo', async () => {
    const token = await user();
    const row = (await suggest(token, 'Oficio pendiente antiguo').expect(201)).body;
    await h.dataSource.query(`UPDATE service_suggestions SET created_at = now() - interval '90 days' WHERE id = $1`, [row.id]);
    await h.dataSource.query(`INSERT INTO service_suggestions(user_id, name, name_key, status, service_id, reviewed_at)
      SELECT user_id, 'Oficio revisado ' || i, 'revisado-' || i, 'APPROVED', $2, now()
      FROM service_suggestions CROSS JOIN generate_series(1,35) i WHERE id = $1`, [row.id, existingId]);
    const result = (await h.http.get(`${API}/service-suggestions`).set(auth(token)).expect(200)).body;
    expect(result).toHaveLength(30);
    expect(result[0]).toMatchObject({ id: row.id, status: 'PENDING' });
  });
});
