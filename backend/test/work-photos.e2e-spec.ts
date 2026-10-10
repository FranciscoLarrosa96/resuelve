import { randomUUID } from 'crypto';
import { describeE2E, Harness, startApp } from './app.harness';

const API = '/api/v1';
const PASSWORD = 'una-clave-bien-larga';

/**
 * "Trabajos realizados": 5 FREE / 20 PRO fotos públicas por perfil, subidas firmadas
 * a Cloudinary (doble en memoria), validadas con el proveedor, con el tope
 * garantizado en el backend (también con confirmaciones simultáneas).
 */
describeE2E('Trabajos realizados — portfolio (e2e)', () => {
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

  const sign = (p: Pro) => h.http.post(`${API}/pro/profile/work-photos/sign`).set(auth(p.token));
  const confirm = (p: Pro, publicId: string, caption?: string | null) =>
    h.http.post(`${API}/pro/profile/work-photos`).set(auth(p.token)).send({ publicId, caption });
  const list = async (p: Pro) => (await h.http.get(`${API}/pro/profile/work-photos`).set(auth(p.token)).expect(200)).body;
  /** Firma + "sube" a Cloudinary (doble) + confirma. */
  async function upload(p: Pro, caption?: string, format = 'jpg') {
    const { publicId } = (await sign(p).expect(201)).body;
    h.avatars.upload(publicId, format);
    return { publicId, res: await confirm(p, publicId, caption) };
  }

  beforeAll(async () => {
    h = await startApp({ emailVerification: false });
    for (const s of (await h.http.get(`${API}/services`).expect(200)).body) svc[s.slug] = s.id;
    for (const z of (await h.http.get(`${API}/zones?city=tandil`).expect(200)).body) zone[z.slug] = z.id;
  }, 60_000);

  afterAll(async () => {
    await h?.app.close();
  });

  it('firma en resuelve/professional-work/<perfil>/ con formatos y 8 MB, sin el secret', async () => {
    const p = await pro('firma');
    const res = await sign(p).expect(201);
    expect(res.body.publicId).toMatch(new RegExp(`^resuelve/professional-work/${p.proId}/[0-9a-f-]{36}$`));
    expect(res.body.allowedFormats).toEqual(['jpg', 'png', 'webp']);
    expect(res.body.maxBytes).toBe(8 * 1024 * 1024);
    expect(JSON.stringify(res.body)).not.toMatch(/secret/i);
  });

  it('FREE: sube hasta 5 fotos activas y rechaza la 6ª antes o después de subir', async () => {
    const p = await pro('cinco');
    for (let i = 0; i < 5; i++) {
      const { res } = await upload(p, i === 0 ? '  Baño   completo\nen porcelanato ' : undefined);
      expect(res.status).toBe(201);
    }
    const body = await list(p);
    expect(body.max).toBe(5);
    expect(body.activeCount).toBe(5);
    expect(body.maxStored).toBe(20);
    expect(body.items).toHaveLength(5);
    expect(body.items.map((x: { sortOrder: number }) => x.sortOrder)).toEqual([0, 1, 2, 3, 4]);
    expect(body.items[0].caption).toBe('Baño completo en porcelanato');
    expect(body.items[1].caption).toBeNull();
    expect(body.items[0].url).toContain('c_limit,w_1600,h_1600,q_auto,f_auto');
    expect(Object.keys(body.items[0]).sort()).toEqual(['archivedByPlan', 'caption', 'featured', 'id', 'sortOrder', 'url']);

    // Con 5: ni firma ni confirmación.
    const blocked = await sign(p).expect(409);
    expect(blocked.body.code).toBe('WORK_PHOTOS_LIMIT_REACHED');
    const extra = `resuelve/professional-work/${p.proId}/${randomUUID()}`;
    h.avatars.upload(extra);
    const sixth = await confirm(p, extra).expect(409);
    expect(sixth.body.code).toBe('WORK_PHOTOS_LIMIT_REACHED');
    expect(h.avatars.destroyed).toContain(extra); // no queda huérfana en Cloudinary
    expect((await list(p)).items).toHaveLength(5);
  });

  it('PRO: 20 activas; downgrade archiva según orden, upgrade conserva el archivo hasta reactivación y solo publica activas', async () => {
    const p = await pro('downgrade');
    await h.dataSource.query(`UPDATE professional_profiles SET plan_tier = 'PRO' WHERE id = $1`, [p.proId]);
    for (let i = 0; i < 14; i++) await upload(p, `Trabajo ${i + 1}`);
    const proList = await list(p);
    expect(proList).toMatchObject({ max: 20, activeCount: 14, maxStored: 20 });

    await h.dataSource.query(`UPDATE professional_profiles SET plan_tier = 'FREE' WHERE id = $1`, [p.proId]);
    const freeList = await list(p);
    expect(freeList.max).toBe(5);
    expect(freeList.activeCount).toBe(5);
    expect(freeList.items.filter((photo: { archivedByPlan: boolean }) => photo.archivedByPlan)).toHaveLength(9);
    expect(freeList.items.slice(0, 5).map((photo: { caption: string }) => photo.caption)).toEqual(
      ['Trabajo 1', 'Trabajo 2', 'Trabajo 3', 'Trabajo 4', 'Trabajo 5'],
    );
    const publicFree = await h.http.get(`${API}/professionals/${p.proId}`).expect(200);
    expect(publicFree.body.workPhotos).toHaveLength(5);
    expect(JSON.stringify(publicFree.body.workPhotos)).not.toContain('archivedByPlan');

    await h.dataSource.query(`UPDATE professional_profiles SET plan_tier = 'PRO' WHERE id = $1`, [p.proId]);
    const upgraded = await list(p);
    expect(upgraded).toMatchObject({ max: 20, activeCount: 5 });
    const archived = upgraded.items.find((photo: { archivedByPlan: boolean }) => photo.archivedByPlan);
    const restored = await h.http.patch(`${API}/pro/profile/work-photos/${archived.id}/restore`).set(auth(p.token)).send({}).expect(200);
    expect(restored.body.activeCount).toBe(6);
    expect(restored.body.items.find((photo: { id: string }) => photo.id === archived.id).archivedByPlan).toBe(false);
    expect((await h.http.get(`${API}/professionals/${p.proId}`).expect(200)).body.workPhotos).toHaveLength(6);
  });

  it('PRO permite 20 fotos activas y bloquea la 21ª en firma y confirmación', async () => {
    const p = await pro('veinte');
    await h.dataSource.query(`UPDATE professional_profiles SET plan_tier = 'PRO' WHERE id = $1`, [p.proId]);
    for (let i = 0; i < 20; i++) await upload(p, `Trabajo ${i + 1}`);
    expect(await list(p)).toMatchObject({ max: 20, activeCount: 20, maxStored: 20 });

    const blockedSign = await sign(p).expect(409);
    expect(blockedSign.body.code).toBe('WORK_PHOTOS_LIMIT_REACHED');
    const extra = `resuelve/professional-work/${p.proId}/${randomUUID()}`;
    h.avatars.upload(extra);
    const blockedConfirm = await confirm(p, extra).expect(409);
    expect(blockedConfirm.body.code).toBe('WORK_PHOTOS_LIMIT_REACHED');
    expect(h.avatars.destroyed).toContain(extra);
    expect((await list(p)).activeCount).toBe(20);
  });

  it('la foto principal queda única y se usa como preview destacada pública', async () => {
    const p = await pro('principal');
    await upload(p, 'Primera');
    await upload(p, 'Segunda');
    const [first, second] = (await list(p)).items;
    await h.http.patch(`${API}/pro/profile/work-photos/${first.id}/featured`).set(auth(p.token)).send({ featured: true }).expect(200);
    const moved = await h.http.patch(`${API}/pro/profile/work-photos/${second.id}/featured`).set(auth(p.token)).send({ featured: true }).expect(200);
    expect(moved.body.items.filter((photo: { featured: boolean }) => photo.featured)).toHaveLength(1);
    expect(moved.body.items.find((photo: { id: string }) => photo.id === second.id).featured).toBe(true);
    const publicProfile = await h.http.get(`${API}/professionals/${p.proId}`).expect(200);
    expect(publicProfile.body.workPhotos.find((photo: { id: string }) => photo.id === second.id).featured).toBe(true);
  });

  it('confirmaciones simultáneas con 4 fotos → nunca más de 5', async () => {
    const p = await pro('carrera');
    for (let i = 0; i < 4; i++) await upload(p);
    const ids = [0, 1, 2].map(() => `resuelve/professional-work/${p.proId}/${randomUUID()}`);
    ids.forEach((id) => h.avatars.upload(id));
    const results = await Promise.all(ids.map((id) => confirm(p, id)));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(2);
    const rows = await h.dataSource.query(`SELECT count(*)::int AS n FROM professional_work_photos WHERE professional_id = $1`, [
      p.proId,
    ]);
    expect(rows[0].n).toBe(5);
  });

  it('confirmar dos veces la misma subida no la duplica', async () => {
    const p = await pro('doble');
    const { publicId } = await upload(p);
    await confirm(p, publicId).expect(201);
    expect((await list(p)).items).toHaveLength(1);
  });

  it('formato o peso inválido → 422 INVALID_IMAGE y se borra del proveedor; carpeta ajena → 404', async () => {
    const p = await pro('formato');
    const gif = (await sign(p).expect(201)).body.publicId;
    h.avatars.upload(gif, 'gif');
    expect((await confirm(p, gif).expect(422)).body.code).toBe('INVALID_IMAGE');
    expect(h.avatars.destroyed).toContain(gif);

    const big = (await sign(p).expect(201)).body.publicId;
    h.avatars.upload(big, 'jpg', 9 * 1024 * 1024);
    expect((await confirm(p, big).expect(422)).body.code).toBe('INVALID_IMAGE');

    const other = await pro('ajeno');
    const theirs = (await sign(other).expect(201)).body.publicId;
    h.avatars.upload(theirs);
    await confirm(p, theirs).expect(404);
    await confirm(p, 'resuelve/avatars/x/y').expect(400);
    expect((await list(p)).items).toHaveLength(0);
  });

  it('descripción: hasta 80 caracteres, sin teléfonos ni emails; se edita y se borra', async () => {
    const p = await pro('caption');
    const long = await upload(p, 'x'.repeat(81));
    expect(long.res.status).toBe(422);
    expect(long.res.body.code).toBe('INVALID_CAPTION');
    expect((await upload(p, 'Llamame al 249 444-5566')).res.body.code).toBe('INVALID_CAPTION');
    expect((await upload(p, 'Escribime a juan@gmail.com')).res.body.code).toBe('INVALID_CAPTION');

    await upload(p, 'Tablero nuevo');
    const [photo] = (await list(p)).items;
    const edited = await h.http
      .patch(`${API}/pro/profile/work-photos/${photo.id}`)
      .set(auth(p.token))
      .send({ caption: 'Tablero trifásico 2024' })
      .expect(200);
    expect(edited.body.items[0].caption).toBe('Tablero trifásico 2024');
    const cleared = await h.http
      .patch(`${API}/pro/profile/work-photos/${photo.id}`)
      .set(auth(p.token))
      .send({ caption: '   ' })
      .expect(200);
    expect(cleared.body.items[0].caption).toBeNull();
  });

  it('reordenar persiste; un orden incompleto o con fotos ajenas → 422', async () => {
    const p = await pro('orden');
    for (let i = 0; i < 3; i++) await upload(p, `Foto ${i}`);
    const ids = (await list(p)).items.map((x: { id: string }) => x.id);
    const reversed = [...ids].reverse();
    await h.http.put(`${API}/pro/profile/work-photos/order`).set(auth(p.token)).send({ ids: reversed }).expect(200);
    const after = (await list(p)).items;
    expect(after.map((x: { id: string }) => x.id)).toEqual(reversed);
    expect(after.map((x: { caption: string }) => x.caption)).toEqual(['Foto 2', 'Foto 1', 'Foto 0']);

    const bad = await h.http.put(`${API}/pro/profile/work-photos/order`).set(auth(p.token)).send({ ids: ids.slice(0, 2) });
    expect(bad.status).toBe(422);
    expect(bad.body.code).toBe('INVALID_WORK_PHOTO_ORDER');
    await h.http
      .put(`${API}/pro/profile/work-photos/order`)
      .set(auth(p.token))
      .send({ ids: [ids[0], ids[0], ids[1]] })
      .expect(422);
  });

  it('borrar: Cloudinary + base, el conteo baja y el orden se compacta; se puede volver a subir', async () => {
    const p = await pro('borra');
    const uploaded = [];
    for (let i = 0; i < 5; i++) uploaded.push((await upload(p)).publicId);
    const items = (await list(p)).items;
    const res = await h.http.delete(`${API}/pro/profile/work-photos/${items[1].id}`).set(auth(p.token)).expect(200);
    expect(res.body.items).toHaveLength(4);
    expect(res.body.items.map((x: { sortOrder: number }) => x.sortOrder)).toEqual([0, 1, 2, 3]);
    expect(h.avatars.destroyed).toContain(uploaded[1]);
    expect((await upload(p)).res.status).toBe(201);
  });

  it('si Cloudinary falla al borrar → 502 y la foto sigue (reintentable)', async () => {
    const p = await pro('falla');
    await upload(p);
    const [photo] = (await list(p)).items;
    h.avatars.failDestroys = 1;
    const res = await h.http.delete(`${API}/pro/profile/work-photos/${photo.id}`).set(auth(p.token)).expect(502);
    expect(res.body.code).toBe('WORK_PHOTO_DELETE_FAILED');
    expect((await list(p)).items).toHaveLength(1);
    await h.http.delete(`${API}/pro/profile/work-photos/${photo.id}`).set(auth(p.token)).expect(200);
    expect((await list(p)).items).toHaveLength(0);
  });

  it('solo el dueño: otra persona no puede borrar, editar ni reordenar (403); inexistente → 404', async () => {
    const owner = await pro('duenio');
    const other = await pro('otro');
    await upload(owner, 'Mío');
    const [photo] = (await list(owner)).items;
    await h.http.delete(`${API}/pro/profile/work-photos/${photo.id}`).set(auth(other.token)).expect(403);
    await h.http.patch(`${API}/pro/profile/work-photos/${photo.id}`).set(auth(other.token)).send({ caption: 'Hackeado' }).expect(403);
    await h.http.put(`${API}/pro/profile/work-photos/order`).set(auth(other.token)).send({ ids: [photo.id] }).expect(422);
    await h.http.delete(`${API}/pro/profile/work-photos/${randomUUID()}`).set(auth(owner.token)).expect(404);
    expect((await list(owner)).items[0].caption).toBe('Mío');
    // Sin perfil profesional ni sesión: nada.
    await h.http.get(`${API}/pro/profile/work-photos`).expect(401);
  });

  it('perfil público: workPhotos en orden, sin publicId; sin fotos → lista vacía (Free también)', async () => {
    const p = await pro('publico');
    const empty = await h.http.get(`${API}/professionals/${p.proId}`).expect(200);
    expect(empty.body.workPhotos).toEqual([]);
    await upload(p, 'Primera');
    await upload(p, 'Segunda');
    const pub = await h.http.get(`${API}/professionals/${p.proId}`).expect(200);
    expect(pub.body.workPhotos.map((x: { caption: string }) => x.caption)).toEqual(['Primera', 'Segunda']);
    expect(Object.keys(pub.body.workPhotos[0]).sort()).toEqual(['caption', 'featured', 'id', 'sortOrder', 'url']);
    expect(JSON.stringify(pub.body)).not.toContain('resuelve/professional-work/' + p.proId + '/"');
    expect(JSON.stringify(pub.body)).not.toContain('publicId');
    // No bloquea la búsqueda: aparece igual con o sin fotos.
    const search = await h.http.get(`${API}/professionals`).query({ service: svc.plomeria, pageSize: 50 }).expect(200);
    expect(search.body.items.some((x: { id: string }) => x.id === p.proId)).toBe(true);
  });

  it('sin Cloudinary configurado → 503 UPLOADS_NOT_CONFIGURED', async () => {
    const p = await pro('sincloud');
    h.avatars.configured = false;
    try {
      expect((await sign(p).expect(503)).body.code).toBe('UPLOADS_NOT_CONFIGURED');
    } finally {
      h.avatars.configured = true;
    }
  });
});
