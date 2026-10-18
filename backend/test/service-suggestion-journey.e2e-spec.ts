import { randomUUID } from 'crypto';
import { describeE2E, Harness, startApp } from './app.harness';

const API = '/api/v1';
/** Recorrido profesional → admin → profesional de un oficio sugerido (hallazgo 10 de la auditoría). */
describeE2E('Oficio sugerido: alta sin publicar, resolución y avisos (e2e)', () => {
  let h: Harness;
  let admin: string;
  let categoryId: string;
  let existing: { id: string; name: string };
  let zoneId: string;
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function user(isAdmin = false) {
    const email = `sugerido-${randomUUID()}@test.dev`;
    const response = await h.http.post(`${API}/auth/register`).send({ firstName: 'Sugerido', lastName: 'Prueba', email, password: 'una-clave-bien-larga' }).expect(201);
    if (isAdmin) await h.dataSource.query(`UPDATE users SET is_admin = true WHERE email = $1`, [email]);
    return response.body.accessToken as string;
  }
  const suggest = (token: string, name: string) => h.http.post(`${API}/service-suggestions`).set(auth(token)).send({ name });
  const approve = (id: string, body: Record<string, unknown>) => h.http.post(`${API}/admin/service-suggestions/${id}/approve`).set(auth(admin)).send(body);
  const reject = (id: string, reason: string) => h.http.post(`${API}/admin/service-suggestions/${id}/reject`).set(auth(admin)).send({ reason });
  const create = (token: string, serviceIds: string[]) =>
    h.http.post(`${API}/pro/profile`).set(auth(token)).send({ headline: 'Hago lo que sé', yearsExperience: 3, serviceIds, zoneIds: [zoneId] });
  const me = async (token: string) => (await h.http.get(`${API}/pro/me`).set(auth(token)).expect(200)).body;
  const notices = async (token: string) =>
    (await h.http.get(`${API}/me/notifications`).query({ audience: 'PROFESSIONAL', pageSize: 50 }).set(auth(token)).expect(200)).body.items as {
      type: string; route: string; readAt: string | null; suggestion: Record<string, unknown> | null;
    }[];
  const listed = async (slug: string) => {
    for (let page = 1; ; page++) {
      const { items, total } = (await h.http.get(`${API}/professionals`).query({ page, pageSize: 50 }).expect(200)).body as { items: { slug: string }[]; total: number };
      if (items.some((p) => p.slug === slug)) return true;
      if (page * 50 >= total) return false;
    }
  };

  beforeAll(async () => {
    h = await startApp({ emailVerification: false });
    admin = await user(true);
    const [category] = (await h.http.get(`${API}/categories`).expect(200)).body;
    categoryId = category.id;
    existing = category.services[0];
    zoneId = (await h.http.get(`${API}/zones?city=tandil`).expect(200)).body[0].id;
  }, 60000);
  afterAll(async () => { await h?.app.close(); });

  it('sin oficios solo se crea el perfil con una sugerencia pendiente, y queda sin publicar', async () => {
    const token = await user();
    await create(token, []).expect(422);
    await suggest(token, 'Armado de pérgolas').expect(201);
    const created = (await create(token, []).expect(201)).body;
    expect(created.offeredServices).toEqual([]);
    expect(created.publication).toMatchObject({ published: false, blockers: ['NO_SERVICE'], pendingSuggestions: [{ name: 'Armado de pérgolas' }] });
    expect(created.featured).toMatchObject({ eligible: false });
    // Ya es profesional y puede entrar al panel, aunque la ficha todavía no sea pública.
    const account = (await h.http.get(`${API}/auth/me`).set(auth(token)).expect(200)).body;
    expect(account.professionalProfileId).toBe(created.id);
    expect((await me(token)).publication.published).toBe(false);
    // No aparece en la búsqueda general ni tiene ficha pública (ni por enlace).
    expect(await listed(created.slug)).toBe(false);
    await h.http.get(`${API}/professionals/public/${created.slug}`).expect(404);
    await h.http.get(`${API}/professionals/${created.id}`).expect(404);
    const sitemap = (await h.http.get(`${API}/professionals/sitemap`).expect(200)).body as { slug: string }[];
    expect(sitemap.some((p) => p.slug === created.slug)).toBe(false);
    // Un perfil nuevo con servicios existentes no cambia.
    const regular = (await create(await user(), [existing.id]).expect(201)).body;
    expect(regular.publication).toMatchObject({ published: true, blockers: [], pendingSuggestions: [] });
    expect(await listed(regular.slug)).toBe(true);
  });

  it('aprobar un oficio nuevo lo suma al perfil vacío, lo publica y avisa con una acción para continuar', async () => {
    const token = await user();
    const row = (await suggest(token, 'Instalación de toldos').expect(201)).body;
    const created = (await create(token, []).expect(201)).body;
    await approve(row.id, { name: 'Toldos', categoryId, requiresLicense: false }).expect(201);
    const profile = await me(token);
    expect(profile.offeredServices.map((s: { name: string }) => s.name)).toEqual(['Toldos']);
    expect(profile.publication).toMatchObject({ published: true, blockers: [], pendingSuggestions: [] });
    // Ya cargó titular, años y cobertura: no se vuelve a pedir nada.
    expect(profile).toMatchObject({ headline: 'Hago lo que sé', yearsExperience: 3 });
    expect(await listed(created.slug)).toBe(true);
    await h.http.get(`${API}/professionals/public/${created.slug}`).expect(200);
    const [notice] = await notices(token);
    expect(notice).toMatchObject({
      type: 'PRO_SERVICE_SUGGESTION_APPROVED',
      route: '/pro/dashboard',
      readAt: null,
      suggestion: { name: 'Instalación de toldos', serviceName: 'Toldos', linked: false, attached: true, published: true },
    });
  });

  it('vincular con un oficio existente también lo suma, sin duplicar el catálogo', async () => {
    const token = await user();
    const row = (await suggest(token, 'Lo mismo pero con otro nombre').expect(201)).body;
    await create(token, []).expect(201);
    const before = (await h.http.get(`${API}/services`).expect(200)).body.length;
    await approve(row.id, { serviceId: existing.id }).expect(201);
    expect((await h.http.get(`${API}/services`).expect(200)).body).toHaveLength(before);
    expect((await me(token)).offeredServices.map((s: { id: string }) => s.id)).toEqual([existing.id]);
    expect((await notices(token))[0]).toMatchObject({ suggestion: { serviceName: existing.name, linked: true, attached: true, published: true } });
  });

  it('la aprobación no saltea los demás requisitos: con el perfil pausado se suma pero no se publica', async () => {
    const token = await user();
    const row = (await suggest(token, 'Oficio con perfil pausado').expect(201)).body;
    const created = (await create(token, []).expect(201)).body;
    await h.http.patch(`${API}/pro/status`).set(auth(token)).send({ status: 'PAUSED' }).expect(200);
    await approve(row.id, { serviceId: existing.id }).expect(201);
    const profile = await me(token);
    expect(profile.offeredServices).toHaveLength(1);
    expect(profile.publication).toMatchObject({ published: false, blockers: ['PAUSED'] });
    expect(await listed(created.slug)).toBe(false);
    expect((await notices(token))[0]).toMatchObject({
      route: '/pro/perfil',
      suggestion: { attached: true, published: false },
    });
  });

  it('rechazar explica el motivo, deja el perfil sin publicar y se corrige eligiendo otro oficio', async () => {
    const token = await user();
    const row = (await suggest(token, 'Oficio que no corresponde').expect(201)).body;
    const created = (await create(token, []).expect(201)).body;
    await reject(row.id, 'Ya existe como Plomería; elegilo de la lista.').expect(201);
    const profile = await me(token);
    expect(profile.publication).toMatchObject({ published: false, blockers: ['NO_SERVICE'], pendingSuggestions: [] });
    expect((await notices(token))[0]).toMatchObject({
      type: 'PRO_SERVICE_SUGGESTION_REJECTED',
      route: '/pro/perfil?editar=services',
      suggestion: { name: 'Oficio que no corresponde', reason: 'Ya existe como Plomería; elegilo de la lista.' },
    });
    // No puede quedar sin ningún servicio por la edición: elige otro y se publica.
    await h.http.patch(`${API}/pro/profile`).set(auth(token)).send({ serviceIds: [] }).expect(400);
    await h.http.patch(`${API}/pro/profile`).set(auth(token)).send({ serviceIds: [existing.id] }).expect(200);
    expect((await me(token)).publication.published).toBe(true);
    expect(await listed(created.slug)).toBe(true);
  });

  it('quien ya tiene oficios aprobados conserva su perfil: la aprobación no cambia sus servicios', async () => {
    const token = await user();
    const [, second] = (await h.http.get(`${API}/categories`).expect(200)).body.flatMap((c: { services: { id: string }[] }) => c.services);
    const created = (await create(token, [existing.id]).expect(201)).body;
    const row = (await suggest(token, 'Oficio adicional').expect(201)).body;
    expect((await me(token)).publication).toMatchObject({ published: true, pendingSuggestions: [] });
    await approve(row.id, { serviceId: second.id }).expect(201);
    const profile = await me(token);
    expect(profile.offeredServices.map((s: { id: string }) => s.id)).toEqual([existing.id]);
    expect(await listed(created.slug)).toBe(true);
    expect((await notices(token))[0]).toMatchObject({
      type: 'PRO_SERVICE_SUGGESTION_APPROVED',
      route: '/pro/perfil?editar=services',
      suggestion: { attached: false },
    });
    // Rechazar a quien ya tiene oficios tampoco lo despublica.
    const other = (await suggest(token, 'Otro oficio más').expect(201)).body;
    await reject(other.id, 'No corresponde al catálogo.').expect(201);
    expect(await listed(created.slug)).toBe(true);
  });

  it('el aviso es solo del dueño y se resuelve una vez', async () => {
    const token = await user();
    const stranger = await user();
    const row = (await suggest(token, 'Oficio con aviso único').expect(201)).body;
    await approve(row.id, { serviceId: existing.id }).expect(201);
    await approve(row.id, { serviceId: existing.id }).expect(409);
    const count = (await h.dataSource.query(`SELECT count(*)::int AS n FROM notifications WHERE type::text LIKE 'PRO_SERVICE_SUGGESTION_%'
      AND dedupe_key LIKE $1`, [`%:${row.id}`]))[0].n;
    expect(count).toBe(1);
    expect(await h.http.get(`${API}/me/notifications`).query({ audience: 'PROFESSIONAL' }).set(auth(stranger)).expect(200).then((r) => r.body.items)).toEqual([]);
  });
});
