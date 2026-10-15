import { randomUUID } from 'crypto';
import { describeE2E, Harness, startApp } from './app.harness';

const API = '/api/v1';
const PASSWORD = 'una-clave-bien-larga';

/**
 * "Trabajos realizados": trabajos (Free 1 / PRO 10 activos) con hasta 5 fotos
 * públicas cada uno, subidas firmadas a Cloudinary (doble en memoria),
 * validadas con el proveedor, con los topes garantizados en el backend
 * (también con confirmaciones simultáneas).
 */
describeE2E('Trabajos realizados — trabajos y fotos (e2e)', () => {
  let h: Harness;
  const svc: Record<string, string> = {};
  const zone: Record<string, string> = {};
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function pro(label: string) {
    const email = `${label}-${randomUUID().slice(0, 8)}@test.dev`;
    const reg = await h.http
      .post(`${API}/auth/register`)
      .send({ firstName: label, lastName: 'Fotos', email, password: PASSWORD })
      .expect(201);
    const token = reg.body.accessToken as string;
    const res = await h.http
      .post(`${API}/pro/profile`)
      .set(auth(token))
      .send({ headline: `${label} en Tandil`, yearsExperience: 3, serviceIds: [svc.plomeria], zoneIds: [zone.centro] })
      .expect(201);
    return { token, proId: res.body.id as string };
  }
  type Pro = Awaited<ReturnType<typeof pro>>;
  type Work = { id: string; title: string; description: string | null; doneOn: string; archivedByPlan: boolean; photos: Photo[] };
  type Photo = { id: string; caption: string | null; sortOrder: number; archivedByPlan: boolean; url: string };

  const setPlan = (p: Pro, tier: 'PRO' | 'FREE') =>
    h.dataSource.query(`UPDATE professional_profiles SET plan_tier = $2 WHERE id = $1`, [p.proId, tier]);
  const list = async (p: Pro) => (await h.http.get(`${API}/pro/profile/works`).set(auth(p.token)).expect(200)).body;
  const createWork = (p: Pro, body: Record<string, unknown>) => h.http.post(`${API}/pro/profile/works`).set(auth(p.token)).send(body);
  /** Crea un trabajo y devuelve su id. */
  async function work(p: Pro, title = 'Casa 1', doneOn = '2026-03') {
    const res = await createWork(p, { title, doneOn }).expect(201);
    return (res.body.items as Work[]).find((w) => w.title === title && w.doneOn === doneOn)!.id;
  }
  const sign = (p: Pro, workId: string) => h.http.post(`${API}/pro/profile/work-photos/sign`).set(auth(p.token)).send({ workId });
  const confirm = (p: Pro, workId: string, publicId: string, caption?: string | null) =>
    h.http.post(`${API}/pro/profile/work-photos`).set(auth(p.token)).send({ workId, publicId, caption });
  /** Firma + "sube" a Cloudinary (doble) + confirma. */
  async function upload(p: Pro, workId: string, caption?: string, format = 'jpg') {
    const signed = await sign(p, workId);
    if (signed.status !== 201) return { publicId: null, res: signed };
    const { publicId } = signed.body;
    h.avatars.upload(publicId, format);
    return { publicId, res: await confirm(p, workId, publicId, caption) };
  }
  const workIn = (body: { items: Work[] }, id: string) => body.items.find((w) => w.id === id)!;
  const publicWorks = async (p: Pro) => (await h.http.get(`${API}/professionals/${p.proId}`).expect(200)).body.works;

  beforeAll(async () => {
    h = await startApp({ emailVerification: false });
    for (const s of (await h.http.get(`${API}/services`).expect(200)).body) svc[s.slug] = s.id;
    for (const z of (await h.http.get(`${API}/zones?city=tandil`).expect(200)).body) zone[z.slug] = z.id;
  }, 60_000);

  afterAll(async () => {
    await h?.app.close();
  });

  it('crear un trabajo: nombre y mes normalizados, descripción opcional; sin trabajos → lista vacía con los topes', async () => {
    const p = await pro('alta');
    expect(await list(p)).toMatchObject({ items: [], maxWorks: 1, activeWorks: 0, maxStoredWorks: 30, photosPerWork: 5, activePhotos: 0 });
    const res = await createWork(p, { title: '  Casa \n 1 ', description: ' Baño   completo ', doneOn: '2026-03' }).expect(201);
    expect(res.body.items).toEqual([
      { id: expect.any(String), title: 'Casa 1', description: 'Baño completo', doneOn: '2026-03', archivedByPlan: false, pinned: false, beforePhotoId: null, afterPhotoId: null, photos: [] },
    ]);
    expect(res.body.activeWorks).toBe(1);
  });

  it('datos inválidos → 422 INVALID_WORK con el campo', async () => {
    const p = await pro('invalido');
    const cases: [Record<string, unknown>, string][] = [
      [{ title: 'x', doneOn: '2026-03' }, 'title'],
      [{ title: 'Casa 249 444-5566', doneOn: '2026-03' }, 'title'],
      [{ title: 'Casa 1', description: 'Escribime a juan@gmail.com', doneOn: '2026-03' }, 'description'],
      [{ title: 'Casa 1', description: 'x'.repeat(161), doneOn: '2026-03' }, 'description'],
      [{ title: 'Casa 1', doneOn: '2999-01' }, 'doneOn'],
      [{ title: 'Casa 1', doneOn: '2026-13' }, 'doneOn'],
      [{ title: 'Casa 1', doneOn: '1979-12' }, 'doneOn'],
    ];
    for (const [body, field] of cases) {
      const res = await createWork(p, body).expect(422);
      expect(res.body.code).toBe('INVALID_WORK');
      expect(res.body.details.field).toBe(field);
    }
    // Sin fecha: el DTO lo rechaza antes.
    await createWork(p, { title: 'Casa 1' }).expect(400);
    expect((await list(p)).items).toHaveLength(0);
  });

  it('FREE: 1 trabajo con hasta 5 fotos; el 2º trabajo y la 6ª foto → 409 antes y después de subir', async () => {
    const p = await pro('free');
    const id = await work(p);
    for (let i = 0; i < 5; i++) expect((await upload(p, id, i === 0 ? 'Antes' : undefined)).res.status).toBe(201);
    const body = await list(p);
    expect(body).toMatchObject({ maxWorks: 1, activeWorks: 1, activePhotos: 5 });
    const photos = workIn(body, id).photos;
    expect(photos.map((x) => x.sortOrder)).toEqual([0, 1, 2, 3, 4]);
    expect(photos[0].caption).toBe('Antes');
    expect(photos[0].url).toContain('c_limit,w_1600,h_1600,q_auto,f_auto');
    expect(Object.keys(photos[0]).sort()).toEqual(['archivedByPlan', 'caption', 'id', 'sortOrder', 'url']);

    const blocked = await sign(p, id).expect(409);
    expect(blocked.body).toMatchObject({ code: 'WORK_PHOTOS_LIMIT_REACHED', details: { max: 5 } });
    const extra = `resuelve/professional-work/${p.proId}/${randomUUID()}`;
    h.avatars.upload(extra);
    expect((await confirm(p, id, extra).expect(409)).body.code).toBe('WORK_PHOTOS_LIMIT_REACHED');
    expect(h.avatars.destroyed).toContain(extra); // no queda huérfana en Cloudinary

    const second = await createWork(p, { title: 'Casa 2', doneOn: '2026-04' }).expect(409);
    expect(second.body).toMatchObject({ code: 'WORKS_LIMIT_REACHED', details: { max: 1, activeCount: 1 } });
    expect((await list(p)).items).toHaveLength(1);
  });

  it('PRO: hasta 10 trabajos de 5 fotos; el 11º → 409', async () => {
    const p = await pro('diez');
    await setPlan(p, 'PRO');
    for (let i = 1; i <= 10; i++) await work(p, `Trabajo ${i}`, `2025-${String(i).padStart(2, '0')}`);
    const body = await list(p);
    expect(body).toMatchObject({ maxWorks: 10, activeWorks: 10 });
    // Del más reciente al más viejo.
    expect(body.items.map((w: Work) => w.title).slice(0, 3)).toEqual(['Trabajo 10', 'Trabajo 9', 'Trabajo 8']);
    const eleventh = await createWork(p, { title: 'Trabajo 11', doneOn: '2025-11' }).expect(409);
    expect(eleventh.body.code).toBe('WORKS_LIMIT_REACHED');
    // 5 fotos por trabajo también en PRO.
    const id = body.items[0].id;
    for (let i = 0; i < 5; i++) await upload(p, id);
    expect((await sign(p, id).expect(409)).body.code).toBe('WORK_PHOTOS_LIMIT_REACHED');
  });

  it('perfil público: trabajos activos con fotos, del más reciente al más viejo, portada primero, sin datos internos', async () => {
    const p = await pro('publico');
    await setPlan(p, 'PRO');
    expect(await publicWorks(p)).toEqual([]);
    const old = await work(p, 'Departamento centro', '2024-11');
    const recent = await work(p, 'Casa 1', '2026-02');
    await work(p, 'Sin fotos todavía', '2026-05');
    await upload(p, old, 'Cocina');
    await upload(p, recent, 'Antes');
    await upload(p, recent, 'Después');
    const works = await publicWorks(p);
    expect(works.map((w: Work) => w.title)).toEqual(['Casa 1', 'Departamento centro']);
    expect(works[0]).toEqual({
      id: recent,
      title: 'Casa 1',
      pinned: false, beforePhotoId: null, afterPhotoId: null,
      description: null,
      doneOn: '2026-02',
      photos: [expect.objectContaining({ caption: 'Antes' }), expect.objectContaining({ caption: 'Después' })],
    });
    expect(Object.keys(works[0].photos[0]).sort()).toEqual(['caption', 'id', 'sortOrder', 'url']);
    const raw = JSON.stringify((await h.http.get(`${API}/professionals/${p.proId}`).expect(200)).body);
    expect(raw).not.toContain('publicId');
    expect(raw).not.toContain('archivedByPlan');
    // No bloquea la búsqueda: aparece igual con o sin fotos.
    const search = await h.http.get(`${API}/professionals`).query({ service: svc.plomeria, pageSize: 50 }).expect(200);
    expect(search.body.items.some((x: { id: string }) => x.id === p.proId)).toBe(true);
  });

  it('downgrade a Free: queda el trabajo más reciente con 5 fotos, el resto archivado (nunca borrado); en PRO se reactiva a mano', async () => {
    const p = await pro('downgrade');
    await setPlan(p, 'PRO');
    const older = await work(p, 'Casa vieja', '2025-01');
    const newer = await work(p, 'Casa nueva', '2026-01');
    await upload(p, older, 'Vieja');
    for (let i = 0; i < 3; i++) await upload(p, newer, `Nueva ${i}`);

    await setPlan(p, 'FREE');
    const free = await list(p);
    expect(free).toMatchObject({ maxWorks: 1, activeWorks: 1, activePhotos: 3 });
    expect(workIn(free, older).archivedByPlan).toBe(true);
    expect(workIn(free, older).photos).toHaveLength(1);
    expect((await publicWorks(p)).map((w: Work) => w.title)).toEqual(['Casa nueva']);
    // Un trabajo archivado no recibe fotos.
    expect((await sign(p, older).expect(409)).body.code).toBe('WORK_PHOTOS_LIMIT_REACHED');

    // Free elige cuál mostrar: reactivar uno reemplaza al que se muestra.
    const swapped = await h.http.patch(`${API}/pro/profile/works/${older}/restore`).set(auth(p.token)).send({}).expect(200);
    expect(workIn(swapped.body, older).archivedByPlan).toBe(false);
    expect(workIn(swapped.body, newer).archivedByPlan).toBe(true);
    expect((await publicWorks(p)).map((w: Work) => w.title)).toEqual(['Casa vieja']);
    // Leer de nuevo no lo deshace.
    expect(workIn(await list(p), older).archivedByPlan).toBe(false);

    await setPlan(p, 'PRO');
    const upgraded = await list(p);
    expect(upgraded.activeWorks).toBe(1); // nunca se reactiva solo
    await h.http.patch(`${API}/pro/profile/works/${newer}/restore`).set(auth(p.token)).send({}).expect(200);
    expect((await publicWorks(p)).map((w: Work) => w.title)).toEqual(['Casa nueva', 'Casa vieja']);
  });

  it('trabajo migrado con más de 5 fotos: en PRO se ven todas, no se le suman más; en Free se archivan las que pasan de 5 y se pueden mover', async () => {
    const p = await pro('legado');
    await setPlan(p, 'PRO');
    const [legacy] = await h.dataSource.query(
      `INSERT INTO professional_works (professional_id, title, done_on) VALUES ($1, 'Trabajos anteriores', '2025-06-01') RETURNING id`,
      [p.proId],
    );
    for (let i = 0; i < 8; i++)
      await h.dataSource.query(
        `INSERT INTO professional_work_photos (professional_id, work_id, public_id, image_url, sort_order) VALUES ($1, $2, $3, 'https://x.test/w.jpg', $4)`,
        [p.proId, legacy.id, `resuelve/professional-work/${p.proId}/${randomUUID()}`, i],
      );
    expect((await publicWorks(p))[0].photos).toHaveLength(8);
    expect((await sign(p, legacy.id).expect(409)).body.code).toBe('WORK_PHOTOS_LIMIT_REACHED');

    await setPlan(p, 'FREE');
    const free = await list(p);
    expect(workIn(free, legacy.id).photos.filter((x: Photo) => x.archivedByPlan)).toHaveLength(3);
    expect((await publicWorks(p))[0].photos).toHaveLength(5);

    // Repartir en PRO: mover una foto a un trabajo nuevo.
    await setPlan(p, 'PRO');
    const target = await work(p, 'Casa 2', '2026-01');
    const archived = workIn(await list(p), legacy.id).photos.find((x: Photo) => x.archivedByPlan)!;
    const moved = await h.http.patch(`${API}/pro/profile/work-photos/${archived.id}/move`).set(auth(p.token)).send({ workId: target }).expect(200);
    expect(workIn(moved.body, target).photos.map((x: Photo) => [x.id, x.archivedByPlan])).toEqual([[archived.id, false]]);
    expect(workIn(moved.body, legacy.id).photos.map((x: Photo) => x.sortOrder)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('confirmaciones simultáneas con 4 fotos en el trabajo → nunca más de 5', async () => {
    const p = await pro('carrera');
    const id = await work(p);
    for (let i = 0; i < 4; i++) await upload(p, id);
    const ids = [0, 1, 2].map(() => `resuelve/professional-work/${p.proId}/${randomUUID()}`);
    ids.forEach((publicId) => h.avatars.upload(publicId));
    const results = await Promise.all(ids.map((publicId) => confirm(p, id, publicId)));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(2);
    const rows = await h.dataSource.query(`SELECT count(*)::int AS n FROM professional_work_photos WHERE work_id = $1`, [id]);
    expect(rows[0].n).toBe(5);
  });

  it('confirmar dos veces la misma subida no la duplica', async () => {
    const p = await pro('doble');
    const id = await work(p);
    const { publicId } = await upload(p, id);
    await confirm(p, id, publicId!).expect(201);
    expect(workIn(await list(p), id).photos).toHaveLength(1);
  });

  it('formato o peso inválido → 422 INVALID_IMAGE y se borra del proveedor; carpeta ajena → 404', async () => {
    const p = await pro('formato');
    const id = await work(p);
    const gif = (await sign(p, id).expect(201)).body.publicId;
    h.avatars.upload(gif, 'gif');
    expect((await confirm(p, id, gif).expect(422)).body.code).toBe('INVALID_IMAGE');
    expect(h.avatars.destroyed).toContain(gif);

    const big = (await sign(p, id).expect(201)).body.publicId;
    h.avatars.upload(big, 'jpg', 9 * 1024 * 1024);
    expect((await confirm(p, id, big).expect(422)).body.code).toBe('INVALID_IMAGE');

    const other = await pro('ajeno');
    const theirWork = await work(other);
    const theirs = (await sign(other, theirWork).expect(201)).body.publicId;
    h.avatars.upload(theirs);
    await confirm(p, id, theirs).expect(404);
    await confirm(p, id, 'resuelve/avatars/x/y').expect(400);
    expect(workIn(await list(p), id).photos).toHaveLength(0);
  });

  it('descripción de la foto: hasta 80 caracteres, sin teléfonos ni emails; se edita y se borra', async () => {
    const p = await pro('caption');
    const id = await work(p);
    const long = await upload(p, id, 'x'.repeat(81));
    expect(long.res.status).toBe(422);
    expect(long.res.body.code).toBe('INVALID_CAPTION');
    expect((await upload(p, id, 'Llamame al 249 444-5566')).res.body.code).toBe('INVALID_CAPTION');

    await upload(p, id, 'Tablero nuevo');
    const [photo] = workIn(await list(p), id).photos;
    const edited = await h.http.patch(`${API}/pro/profile/work-photos/${photo.id}`).set(auth(p.token)).send({ caption: 'Tablero trifásico' }).expect(200);
    expect(workIn(edited.body, id).photos[0].caption).toBe('Tablero trifásico');
    const cleared = await h.http.patch(`${API}/pro/profile/work-photos/${photo.id}`).set(auth(p.token)).send({ caption: '   ' }).expect(200);
    expect(workIn(cleared.body, id).photos[0].caption).toBeNull();
  });

  it('editar el trabajo: nombre, descripción y fecha (reordena por fecha)', async () => {
    const p = await pro('editar');
    await setPlan(p, 'PRO');
    const a = await work(p, 'Casa 1', '2026-01');
    const b = await work(p, 'Casa 2', '2026-02');
    const res = await h.http
      .patch(`${API}/pro/profile/works/${a}`)
      .set(auth(p.token))
      .send({ title: 'Departamento Centro', description: 'Pintura completa', doneOn: '2026-06' })
      .expect(200);
    expect(res.body.items.map((w: Work) => w.id)).toEqual([a, b]);
    expect(workIn(res.body, a)).toMatchObject({ title: 'Departamento Centro', description: 'Pintura completa', doneOn: '2026-06' });
    const cleared = await h.http.patch(`${API}/pro/profile/works/${a}`).set(auth(p.token)).send({ description: null }).expect(200);
    expect(workIn(cleared.body, a)).toMatchObject({ title: 'Departamento Centro', description: null });
    expect((await h.http.patch(`${API}/pro/profile/works/${a}`).set(auth(p.token)).send({ title: '' }).expect(422)).body.code).toBe('INVALID_WORK');
  });

  it('reordenar dentro del trabajo persiste (la primera es la portada); incompleto o con fotos de otro trabajo → 422', async () => {
    const p = await pro('orden');
    await setPlan(p, 'PRO');
    const id = await work(p);
    const otherWork = await work(p, 'Casa 2', '2026-04');
    for (let i = 0; i < 3; i++) await upload(p, id, `Foto ${i}`);
    await upload(p, otherWork, 'Ajena');
    const ids = workIn(await list(p), id).photos.map((x: Photo) => x.id);
    const reversed = [...ids].reverse();
    await h.http.put(`${API}/pro/profile/work-photos/order`).set(auth(p.token)).send({ workId: id, ids: reversed }).expect(200);
    expect(workIn(await list(p), id).photos.map((x: Photo) => x.caption)).toEqual(['Foto 2', 'Foto 1', 'Foto 0']);
    expect((await publicWorks(p)).find((w: Work) => w.id === id).photos[0].caption).toBe('Foto 2');

    const bad = await h.http.put(`${API}/pro/profile/work-photos/order`).set(auth(p.token)).send({ workId: id, ids: ids.slice(0, 2) });
    expect(bad.status).toBe(422);
    expect(bad.body.code).toBe('INVALID_WORK_PHOTO_ORDER');
    const foreign = workIn(await list(p), otherWork).photos[0].id;
    await h.http.put(`${API}/pro/profile/work-photos/order`).set(auth(p.token)).send({ workId: id, ids: [ids[0], ids[1], foreign] }).expect(422);
  });

  it('mover una foto a otro trabajo: queda al final; destino lleno → 409', async () => {
    const p = await pro('mover');
    await setPlan(p, 'PRO');
    const from = await work(p, 'Casa 1', '2026-01');
    const to = await work(p, 'Casa 2', '2026-02');
    await upload(p, from, 'A');
    await upload(p, from, 'B');
    await upload(p, to, 'C');
    const [a] = workIn(await list(p), from).photos;
    const res = await h.http.patch(`${API}/pro/profile/work-photos/${a.id}/move`).set(auth(p.token)).send({ workId: to }).expect(200);
    expect(workIn(res.body, to).photos.map((x: Photo) => x.caption)).toEqual(['C', 'A']);
    expect(workIn(res.body, from).photos.map((x: Photo) => [x.caption, x.sortOrder])).toEqual([['B', 0]]);

    for (let i = 0; i < 3; i++) await upload(p, to);
    const [b] = workIn(await list(p), from).photos;
    expect((await h.http.patch(`${API}/pro/profile/work-photos/${b.id}/move`).set(auth(p.token)).send({ workId: to }).expect(409)).body.code).toBe(
      'WORK_PHOTOS_LIMIT_REACHED',
    );
  });

  it('borrar una foto: Cloudinary + base y el orden se compacta; si Cloudinary falla → 502 y la foto sigue', async () => {
    const p = await pro('borra');
    const id = await work(p);
    const uploaded = [];
    for (let i = 0; i < 3; i++) uploaded.push((await upload(p, id)).publicId);
    const photos = workIn(await list(p), id).photos;
    const res = await h.http.delete(`${API}/pro/profile/work-photos/${photos[1].id}`).set(auth(p.token)).expect(200);
    expect(workIn(res.body, id).photos.map((x: Photo) => x.sortOrder)).toEqual([0, 1]);
    expect(h.avatars.destroyed).toContain(uploaded[1]);

    h.avatars.failDestroys = 1;
    expect((await h.http.delete(`${API}/pro/profile/work-photos/${photos[0].id}`).set(auth(p.token)).expect(502)).body.code).toBe(
      'WORK_PHOTO_DELETE_FAILED',
    );
    expect(workIn(await list(p), id).photos).toHaveLength(2);
  });

  it('borrar un trabajo borra sus fotos en Cloudinary; si falla a mitad, queda lo que falta y se reintenta; después se puede crear otro', async () => {
    const p = await pro('borratrabajo');
    const id = await work(p);
    const ids = [(await upload(p, id)).publicId, (await upload(p, id)).publicId];
    h.avatars.failDestroys = 1;
    await h.http.delete(`${API}/pro/profile/works/${id}`).set(auth(p.token)).expect(502);
    expect((await list(p)).items).toHaveLength(1);
    const res = await h.http.delete(`${API}/pro/profile/works/${id}`).set(auth(p.token)).expect(200);
    expect(res.body.items).toEqual([]);
    expect(h.avatars.destroyed).toEqual(expect.arrayContaining(ids));
    const rows = await h.dataSource.query(`SELECT count(*)::int AS n FROM professional_work_photos WHERE professional_id = $1`, [p.proId]);
    expect(rows[0].n).toBe(0);
    await work(p, 'Casa nueva', '2026-05');
  });

  it('solo el dueño: otra persona no puede tocar trabajos ni fotos (403); inexistente → 404; sin sesión → 401', async () => {
    const owner = await pro('duenio');
    const other = await pro('otro');
    const id = await work(owner);
    const otherWork = await work(other);
    await upload(owner, id, 'Mío');
    const [photo] = workIn(await list(owner), id).photos;
    await h.http.patch(`${API}/pro/profile/works/${id}`).set(auth(other.token)).send({ title: 'Hackeado' }).expect(403);
    await h.http.delete(`${API}/pro/profile/works/${id}`).set(auth(other.token)).expect(403);
    await sign(other, id).expect(403);
    await h.http.delete(`${API}/pro/profile/work-photos/${photo.id}`).set(auth(other.token)).expect(403);
    await h.http.patch(`${API}/pro/profile/work-photos/${photo.id}`).set(auth(other.token)).send({ caption: 'Hackeado' }).expect(403);
    await h.http.patch(`${API}/pro/profile/work-photos/${photo.id}/move`).set(auth(other.token)).send({ workId: otherWork }).expect(403);
    // Mover a un trabajo ajeno tampoco.
    await h.http.patch(`${API}/pro/profile/work-photos/${photo.id}/move`).set(auth(owner.token)).send({ workId: otherWork }).expect(403);
    await h.http.put(`${API}/pro/profile/work-photos/order`).set(auth(other.token)).send({ workId: id, ids: [photo.id] }).expect(403);
    await h.http.delete(`${API}/pro/profile/works/${randomUUID()}`).set(auth(owner.token)).expect(404);
    expect(workIn(await list(owner), id)).toMatchObject({ title: 'Casa 1', photos: [expect.objectContaining({ caption: 'Mío' })] });
    await h.http.get(`${API}/pro/profile/works`).expect(401);
  });

  it('firma en resuelve/professional-work/<perfil>/ con formatos y 8 MB, sin el secret; sin Cloudinary → 503', async () => {
    const p = await pro('firma');
    const id = await work(p);
    const res = await sign(p, id).expect(201);
    expect(res.body.publicId).toMatch(new RegExp(`^resuelve/professional-work/${p.proId}/[0-9a-f-]{36}$`));
    expect(res.body.allowedFormats).toEqual(['jpg', 'png', 'webp']);
    expect(res.body.maxBytes).toBe(8 * 1024 * 1024);
    expect(JSON.stringify(res.body)).not.toMatch(/secret/i);
    h.avatars.configured = false;
    try {
      expect((await sign(p, id).expect(503)).body.code).toBe('UPLOADS_NOT_CONFIGURED');
    } finally {
      h.avatars.configured = true;
    }
  });
});
