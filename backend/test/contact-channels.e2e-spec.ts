import { randomUUID } from 'crypto';
import { describeE2E, Harness, startApp } from './app.harness';

const API = '/api/v1';
const PASSWORD = 'una-clave-bien-larga';

/**
 * Canales de contacto (WhatsApp, llamadas, solicitudes por Resuelve) y urgencias
 * permanentes: consentimiento, teléfonos normalizados, enlaces, privacidad del teléfono de
 * la cuenta, clics que no tocan cupos ni primer éxito, y la migración que conserva lo que
 * cada profesional tenía.
 */
describeE2E('Canales de contacto (e2e)', () => {
  let h: Harness;
  const svc: Record<string, string> = {};
  const zone: Record<string, string> = {};
  const SESSION = 'sesion-anonima-de-prueba-0001';

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function register(label: string, phone?: string) {
    const email = `${label}-${randomUUID().slice(0, 8)}@test.dev`;
    const res = await h.http
      .post(`${API}/auth/register`)
      .send({ firstName: label, lastName: 'Contacto', email, password: PASSWORD, ...(phone ? { phone } : {}) })
      .expect(202);
    const verify = await h.http
      .post(`${API}/auth/register/verify`)
      .send({ verificationSessionId: res.body.verificationSessionId, code: h.mail.lastCodeFor(email) })
      .expect(200);
    return { email, token: verify.body.accessToken as string };
  }

  async function pro(label: string, opts: { zone?: string; phone?: string } = {}) {
    const user = await register(label, opts.phone);
    const res = await h.http
      .post(`${API}/pro/profile`)
      .set(auth(user.token))
      .send({
        headline: `${label} en Tandil`,
        yearsExperience: 3,
        serviceIds: [svc.plomeria],
        zoneIds: [zone[opts.zone ?? 'centro']],
      })
      .expect(201);
    return { ...user, proId: res.body.id as string };
  }
  type Pro = Awaited<ReturnType<typeof pro>>;

  const me = async (p: Pro) => (await h.http.get(`${API}/pro/me`).set(auth(p.token)).expect(200)).body;
  const setContact = (p: Pro, body: Record<string, unknown>) =>
    h.http
      .patch(`${API}/pro/contact`)
      .set(auth(p.token))
      .send({ whatsappEnabled: false, callsEnabled: false, requestsEnabled: true, consent: false, ...body });
  const reveal = (p: Pro, channel: 'WHATSAPP' | 'PHONE', token?: string) => {
    const req = h.http.post(`${API}/professionals/${p.proId}/contact`);
    if (token) req.set(auth(token));
    return req.send({ channel, sessionKey: SESSION });
  };
  const searchIds = async (query: Record<string, unknown>): Promise<string[]> =>
    (await h.http.get(`${API}/professionals`).query({ pageSize: 50, ...query }).expect(200)).body.items.map(
      (p: { id: string }) => p.id,
    );

  async function newRequest(client: { token: string }, zoneSlug = 'centro') {
    const req = await h.http
      .post(`${API}/requests`)
      .set(auth(client.token))
      .send({
        serviceId: svc.plomeria,
        zoneId: zone[zoneSlug],
        title: 'Canilla que gotea',
        description: 'Gotea la canilla del baño desde ayer.',
        urgency: 'FLEXIBLE',
      })
      .expect(201);
    return req.body.id as string;
  }

  beforeAll(async () => {
    h = await startApp();
    for (const s of (await h.http.get(`${API}/services`).expect(200)).body) svc[s.slug] = s.id;
    for (const z of (await h.http.get(`${API}/zones?city=tandil`).expect(200)).body) zone[z.slug] = z.id;
  }, 60_000);

  afterAll(async () => {
    await h?.app.close();
  });

  it('por defecto: solo solicitudes por Resuelve; el teléfono de la cuenta nunca se publica', async () => {
    const p = await pro('privado', { phone: '+54 249 555 1111' });
    const own = await me(p);
    expect(own.contactChannels).toEqual({ whatsapp: false, phone: false, requests: true });
    expect(own.contact).toMatchObject({ whatsappNumber: null, phoneNumber: null, consentAt: null, requestsEnabled: true });
    const pub = await h.http.get(`${API}/professionals/${p.proId}`).expect(200);
    expect(JSON.stringify(pub.body)).not.toContain('5551111');
    expect(pub.body.contact).toBeUndefined();
    await reveal(p, 'WHATSAPP').expect(404);
    await reveal(p, 'PHONE').expect(404);
  });

  it('valida en el backend: consentimiento, número y al menos un canal', async () => {
    const p = await pro('reglas');
    let res = await setContact(p, { whatsappEnabled: true, whatsappNumber: '249 15 412-3456' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('CONTACT_CONSENT_REQUIRED');

    res = await setContact(p, { whatsappEnabled: true, whatsappNumber: '4123456', consent: true });
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ code: 'INVALID_PHONE', details: { field: 'whatsappNumber' } });

    res = await setContact(p, { whatsappEnabled: true, consent: true });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('INVALID_PHONE');

    res = await setContact(p, { requestsEnabled: false });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('CONTACT_CHANNEL_REQUIRED');

    // Solo el dueño (con perfil profesional) configura.
    const stranger = await register('ajeno');
    await h.http
      .patch(`${API}/pro/contact`)
      .set(auth(stranger.token))
      .send({ whatsappEnabled: false, callsEnabled: false, requestsEnabled: true, consent: false })
      .expect(403);
    await h.http.patch(`${API}/pro/contact`).send({}).expect(401);
  });

  it('WhatsApp y llamadas: números normalizados, enlaces correctos y contacto sin cuenta', async () => {
    const p = await pro('canales');
    const res = await setContact(p, {
      whatsappEnabled: true,
      whatsappNumber: '0249 15 412-3456',
      callsEnabled: true,
      phoneNumber: '(0249) 442-3456',
      phoneKind: 'LANDLINE',
      consent: true,
    });
    expect(res.status).toBe(200);
    expect(res.body.contact).toMatchObject({
      whatsappNumber: '+5492494123456',
      whatsappDisplay: '+54 9 249 412-3456',
      phoneNumber: '+542494423456',
      phoneKind: 'LANDLINE',
    });
    expect(res.body.contact.consentAt).toBeTruthy();
    expect(res.body.contactChannels).toEqual({ whatsapp: true, phone: true, requests: true });

    // Ficha y búsqueda dicen QUÉ canales hay, nunca el número.
    const pub = await h.http.get(`${API}/professionals/${p.proId}`).expect(200);
    expect(pub.body.contactChannels).toEqual({ whatsapp: true, phone: true, requests: true });
    const search = await h.http.get(`${API}/professionals`).query({ service: 'plomeria', pageSize: 50 }).expect(200);
    expect(search.body.items.find((i: { id: string }) => i.id === p.proId).contactChannels.whatsapp).toBe(true);
    expect(JSON.stringify(pub.body) + JSON.stringify(search.body)).not.toMatch(/2494123456|2494423456/);

    // Sin sesión: el cliente no necesita cuenta para escribir o llamar.
    const wa = await reveal(p, 'WHATSAPP').expect(200);
    expect(wa.headers['cache-control']).toBe('no-store');
    expect(wa.body).toEqual({
      channel: 'WHATSAPP',
      href: `https://wa.me/5492494123456?text=${encodeURIComponent('¡Hola! Te encontré en Resuelve y quería consultarte por un trabajo.')}`,
      number: '+5492494123456',
      display: '+54 9 249 412-3456',
    });
    const tel = await reveal(p, 'PHONE').expect(200);
    expect(tel.body).toMatchObject({ href: 'tel:+542494423456', display: '+54 249 442-3456' });

    // Apagar un canal lo saca como acción disponible (y el número deja de entregarse).
    await setContact(p, { whatsappEnabled: true, callsEnabled: false, consent: true }).expect(200);
    expect((await h.http.get(`${API}/professionals/${p.proId}`).expect(200)).body.contactChannels).toEqual({
      whatsapp: true,
      phone: false,
      requests: true,
    });
    await reveal(p, 'PHONE').expect(404);

    // Número internacional.
    const intl = await setContact(p, { whatsappEnabled: true, whatsappNumber: '+598 99 123 456', consent: true }).expect(200);
    expect(intl.body.contact.whatsappNumber).toBe('+59899123456');
    expect((await reveal(p, 'WHATSAPP').expect(200)).body.href).toMatch(/^https:\/\/wa\.me\/59899123456\?text=/);
  });

  it('retirar el consentimiento apaga WhatsApp y llamadas y borra los números', async () => {
    const p = await pro('retira');
    await setContact(p, { whatsappEnabled: true, whatsappNumber: '249 15 400 0000', consent: true }).expect(200);
    const res = await setContact(p, { consent: false }).expect(200);
    expect(res.body.contact).toMatchObject({ whatsappEnabled: false, whatsappNumber: null, phoneNumber: null, consentAt: null });
    expect(res.body.contactChannels.whatsapp).toBe(false);
    await reveal(p, 'WHATSAPP').expect(404);
  });

  it('un perfil pausado no ofrece contacto directo', async () => {
    const p = await pro('pausado');
    await setContact(p, { whatsappEnabled: true, whatsappNumber: '249 15 400 0001', consent: true }).expect(200);
    await h.http.patch(`${API}/pro/status`).set(auth(p.token)).send({ status: 'PAUSED' }).expect(200);
    await reveal(p, 'WHATSAPP').expect(404);
  });

  it('un clic es un clic: no crea solicitudes, no consume cupo ni dispara primer éxito; cuenta una vez por sesión', async () => {
    const p = await pro('clics');
    await setContact(p, { whatsappEnabled: true, whatsappNumber: '249 15 400 0002', consent: true }).expect(200);
    await h.dataSource.query(`UPDATE professional_profiles SET plan_tier = 'PRO' WHERE id = $1`, [p.proId]);
    const before = await me(p);
    const [{ count: requestsBefore }] = await h.dataSource.query(`SELECT count(*)::int AS count FROM service_requests`);

    const client = await register('cliente-clic');
    await reveal(p, 'WHATSAPP').expect(200);
    await reveal(p, 'WHATSAPP', client.token).expect(200); // misma sesión anónima: no suma
    await reveal(p, 'WHATSAPP', p.token).expect(200); // el propio profesional: no suma

    const after = await me(p);
    expect(after.quoteUsage).toEqual(before.quoteUsage);
    expect(after.firstSuccessAt).toBeNull();
    const [{ count: requestsAfter }] = await h.dataSource.query(`SELECT count(*)::int AS count FROM service_requests`);
    expect(requestsAfter).toBe(requestsBefore);
    const [{ quotes }] = await h.dataSource.query(
      `SELECT count(*)::int AS quotes FROM quotes WHERE professional_id = $1`,
      [p.proId],
    );
    expect(quotes).toBe(0);

    const events = await h.dataSource.query(
      `SELECT type, service_id, zone_id FROM exposure_events WHERE professional_id = $1`,
      [p.proId],
    );
    expect(events).toEqual([{ type: 'WHATSAPP_CLICK', service_id: null, zone_id: null }]);

    // "Tu mes" distingue clics de contrataciones.
    const month = (await h.http.get(`${API}/pro/analytics/month`).set(auth(p.token)).expect(200)).body;
    expect(month.exposure).toMatchObject({ whatsappClicks: 1, phoneClicks: 0 });
    expect(month.basic.acceptedQuotes ?? 0).toBe(0);

    // Los clics no entran por el endpoint público de eventos (solo los registra el servidor).
    await h.http
      .post(`${API}/analytics/events`)
      .send({ sessionKey: SESSION, events: [{ type: 'WHATSAPP_CLICK', professionalId: p.proId }] })
      .expect(400);
  });

  it('"Solicitudes por Resuelve" apagado: sigue en la búsqueda, no recibe invitaciones nuevas y lo ya recibido sigue', async () => {
    const p = await pro('sinsolicitudes');
    const client = await register('cliente-sol');
    const before = await newRequest(client);
    await h.http
      .post(`${API}/requests/${before}/invitations`)
      .set(auth(client.token))
      .send({ professionalIds: [p.proId] })
      .expect(200);

    const res = await setContact(p, {
      whatsappEnabled: true,
      whatsappNumber: '249 15 400 0003',
      requestsEnabled: false,
      consent: true,
    }).expect(200);
    expect(res.body.contactChannels).toEqual({ whatsapp: true, phone: false, requests: false });
    expect(await searchIds({ service: 'plomeria', zone: 'centro' })).toContain(p.proId);

    const after = await newRequest(client);
    const inv = await h.http
      .post(`${API}/requests/${after}/invitations`)
      .set(auth(client.token))
      .send({ professionalIds: [p.proId] });
    expect(inv.status).toBe(422);
    expect(inv.body).toMatchObject({ code: 'PROFESSIONAL_NOT_ELIGIBLE', details: { reason: 'REQUESTS_DISABLED' } });

    // La invitación anterior se presupuesta igual (flujo tradicional intacto).
    await h.http
      .post(`${API}/pro/requests/${before}/quote`)
      .set(auth(p.token))
      .send({ description: 'Cambio de cuerito y ajuste', laborAmount: 15000 })
      .expect(201);
  });

  it('urgencias: solo quienes las atienden en esa zona, primero los que tienen contacto directo', async () => {
    const direct = await pro('urg-directo', { zone: 'la-movediza' });
    const onlyRequests = await pro('urg-solicitudes', { zone: 'la-movediza' });
    const notUrgent = await pro('urg-no', { zone: 'la-movediza' });
    const elsewhere = await pro('urg-otra-zona', { zone: 'centro' });
    for (const p of [direct, onlyRequests, elsewhere])
      await h.http.patch(`${API}/pro/availability`).set(auth(p.token)).send({ availableToday: true }).expect(200);
    await setContact(direct, { whatsappEnabled: true, whatsappNumber: '249 15 400 0004', consent: true }).expect(200);
    // Mejor reputación para el que solo recibe solicitudes: en urgencias igual va después.
    await h.dataSource.query(
      `UPDATE professional_profiles SET average_rating = 5, reviews_count = 3 WHERE id = $1`,
      [onlyRequests.proId],
    );

    const urgent = await searchIds({ service: 'plomeria', zone: 'la-movediza', availableToday: true });
    expect(urgent).not.toContain(notUrgent.proId);
    expect(urgent).not.toContain(elsewhere.proId);
    expect(urgent.indexOf(direct.proId)).toBeGreaterThanOrEqual(0);
    expect(urgent.indexOf(direct.proId)).toBeLessThan(urgent.indexOf(onlyRequests.proId));

    // Búsqueda normal: el orden de siempre (la reputación manda entre quienes atienden urgencias).
    const normal = await searchIds({ service: 'plomeria', zone: 'la-movediza' });
    expect(normal.indexOf(onlyRequests.proId)).toBeLessThan(normal.indexOf(direct.proId));
    expect(normal).toContain(notUrgent.proId);
  });

  it('migración: apply → revert → apply conserva urgencias vigentes y no publica nada nuevo', async () => {
    const on = await pro('mig-on');
    const off = await pro('mig-off');
    await h.http.patch(`${API}/pro/availability`).set(auth(on.token)).send({ availableToday: true }).expect(200);

    // Revert de ProCoverPhoto, ResponseTime, ProTools y ProfessionalWorks (posteriores), ContactChannels y
    // PermanentUrgencies: vuelve el modelo con vencimiento.
    await h.dataSource.undoLastMigration({ transaction: 'each' });
    await h.dataSource.undoLastMigration({ transaction: 'each' });
    await h.dataSource.undoLastMigration({ transaction: 'each' });
    await h.dataSource.undoLastMigration({ transaction: 'each' });
    await h.dataSource.undoLastMigration({ transaction: 'each' });
    await h.dataSource.undoLastMigration({ transaction: 'each' });
    const [reverted] = await h.dataSource.query(
      `SELECT available_until > now() AS vigente FROM professional_profiles WHERE id = $1`,
      [on.proId],
    );
    expect(reverted.vigente).toBe(true);
    // Una urgencia ya vencida antes de migrar no se convierte en permanente.
    await h.dataSource.query(
      `UPDATE professional_profiles SET available_until = now() - interval '1 hour' WHERE id = $1`,
      [off.proId],
    );

    await h.dataSource.runMigrations({ transaction: 'each' });
    const rows: { id: string; takes_urgencies: boolean; contact_requests_enabled: boolean; contact_whatsapp_enabled: boolean; contact_consent_at: Date | null }[] =
      await h.dataSource.query(
        `SELECT id, takes_urgencies, contact_requests_enabled, contact_whatsapp_enabled, contact_consent_at
           FROM professional_profiles WHERE id = ANY($1::uuid[])`,
        [[on.proId, off.proId]],
      );
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(on.proId)).toMatchObject({ takes_urgencies: true, contact_requests_enabled: true, contact_whatsapp_enabled: false, contact_consent_at: null });
    expect(byId.get(off.proId)).toMatchObject({ takes_urgencies: false, contact_requests_enabled: true });
  });
});
