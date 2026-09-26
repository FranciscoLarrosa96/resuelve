import { randomUUID } from 'crypto';
import { describeE2E, Harness, startApp } from './app.harness';
import { VerificationReviewService } from '../src/verifications/verification-review.service';

const API = '/api/v1';
const PASSWORD = 'una-clave-bien-larga';

/**
 * Núcleo profesional: cobertura ("Todo Tandil" sin zona falsa), perfil
 * editable y pausable, matrícula por servicio con upload privado y revisión.
 * El almacenamiento de documentos es un doble en memoria (nunca Cloudinary).
 */
describeE2E('Núcleo profesional (e2e)', () => {
  let h: Harness;
  let review: VerificationReviewService;
  const svc: Record<string, string> = {};
  const zone: Record<string, string> = {};

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function register(label: string) {
    const email = `${label}-${randomUUID().slice(0, 8)}@test.dev`;
    const res = await h.http
      .post(`${API}/auth/register`)
      .send({ firstName: label, lastName: 'Core', email, password: PASSWORD, phone: '+54 249 555 1111' })
      .expect(201);
    return { email, token: res.body.accessToken as string };
  }

  async function pro(label: string, body: Record<string, unknown>) {
    const user = await register(label);
    const res = await h.http
      .post(`${API}/pro/profile`)
      .set(auth(user.token))
      .send({ headline: `${label} en Tandil`, yearsExperience: 3, ...body });
    expect(res.status).toBe(201);
    return { ...user, proId: res.body.id as string };
  }

  async function searchIds(query: Record<string, unknown>): Promise<string[]> {
    const res = await h.http.get(`${API}/professionals`).query({ pageSize: 50, ...query }).expect(200);
    return res.body.items.map((p: { id: string }) => p.id);
  }

  const me = async (token: string) => (await h.http.get(`${API}/pro/me`).set(auth(token)).expect(200)).body;

  /** Firma → "sube" al doble → confirma. Devuelve la respuesta del envío. */
  async function submitLicense(token: string, serviceId: string, opts: { format?: string; bytes?: number; reference?: string; expiresAt?: string } = {}) {
    const ticket = await h.http.post(`${API}/pro/verifications/upload`).set(auth(token)).send({ serviceId });
    if (ticket.status !== 201) return ticket;
    h.storage.upload(ticket.body.publicId, opts.format ?? 'pdf', opts.bytes ?? 200_000);
    return h.http
      .post(`${API}/pro/verifications`)
      .set(auth(token))
      .send({
        type: 'LICENSE',
        serviceId,
        reference: opts.reference ?? 'Mat. N.º 1234',
        documentPublicId: ticket.body.publicId,
        ...(opts.expiresAt ? { expiresAt: opts.expiresAt } : {}),
      });
  }

  const pendingId = async (proId: string) => (await review.listPending()).find((v) => v.professionalId === proId)!.id;

  beforeAll(async () => {
    h = await startApp();
    review = h.app.get(VerificationReviewService);
    for (const s of (await h.http.get(`${API}/services`).expect(200)).body) svc[s.slug] = s.id;
    for (const z of (await h.http.get(`${API}/zones`).expect(200)).body) zone[z.slug] = z.id;
  }, 60_000);

  afterAll(async () => {
    await h?.app.close();
  });

  // ---- Cobertura ------------------------------------------------------------
  describe('cobertura', () => {
    it('zona específica: aparece en su barrio y no en otro', async () => {
      const p = await pro('especifico', { serviceIds: [svc.plomeria], zoneIds: [zone['villa-italia']] });
      expect(await searchIds({ zone: zone['villa-italia'] })).toContain(p.proId);
      expect(await searchIds({ zone: 'centro' })).not.toContain(p.proId);
    });

    it('"Todo Tandil" es una propiedad, no una zona: aparece en cualquier barrio', async () => {
      const p = await pro('todotandil', { serviceIds: [svc.plomeria], coversEntireCity: true });
      for (const z of ['centro', 'villa-italia', 'uncas', zone['la-movediza']])
        expect(await searchIds({ zone: z, service: 'plomeria' })).toContain(p.proId);
      const pub = (await h.http.get(`${API}/professionals/${p.proId}`).expect(200)).body;
      expect(pub.coversEntireCity).toBe(true);
      expect(pub.zones).toEqual([]);
      const zones = (await h.http.get(`${API}/zones`).expect(200)).body as { name: string }[];
      expect(zones.some((z) => /todo tandil/i.test(z.name))).toBe(false);
    });

    it('sin "Todo Tandil" hace falta al menos un barrio', async () => {
      const u = await register('sincobertura');
      const res = await h.http
        .post(`${API}/pro/profile`)
        .set(auth(u.token))
        .send({ headline: 'Plomero', yearsExperience: 1, serviceIds: [svc.plomeria] });
      expect(res.status).toBe(422);
      expect(res.body.details.fields).toContain('zoneIds');
    });

    it('cambio de modo: las zonas se conservan y vuelven al desmarcar "Todo Tandil"', async () => {
      const p = await pro('modo', { serviceIds: [svc.plomeria], zoneIds: [zone.uncas] });
      await h.http.patch(`${API}/pro/profile`).set(auth(p.token)).send({ coversEntireCity: true }).expect(200);
      expect(await searchIds({ zone: 'centro' })).toContain(p.proId);
      expect((await me(p.token)).savedZones.map((z: { slug: string }) => z.slug)).toEqual(['uncas']);

      const back = await h.http.patch(`${API}/pro/profile`).set(auth(p.token)).send({ coversEntireCity: false }).expect(200);
      expect(back.body.coversEntireCity).toBe(false);
      expect(back.body.zones.map((z: { slug: string }) => z.slug)).toEqual(['uncas']);
      expect(await searchIds({ zone: 'centro' })).not.toContain(p.proId);
      expect(await searchIds({ zone: 'uncas' })).toContain(p.proId);
    });

    it('urgencias y "disponibles hoy": "Todo Tandil" cuenta para cualquier barrio', async () => {
      const p = await pro('urgente', { serviceIds: [svc.plomeria], coversEntireCity: true, availableToday: true });
      expect(await searchIds({ zone: 'centro', service: 'plomeria', availableToday: true })).toContain(p.proId);
      const client = await register('cliurg');
      const req = await h.http
        .post(`${API}/requests`)
        .set(auth(client.token))
        .send({ serviceId: svc.plomeria, zoneId: zone.centro, title: 'Pérdida', description: 'Pierde agua la canilla.', urgency: 'URGENT' })
        .expect(201);
      await h.http
        .post(`${API}/requests/${req.body.id}/invitations`)
        .set(auth(client.token))
        .send({ professionalIds: [p.proId] })
        .expect(200);
    });

    it('barrio desactivado: nadie aparece por él y no se muestra en perfiles', async () => {
      const [{ id: cityId }] = await h.dataSource.query(`SELECT id FROM cities WHERE slug = 'tandil'`);
      const [{ id: tempZone }] = await h.dataSource.query(
        `INSERT INTO zones (city_id, name, slug, sort_order, active) VALUES ($1, 'Barrio de prueba', $2, 99, true) RETURNING id`,
        [cityId, `prueba-${randomUUID().slice(0, 6)}`],
      );
      const specific = await pro('inactiva', { serviceIds: [svc.plomeria], zoneIds: [tempZone, zone.centro] });
      const whole = await pro('inactivaall', { serviceIds: [svc.plomeria], coversEntireCity: true });
      expect(await searchIds({ zone: tempZone })).toEqual(expect.arrayContaining([specific.proId, whole.proId]));

      await h.dataSource.query(`UPDATE zones SET active = false WHERE id = $1`, [tempZone]);
      expect(await searchIds({ zone: tempZone })).toEqual([]);
      const pub = (await h.http.get(`${API}/professionals/${specific.proId}`).expect(200)).body;
      expect(pub.zones.map((z: { id: string }) => z.id)).toEqual([zone.centro]);
    });

    it('sin duplicados: zona guardada + "Todo Tandil" aparece una sola vez', async () => {
      const p = await pro('nodup', { serviceIds: [svc.cerrajeria], zoneIds: [zone.centro], coversEntireCity: true });
      const res = await h.http.get(`${API}/professionals`).query({ zone: 'centro', service: 'cerrajeria', pageSize: 50 }).expect(200);
      const ids = res.body.items.map((x: { id: string }) => x.id);
      expect(ids.filter((id: string) => id === p.proId)).toHaveLength(1);
      expect(new Set(ids).size).toBe(ids.length);
      expect(res.body.total).toBeGreaterThanOrEqual(ids.length);
    });
  });

  // ---- Perfil -----------------------------------------------------------------
  describe('perfil propio', () => {
    it('edita presentación y se refleja en /pro/me y en el perfil público', async () => {
      const p = await pro('edita', { serviceIds: [svc.plomeria], zoneIds: [zone.centro] });
      await h.http
        .patch(`${API}/pro/profile`)
        .set(auth(p.token))
        .send({ headline: 'Plomero matriculado en Tandil', bio: 'Trabajo prolijo.', yearsExperience: 12 })
        .expect(200);
      const pub = (await h.http.get(`${API}/professionals/${p.proId}`).expect(200)).body;
      expect(pub).toMatchObject({ headline: 'Plomero matriculado en Tandil', bio: 'Trabajo prolijo.', yearsExperience: 12 });
    });

    it('no se puede editar otro perfil ni campos internos', async () => {
      const a = await pro('duenoa', { serviceIds: [svc.plomeria], zoneIds: [zone.centro] });
      const b = await pro('duenob', { serviceIds: [svc.plomeria], zoneIds: [zone.centro] });
      // No existe un endpoint por UUID: mandar un id ajeno es un campo no permitido.
      await h.http.patch(`${API}/pro/profile`).set(auth(b.token)).send({ id: a.proId, headline: 'Hackeado' }).expect(400);
      await h.http.patch(`${API}/pro/profile`).set(auth(b.token)).send({ status: 'ACTIVE' }).expect(400);
      const client = await register('cliente');
      const noProfile = await h.http.patch(`${API}/pro/profile`).set(auth(client.token)).send({ headline: 'x' });
      expect(noProfile.status).toBe(403);
      await h.http.patch(`${API}/pro/profile`).send({ headline: 'x' }).expect(401);
      expect((await h.http.get(`${API}/professionals/${a.proId}`).expect(200)).body.headline).toBe('duenoa en Tandil');
    });

    it('quitar un servicio lo saca de búsquedas sin romper solicitudes ni presupuestos viejos', async () => {
      const p = await pro('quita', { serviceIds: [svc.plomeria, svc.pintura], zoneIds: [zone.centro] });
      const client = await register('clihist');
      const req = await h.http
        .post(`${API}/requests`)
        .set(auth(client.token))
        .send({ serviceId: svc.plomeria, zoneId: zone.centro, title: 'Canilla', description: 'Gotea la canilla.', urgency: 'FLEXIBLE' })
        .expect(201);
      await h.http.post(`${API}/requests/${req.body.id}/invitations`).set(auth(client.token)).send({ professionalIds: [p.proId] }).expect(200);
      await h.http
        .post(`${API}/pro/requests/${req.body.id}/quote`)
        .set(auth(p.token))
        .send({ description: 'Cambio de cuerito', laborAmount: 8000 })
        .expect(201);

      await h.http.patch(`${API}/pro/profile`).set(auth(p.token)).send({ serviceIds: [svc.pintura] }).expect(200);
      expect(await searchIds({ service: 'plomeria' })).not.toContain(p.proId);
      expect(await searchIds({ service: 'pintura' })).toContain(p.proId);
      const quotes = await h.http.get(`${API}/requests/${req.body.id}/quotes`).set(auth(client.token)).expect(200);
      expect(quotes.body).toHaveLength(1);
      await h.http.get(`${API}/pro/requests/${req.body.id}`).set(auth(p.token)).expect(200);

      // Agregar vuelve a publicarlo.
      await h.http.patch(`${API}/pro/profile`).set(auth(p.token)).send({ serviceIds: [svc.pintura, svc.plomeria] }).expect(200);
      expect(await searchIds({ service: 'plomeria' })).toContain(p.proId);
    });

    it('pausar: sale de búsquedas, ficha e invitaciones; no toca disponibilidad ni historial', async () => {
      const p = await pro('pausa', { serviceIds: [svc.plomeria], zoneIds: [zone.centro], availableToday: true });
      const paused = await h.http.patch(`${API}/pro/status`).set(auth(p.token)).send({ status: 'PAUSED' }).expect(200);
      expect(paused.body.status).toBe('PAUSED');
      expect(paused.body.availableToday).toBe(true);
      expect(await searchIds({ service: 'plomeria' })).not.toContain(p.proId);
      await h.http.get(`${API}/professionals/${p.proId}`).expect(404);
      const client = await register('clipausa');
      const req = await h.http
        .post(`${API}/requests`)
        .set(auth(client.token))
        .send({ serviceId: svc.plomeria, zoneId: zone.centro, title: 'Canilla', description: 'Gotea la canilla.', urgency: 'FLEXIBLE' })
        .expect(201);
      const inv = await h.http.post(`${API}/requests/${req.body.id}/invitations`).set(auth(client.token)).send({ professionalIds: [p.proId] });
      expect(inv.status).toBe(422);
      expect(inv.body.code).toBe('PROFESSIONAL_NOT_ELIGIBLE');

      await h.http.patch(`${API}/pro/status`).set(auth(p.token)).send({ status: 'ACTIVE' }).expect(200);
      expect(await searchIds({ service: 'plomeria' })).toContain(p.proId);
      await h.http.patch(`${API}/pro/status`).set(auth(p.token)).send({ status: 'SUSPENDED' }).expect(400);
    });

    it('"Disponible hoy" es real y vence al día siguiente', async () => {
      const p = await pro('dispo', { serviceIds: [svc.plomeria], zoneIds: [zone.centro] });
      await h.http.patch(`${API}/pro/availability`).set(auth(p.token)).send({ availableToday: true }).expect(200);
      expect((await h.http.get(`${API}/professionals/${p.proId}`).expect(200)).body.availableToday).toBe(true);
      await h.dataSource.query(`UPDATE professional_profiles SET available_on = available_on - 1 WHERE id = $1`, [p.proId]);
      expect((await h.http.get(`${API}/professionals/${p.proId}`).expect(200)).body.availableToday).toBe(false);
      expect(await searchIds({ availableToday: true })).not.toContain(p.proId);
    });
  });

  // ---- Matrícula ---------------------------------------------------------------
  describe('matrícula por servicio', () => {
    it('multi-servicio: Gas pendiente no se publica; Plomería sí. Aprobada, aparece por Gas', async () => {
      const p = await pro('gasista', { serviceIds: [svc.plomeria, svc.gas], coversEntireCity: true });
      let own = await me(p.token);
      const gas = () => own.offeredServices.find((s: { slug: string }) => s.slug === 'gas');
      expect(gas()).toMatchObject({ requiresLicense: true, licenseStatus: 'NOT_SUBMITTED', public: false });
      expect(own.services.map((s: { slug: string }) => s.slug)).toEqual(['plomeria']);

      expect(await searchIds({ service: 'plomeria', zone: 'centro' })).toContain(p.proId);
      expect(await searchIds({ service: 'gas', zone: 'centro' })).not.toContain(p.proId);

      const sent = await submitLicense(p.token, svc.gas, { reference: 'Mat. Gas 777' });
      expect(sent.status).toBe(201);
      own = sent.body;
      expect(gas().licenseStatus).toBe('PENDING');
      expect(await searchIds({ service: 'gas' })).not.toContain(p.proId);

      // Invitar por Gas todavía no se puede.
      const client = await register('cligas');
      const req = await h.http
        .post(`${API}/requests`)
        .set(auth(client.token))
        .send({ serviceId: svc.gas, zoneId: zone.centro, title: 'Olor a gas', description: 'Hay olor a gas en la cocina.', urgency: 'TODAY' })
        .expect(201);
      const early = await h.http.post(`${API}/requests/${req.body.id}/invitations`).set(auth(client.token)).send({ professionalIds: [p.proId] });
      expect(early.body.code).toBe('PROFESSIONAL_NOT_ELIGIBLE');

      await review.approve(await pendingId(p.proId), 'revisor-test');
      expect(await searchIds({ service: 'gas', zone: 'uncas' })).toContain(p.proId);
      expect(await searchIds({ service: 'gas', licenseVerified: true })).toContain(p.proId);
      const pub = (await h.http.get(`${API}/professionals/${p.proId}`).expect(200)).body;
      expect(pub.services.map((s: { slug: string }) => s.slug)).toEqual(expect.arrayContaining(['plomeria', 'gas']));
      expect(pub.verifications.licenses).toEqual([{ serviceId: svc.gas, reference: 'Mat. Gas 777' }]);
      await h.http.post(`${API}/requests/${req.body.id}/invitations`).set(auth(client.token)).send({ professionalIds: [p.proId] }).expect(200);
    });

    it('licenseVerified valida contra el servicio pedido (no "alguna vez verificó algo")', async () => {
      const p = await pro('electri', { serviceIds: [svc.electricidad, svc.gas], zoneIds: [zone.centro] });
      await submitLicense(p.token, svc.electricidad).then((r) => expect(r.status).toBe(201));
      await review.approve(await pendingId(p.proId), 'revisor-test');
      expect(await searchIds({ service: 'electricidad', licenseVerified: true })).toContain(p.proId);
      expect(await searchIds({ service: 'gas', licenseVerified: true })).not.toContain(p.proId);
      expect(await searchIds({ licenseVerified: true })).toContain(p.proId);
    });

    it('rechazo con motivo → reenvío (historial) → aprobación', async () => {
      const p = await pro('rechazo', { serviceIds: [svc.electricidad], zoneIds: [zone.centro] });
      await submitLicense(p.token, svc.electricidad, { reference: 'Mat. borrosa' }).then((r) => expect(r.status).toBe(201));
      // En revisión no se puede mandar otra.
      const dup = await submitLicense(p.token, svc.electricidad);
      expect(dup.status).toBe(409);
      expect(dup.body.code).toBe('VERIFICATION_ALREADY_ACTIVE');

      await review.reject(await pendingId(p.proId), 'revisor-test', 'La imagen no permite leer el número.');
      let own = await me(p.token);
      expect(own.offeredServices[0].licenseStatus).toBe('REJECTED');
      expect(own.verificationRequests[0]).toMatchObject({ status: 'REJECTED', rejectionReason: 'La imagen no permite leer el número.' });
      expect(JSON.stringify(own)).not.toContain('revisor-test');

      const again = await submitLicense(p.token, svc.electricidad, { reference: 'Mat. N.º 4218' });
      expect(again.status).toBe(201);
      own = again.body;
      expect(own.verificationRequests.map((v: { status: string }) => v.status)).toEqual(['PENDING', 'REJECTED']);
      await review.approve(await pendingId(p.proId), 'revisor-test');
      own = await me(p.token);
      expect(own.offeredServices[0]).toMatchObject({ licenseStatus: 'VERIFIED', public: true });
    });

    it('vencida: deja de contar y permite reenviar', async () => {
      const p = await pro('vence', { serviceIds: [svc.gas], zoneIds: [zone.centro] });
      await submitLicense(p.token, svc.gas, { expiresAt: '2030-01-01' }).then((r) => expect(r.status).toBe(201));
      const id = await pendingId(p.proId);
      await review.approve(id, 'revisor-test');
      expect(await searchIds({ service: 'gas' })).toContain(p.proId);

      await h.dataSource.query(`UPDATE professional_verifications SET expires_at = now() - interval '1 day' WHERE id = $1`, [id]);
      expect(await searchIds({ service: 'gas' })).not.toContain(p.proId);
      expect((await me(p.token)).offeredServices[0].licenseStatus).toBe('EXPIRED');
      expect((await h.http.get(`${API}/professionals/${p.proId}`).expect(200)).body.verifications.license).toBe(false);

      await submitLicense(p.token, svc.gas).then((r) => expect(r.status).toBe(201));
      const [{ status }] = await h.dataSource.query(`SELECT status FROM professional_verifications WHERE id = $1`, [id]);
      expect(status).toBe('EXPIRED');
    });

    it('validaciones del envío: documento, formato real, peso, servicio y firma', async () => {
      const p = await pro('valida', { serviceIds: [svc.gas, svc.plomeria], zoneIds: [zone.centro] });
      const other = await pro('ajeno', { serviceIds: [svc.gas], zoneIds: [zone.centro] });

      const ticket = await h.http.post(`${API}/pro/verifications/upload`).set(auth(p.token)).send({ serviceId: svc.gas }).expect(201);
      expect(ticket.body.publicId.startsWith(`resuelve/verifications/${p.proId}/`)).toBe(true);
      expect(ticket.body.fields.type).toBe('private');
      expect(JSON.stringify(ticket.body)).not.toMatch(/secret|@test\.dev/);

      const base = { type: 'LICENSE', serviceId: svc.gas, reference: 'Mat. 1' };
      const noDoc = await h.http.post(`${API}/pro/verifications`).set(auth(p.token)).send(base);
      expect(noDoc.status).toBe(422);
      const missing = await h.http.post(`${API}/pro/verifications`).set(auth(p.token)).send({ ...base, documentPublicId: ticket.body.publicId });
      expect(missing.status).toBe(404); // la firma no garantiza que se haya subido

      const exe = await submitLicense(p.token, svc.gas, { format: 'exe' });
      expect(exe.status).toBe(422);
      expect(exe.body.code).toBe('INVALID_DOCUMENT');
      const big = await submitLicense(p.token, svc.gas, { bytes: 11 * 1024 * 1024 });
      expect(big.body.code).toBe('INVALID_DOCUMENT');
      expect(h.storage.destroyed.length).toBeGreaterThanOrEqual(2);

      // Documento de otro profesional → como si no existiera.
      const foreign = await h.http.post(`${API}/pro/verifications/upload`).set(auth(other.token)).send({ serviceId: svc.gas }).expect(201);
      h.storage.upload(foreign.body.publicId);
      const stolen = await h.http.post(`${API}/pro/verifications`).set(auth(p.token)).send({ ...base, documentPublicId: foreign.body.publicId });
      expect(stolen.status).toBe(404);

      const noLicense = await h.http.post(`${API}/pro/verifications/upload`).set(auth(p.token)).send({ serviceId: svc.plomeria });
      expect(noLicense.status).toBe(422);
      const notOffered = await h.http.post(`${API}/pro/verifications/upload`).set(auth(p.token)).send({ serviceId: svc.electricidad });
      expect(notOffered.status).toBe(422);
      const past = await submitLicense(p.token, svc.gas, { expiresAt: '2020-01-01' });
      expect(past.status).toBe(422);
      const forged = await h.http.post(`${API}/pro/verifications`).set(auth(p.token)).send({ ...base, status: 'VERIFIED' });
      expect(forged.status).toBe(400);

      h.storage.configured = false;
      const off = await h.http.post(`${API}/pro/verifications/upload`).set(auth(p.token)).send({ serviceId: svc.gas });
      h.storage.configured = true;
      expect(off.status).toBe(503);
      expect(off.body.code).toBe('UPLOADS_NOT_CONFIGURED');
    });

    it('lo público nunca expone pendientes, rechazos, documentos ni revisores', async () => {
      const p = await pro('privacidad', { serviceIds: [svc.herreria, svc.gas, svc.electricidad], zoneIds: [zone.centro] });
      await submitLicense(p.token, svc.gas, { reference: 'Mat. Secreta 9' });
      await submitLicense(p.token, svc.electricidad, { reference: 'Mat. Rechazada 3' });
      const ids = (await review.listPending()).filter((v) => v.professionalId === p.proId);
      await review.reject(ids.find((v) => v.service === 'Electricidad')!.id, 'revisor-privado', 'Documento ilegible, reenvialo.');

      const detail = (await h.http.get(`${API}/professionals/${p.proId}`).expect(200)).body;
      const list = (await h.http.get(`${API}/professionals`).query({ service: 'herreria', pageSize: 50 }).expect(200)).body.items.find(
        (x: { id: string }) => x.id === p.proId,
      );
      expect(list).toBeDefined();
      for (const body of [detail, list]) {
        const json = JSON.stringify(body);
        for (const secret of ['PENDING', 'REJECTED', 'Mat. Secreta 9', 'Mat. Rechazada 3', 'revisor-privado', 'ilegible', 'resuelve/verifications', 'document'])
          expect(json).not.toContain(secret);
        expect(body.services.map((s: { slug: string }) => s.slug)).toEqual(['herreria']);
        expect(body.verifications).toEqual({ identity: false, phone: false, license: false, licenses: [] });
      }
      // El propio profesional tampoco recibe publicId ni URL del documento.
      const own = JSON.stringify(await me(p.token));
      expect(own).not.toContain('resuelve/verifications');
      expect(own).not.toContain('revisor-privado');
      expect(own).toContain('"hasDocument":true');
    });

    it('revisión: link temporal, purga del archivo con metadata conservada', async () => {
      const p = await pro('purga', { serviceIds: [svc.gas], zoneIds: [zone.centro] });
      await submitLicense(p.token, svc.gas);
      const id = await pendingId(p.proId);
      const { documentUrl } = await review.show(id);
      expect(documentUrl).toContain('signature=');
      await expect(review.purgeDocument(id)).rejects.toThrow(/aprobá o rechazá/);
      await review.approve(id, 'revisor-test');
      const purged = await review.purgeDocument(id);
      expect(purged).toMatchObject({ status: 'VERIFIED', document: null, reference: 'Mat. N.º 1234' });
      expect((await me(p.token)).verificationRequests[0].hasDocument).toBe(false);
      await expect(review.reject(id, 'x', 'motivo largo')).rejects.toThrow(/ya está VERIFIED/);
    });
  });
});
