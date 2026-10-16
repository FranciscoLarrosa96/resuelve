import { randomUUID } from 'crypto';
import { describeE2E, Harness, startApp } from './app.harness';

const API = '/api/v1';
const PASSWORD = 'una-clave-bien-larga';
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/**
 * Fase 2: "Sumar profesionales" a un pedido enviado y sin presupuestos. Reutiliza
 * POST /requests/:id/invitations; las recomendaciones (GET /requests/:id/invitation-options) y el
 * endpoint comparten la regla de quién puede responder; se revalida al enviar.
 */
describeE2E('Fase 2: sumar profesionales a un pedido sin respuesta (e2e)', () => {
  let h: Harness;
  let serviceId: string;
  let zoneId: string;

  async function user(label: string) {
    const email = `${label.toLowerCase().replace(/[^a-z]+/g, '-')}-${randomUUID().slice(0, 8)}@test.dev`;
    const res = await h.http
      .post(`${API}/auth/register`)
      .send({ firstName: label, lastName: 'Sumar', email, password: PASSWORD })
      .expect(201);
    return { token: res.body.accessToken as string };
  }
  type Opts = { free?: 'POST_SUCCESS' | 'NEW'; plan?: 'PRO'; contact?: boolean; service?: string };
  async function pro(label: string, o: Opts = {}) {
    const u = await user(label);
    const res = await h.http
      .post(`${API}/pro/profile`)
      .set(auth(u.token))
      .send({ headline: `${label} en Tandil`, yearsExperience: 4, serviceIds: [o.service ?? serviceId], zoneIds: [zoneId] })
      .expect(201);
    const id = res.body.id as string;
    if (o.free !== 'NEW') await h.dataSource.query(`UPDATE professional_profiles SET first_success_at = now() WHERE id = $1`, [id]);
    if (o.plan === 'PRO') await h.dataSource.query(`UPDATE professional_profiles SET plan_tier = 'PRO' WHERE id = $1`, [id]);
    await h.dataSource.query(`UPDATE professional_profiles SET takes_urgencies = true WHERE id = $1`, [id]);
    if (o.contact) {
      await h.http
        .patch(`${API}/pro/contact`)
        .set(auth(u.token))
        .send({ whatsappEnabled: true, whatsappNumber: '2494123456', callsEnabled: false, requestsEnabled: true, consent: true })
        .expect(200);
    }
    return { ...u, id };
  }
  type Pro = Awaited<ReturnType<typeof pro>>;

  async function newRequest(client: { token: string }, urgency: 'FLEXIBLE' | 'TODAY' | 'URGENT' = 'FLEXIBLE', service = serviceId) {
    const res = await h.http
      .post(`${API}/requests`)
      .set(auth(client.token))
      .send({ serviceId: service, zoneId, title: 'Pierde agua', description: 'Pierde la canilla de la cocina.', urgency })
      .expect(201);
    return res.body.id as string;
  }
  const invite = (client: { token: string }, requestId: string, pros: Pro[], extra: Record<string, unknown> = {}) =>
    h.http.post(`${API}/requests/${requestId}/invitations`).set(auth(client.token)).send({ professionalIds: pros.map((p) => p.id), ...extra });
  const options = (client: { token: string }, requestId: string) =>
    h.http.get(`${API}/requests/${requestId}/invitation-options`).set(auth(client.token));
  const quote = (p: Pro, requestId: string) =>
    h.http.post(`${API}/pro/requests/${requestId}/quote`).set(auth(p.token)).send({ description: 'Arreglo de la canilla', laborAmount: 15000 });
  const count = async (requestId: string) =>
    (await h.dataSource.query(`SELECT count(*)::int AS n FROM request_invitations WHERE request_id = $1`, [requestId]))[0].n as number;
  const ids = (list: { id: string }[]) => list.map((p) => p.id);
  /** Un Free que ya usó todas sus oportunidades discovery. */
  async function exhaust(p: Pro, client: { token: string }) {
    for (let i = 0; i < 5; i++) {
      const dummy = await newRequest(client);
      await h.dataSource.query(
        `INSERT INTO quote_quota_usages (professional_id, request_id, consumed_at, consumes_free_quota) VALUES ($1, $2, now(), true)`,
        [p.id, dummy],
      );
    }
  }
  /** Pedido enviado con un primer invitado, en un servicio propio de cada test (aislado de otros). */
  async function sentRequest(client: { token: string }, first: Pro, urgency: 'FLEXIBLE' | 'TODAY' | 'URGENT' = 'FLEXIBLE', service = serviceId) {
    const id = await newRequest(client, urgency, service);
    await invite(client, id, [first]).expect(200);
    return id;
  }

  beforeAll(async () => {
    h = await startApp({ emailVerification: false, firstSuccessTrial: true, freeOpportunityDelayMinutes: 30 });
    const services: { id: string; slug: string }[] = (await h.http.get(`${API}/services`)).body;
    serviceId = services.find((s) => s.slug === 'plomeria')!.id;
    zoneId = (await h.http.get(`${API}/zones?city=tandil`)).body[0].id;
  }, 60_000);
  afterAll(async () => h?.app.close());

  describe('cuándo se ofrece y cómo se orienta', () => {
    it('sin presupuestos y con lugar: disponible desde el envío, sin esperar; sugerencia destacada a la hora', async () => {
      const client = await user('Cliente espera');
      const first = await pro('Primero');
      const candidate = await pro('Candidato');
      const id = await sentRequest(client, first);
      const o = (await options(client, id).expect(200)).body;
      expect(o).toMatchObject({ state: 'AVAILABLE', emphasis: 'NONE', invited: 1, maxInvitations: 6, remainingInvitations: 5, activeQuotes: 0, suggestAfterMinutes: 60 });
      expect(ids(o.candidates)).toContain(candidate.id);
      expect(ids(o.candidates)).not.toContain(first.id);
      // Pasada la hora sin presupuestos, se destaca.
      await h.dataSource.query(`UPDATE request_invitations SET sent_at = sent_at - interval '61 minutes', available_at = available_at - interval '61 minutes' WHERE request_id = $1`, [id]);
      const later = (await options(client, id).expect(200)).body;
      expect(later).toMatchObject({ state: 'AVAILABLE', emphasis: 'SUGGEST', waitingMinutes: 61 });
      // Nada se suma ni se avisa solo.
      expect(await count(id)).toBe(1);
    });

    it.each(['TODAY', 'URGENT'] as const)('%s: orientación clara desde el inicio', async (urgency) => {
      const client = await user('Cliente urgente');
      const first = await pro(`Primero ${urgency}`);
      const id = await sentRequest(client, first, urgency);
      const o = (await options(client, id).expect(200)).body;
      expect(o).toMatchObject({ state: 'AVAILABLE', emphasis: 'URGENT_GUIDE', urgent: true, waitingMinutes: 0 });
    });

    it('no corresponde si no se envió, si ya hay presupuestos o si cambió de estado', async () => {
      const client = await user('Cliente estados');
      const first = await pro('Primero estados');
      const draft = await newRequest(client);
      expect((await options(client, draft).expect(200)).body.state).toBe('NOT_APPLICABLE');

      const withQuote = await sentRequest(client, first);
      await quote(first, withQuote).expect(201);
      const q = (await options(client, withQuote).expect(200)).body;
      expect(q).toMatchObject({ state: 'NOT_APPLICABLE', emphasis: 'NONE', candidates: [], directContacts: [] });

      const canceled = await sentRequest(client, first);
      await h.http.post(`${API}/requests/${canceled}/cancel`).set(auth(client.token)).expect(200);
      expect((await options(client, canceled).expect(200)).body.state).toBe('NOT_APPLICABLE');
    });
  });

  describe('presupuestos anteriores vencidos', () => {
    it('QUOTES_RECEIVED sin presupuestos activos (vencidos o retirados) y sin elegido: se ofrece y se puede sumar', async () => {
      const client = await user('Cliente vencidos');
      const first = await pro('Primero vencidos');
      const candidate = await pro('Candidato vencidos');
      const id = await sentRequest(client, first);
      await quote(first, id).expect(201);
      const [{ status }] = await h.dataSource.query(`SELECT status FROM service_requests WHERE id = $1`, [id]);
      expect(status).toBe('QUOTES_RECEIVED');
      // Con el presupuesto vigente no corresponde.
      expect((await options(client, id).expect(200)).body.state).toBe('NOT_APPLICABLE');
      // Vence: el pedido sigue en QUOTES_RECEIVED (estado perezoso) pero no hay propuestas activas.
      await h.dataSource.query(`UPDATE quotes SET valid_until = now() - interval '1 hour' WHERE request_id = $1`, [id]);
      const o = (await options(client, id).expect(200)).body;
      expect(o).toMatchObject({ state: 'AVAILABLE', activeQuotes: 0, invited: 1, remainingInvitations: 5 });
      expect(ids(o.candidates)).toContain(candidate.id);
      // Mismas validaciones: el endpoint la acepta, sin duplicar ante un reintento.
      await invite(client, id, [candidate], { addedVia: 'ADD_PROFESSIONALS' }).expect(200);
      await invite(client, id, [candidate], { addedVia: 'ADD_PROFESSIONALS' }).expect(200);
      expect(await count(id)).toBe(2);
    });

    it('con un profesional elegido o presupuestos activos no se ofrece, y se conserva el tope de invitados', async () => {
      const client = await user('Cliente elegido');
      const first = await pro('Primero elegido');
      const id = await sentRequest(client, first);
      await quote(first, id).expect(201);
      await h.dataSource.query(`UPDATE quotes SET status = 'EXPIRED' WHERE request_id = $1`, [id]);
      await h.dataSource.query(`UPDATE service_requests SET selected_professional_id = $2, status = 'PROFESSIONAL_SELECTED' WHERE id = $1`, [id, first.id]);
      expect((await options(client, id).expect(200)).body.state).toBe('NOT_APPLICABLE');
    });
  });

  describe('permisos', () => {
    it('solo el dueño; otro cliente, un profesional ajeno y un anónimo no la ven ni la usan', async () => {
      const owner = await user('Dueño');
      const other = await user('Otro cliente');
      const first = await pro('Primero permisos');
      const outsider = await pro('Profesional ajeno');
      const id = await sentRequest(owner, first);
      await options(other, id).expect(404);
      await options(outsider, id).expect(404);
      await h.http.get(`${API}/requests/${id}/invitation-options`).expect(401);
      await invite(other, id, [outsider]).expect(404);
      expect(await count(id)).toBe(1);
    });
  });

  describe('quién puede responder: recomendados y endpoint comparten la regla', () => {
    it('excluye invitados, el propio cliente, pausados, solicitudes apagadas, otro servicio y Free sin cupo', async () => {
      const svc = await freshService();
      const client = await user('Cliente reglas');
      const first = await pro('Primero reglas', { service: svc });
      const ok = await pro('Puede responder', { service: svc });
      const proPlan = await pro('PRO puede', { service: svc, plan: 'PRO' });
      const trial = await pro('Acceso inicial', { service: svc, free: 'NEW' });
      const paused = await pro('Pausado', { service: svc });
      const disabled = await pro('Sin solicitudes', { service: svc, contact: true });
      const noQuota = await pro('Free sin cupo', { service: svc });
      const elsewhere = await pro('Otro oficio');
      await h.dataSource.query(`UPDATE professional_profiles SET status = 'PAUSED' WHERE id = $1`, [paused.id]);
      await h.dataSource.query(`UPDATE professional_profiles SET contact_requests_enabled = false WHERE id = $1`, [disabled.id]);
      await exhaust(noQuota, client);
      const id = await sentRequest(client, first, 'FLEXIBLE', svc);

      const o = (await options(client, id).expect(200)).body;
      const listed = ids(o.candidates);
      expect(listed).toEqual(expect.arrayContaining([ok.id, proPlan.id, trial.id]));
      for (const p of [first, paused, disabled, noQuota, elsewhere]) expect(listed).not.toContain(p.id);

      // El endpoint rechaza lo mismo que las recomendaciones excluyen.
      const reasons: [Pro, string][] = [[paused, 'PROFILE_PAUSED'], [disabled, 'REQUESTS_DISABLED'], [noQuota, 'QUOTA_EXHAUSTED'], [elsewhere, 'SERVICE_NOT_OFFERED']];
      for (const [p, reason] of reasons) {
        const res = await invite(client, id, [p], { addedVia: 'ADD_PROFESSIONALS' }).expect(422);
        expect(res.body).toMatchObject({ code: 'PROFESSIONAL_NOT_ELIGIBLE', details: { professionalId: p.id, reason } });
      }
      expect(await count(id)).toBe(1);
      // Y acepta lo que recomienda.
      await invite(client, id, [ok, proPlan, trial], { addedVia: 'ADD_PROFESSIONALS' }).expect(200);
      expect(await count(id)).toBe(4);
    });

    it('urgente: solo quienes atienden urgencias', async () => {
      const svc = await freshService();
      const client = await user('Cliente urgencias');
      const first = await pro('Primero urg', { service: svc });
      const quiet = await pro('No atiende urgencias', { service: svc });
      await h.dataSource.query(`UPDATE professional_profiles SET takes_urgencies = false WHERE id = $1`, [quiet.id]);
      const id = await sentRequest(client, first, 'URGENT', svc);
      expect(ids((await options(client, id).expect(200)).body.candidates)).not.toContain(quiet.id);
      const res = await invite(client, id, [quiet]).expect(422);
      expect(res.body.details.reason).toBe('NOT_AVAILABLE_TODAY');
    });

    it('revalida al enviar: lo recomendado puede dejar de poder responder entre medio', async () => {
      const svc = await freshService();
      const client = await user('Cliente revalida');
      const first = await pro('Primero reval', { service: svc });
      const a = await pro('Recomendado A', { service: svc });
      const b = await pro('Recomendado B', { service: svc });
      const id = await sentRequest(client, first, 'FLEXIBLE', svc);
      expect(ids((await options(client, id).expect(200)).body.candidates)).toEqual(expect.arrayContaining([a.id, b.id]));
      // A pausa su perfil y B agota su cupo después de mostrarse las recomendaciones.
      await h.dataSource.query(`UPDATE professional_profiles SET status = 'PAUSED' WHERE id = $1`, [a.id]);
      await exhaust(b, client);
      expect((await invite(client, id, [a]).expect(422)).body.details.reason).toBe('PROFILE_PAUSED');
      expect((await invite(client, id, [b]).expect(422)).body.details.reason).toBe('QUOTA_EXHAUSTED');
      expect(await count(id)).toBe(1);
    });

    it('excepción de pedidos dirigidos: un Free sin cupo sí puede recibir un pedido dirigido', async () => {
      const svc = await freshService();
      const client = await user('Cliente dirigido');
      const noQuota = await pro('Free sin cupo dirigido', { service: svc });
      await exhaust(noQuota, client);
      const direct = await newRequest(client, 'FLEXIBLE', svc);
      await invite(client, direct, [noQuota], { targeted: true }).expect(200);
      // La misma persona, en descubrimiento, no.
      const discovery = await newRequest(client, 'FLEXIBLE', svc);
      expect((await invite(client, discovery, [noQuota]).expect(422)).body.details.reason).toBe('QUOTA_EXHAUSTED');
    });
  });

  describe('límites, duplicados y concurrencia', () => {
    it('máximo de 6 invitados: no se pasa, el estado lo explica y no hay botón sin salida', async () => {
      const svc = await freshService();
      const client = await user('Cliente tope');
      const first = await pro('Primero tope', { service: svc });
      const more = await Promise.all(Array.from({ length: 6 }, (_, i) => pro(`Tope ${i}`, { service: svc })));
      const id = await sentRequest(client, first, 'FLEXIBLE', svc);
      await invite(client, id, more.slice(0, 5), { addedVia: 'ADD_PROFESSIONALS' }).expect(200);
      expect(await count(id)).toBe(6);
      const full = (await options(client, id).expect(200)).body;
      expect(full).toMatchObject({ state: 'LIMIT_REACHED', remainingInvitations: 0, candidates: [] });
      const res = await invite(client, id, [more[5]], { addedVia: 'ADD_PROFESSIONALS' }).expect(422);
      expect(res.body.code).toBe('INVITATION_LIMIT_REACHED');
      expect(await count(id)).toBe(6);
    });

    it('reintentos y envíos simultáneos no duplican ni pasan el tope', async () => {
      const svc = await freshService();
      const client = await user('Cliente concurrente');
      const first = await pro('Primero conc', { service: svc });
      const second = await pro('Segundo conc', { service: svc });
      const set = await Promise.all(Array.from({ length: 6 }, (_, i) => pro(`Conc ${i}`, { service: svc })));
      const id = await sentRequest(client, first, 'FLEXIBLE', svc);
      // Reintento idéntico (doble clic): queda una sola invitación.
      const retry = await Promise.all([1, 2, 3].map(() => invite(client, id, [second], { addedVia: 'ADD_PROFESSIONALS' })));
      expect(retry.map((r) => r.status)).toEqual([200, 200, 200]);
      expect(await count(id)).toBe(2);
      // Dos envíos distintos a la vez: hay lugar para 4 y piden 3 + 3.
      const raced = await Promise.all([
        invite(client, id, set.slice(0, 3), { addedVia: 'ADD_PROFESSIONALS' }),
        invite(client, id, set.slice(3, 6), { addedVia: 'ADD_PROFESSIONALS' }),
      ]);
      expect(raced.map((r) => r.status).sort()).toEqual([200, 422]);
      expect(await count(id)).toBe(5);
      const [{ dupes }] = await h.dataSource.query(
        `SELECT count(*)::int AS dupes FROM (SELECT professional_id FROM request_invitations WHERE request_id = $1 GROUP BY professional_id HAVING count(*) > 1) d`,
        [id],
      );
      expect(dupes).toBe(0);
    });

    it('con los lugares de presupuesto cubiertos no se suma más gente', async () => {
      const svc = await freshService();
      const client = await user('Cliente lugares');
      const pros = await Promise.all(Array.from({ length: 5 }, (_, i) => pro(`Lugar ${i}`, { service: svc, plan: 'PRO' })));
      const extra = await pro('Extra lugares', { service: svc });
      const id = await newRequest(client, 'FLEXIBLE', svc);
      await invite(client, id, pros).expect(200);
      for (const p of pros) await quote(p, id).expect(201);
      const res = await invite(client, id, [extra], { addedVia: 'ADD_PROFESSIONALS' }).expect(409);
      expect(res.body.code).toBe('REQUEST_QUOTE_LIMIT_REACHED');
      expect(await count(id)).toBe(5);
      expect((await options(client, id).expect(200)).body.state).toBe('NOT_APPLICABLE');
    });
  });

  describe('estados vacíos y contacto directo', () => {
    it('sin candidatos explica la situación y ofrece el contacto directo que exista (también a quien no puede responder)', async () => {
      const svc = await freshService();
      const client = await user('Cliente vacío');
      const first = await pro('Primero vacío', { service: svc });
      const direct = await pro('Solo contacto directo', { service: svc, contact: true });
      const noQuota = await pro('Free sin cupo con WhatsApp', { service: svc, contact: true });
      await h.dataSource.query(`UPDATE professional_profiles SET contact_requests_enabled = false WHERE id = $1`, [direct.id]);
      await exhaust(noQuota, client);
      const id = await sentRequest(client, first, 'FLEXIBLE', svc);
      const o = (await options(client, id).expect(200)).body;
      expect(o.state).toBe('NO_CANDIDATES');
      expect(o.candidates).toEqual([]);
      expect(ids(o.directContacts)).toEqual(expect.arrayContaining([direct.id, noQuota.id]));
      expect(o.directContacts.every((p: { contactChannels: { whatsapp: boolean; phone: boolean } }) => p.contactChannels.whatsapp || p.contactChannels.phone)).toBe(true);
      // El número nunca viaja en la lista.
      expect(JSON.stringify(o)).not.toContain('2494123456');
    });

    it('sin candidatos ni contacto directo: estado vacío honesto, sin nada que ofrecer', async () => {
      const client = await user('Cliente solo');
      const svc = await freshService();
      const first = await pro('Único', { service: svc });
      const id = await sentRequest(client, first, 'FLEXIBLE', svc);
      const o = (await options(client, id).expect(200)).body;
      expect(o).toMatchObject({ state: 'NO_CANDIDATES', candidates: [], directContacts: [] });
    });

    it('un clic de WhatsApp no crea invitación, no cuenta como presupuesto ni consume cupo', async () => {
      const svc = await freshService();
      const client = await user('Cliente contacto');
      const first = await pro('Primero contacto', { service: svc });
      const direct = await pro('Contacto directo', { service: svc, contact: true });
      const id = await sentRequest(client, first, 'FLEXIBLE', svc);
      const reveal = await h.http.post(`${API}/professionals/${direct.id}/contact`).send({ channel: 'WHATSAPP', sessionKey: 'sesion-anonima-de-prueba-0002' }).expect(200);
      expect(reveal.body).toBeDefined();
      expect(await count(id)).toBe(1);
      const [{ q }] = await h.dataSource.query(`SELECT count(*)::int AS q FROM quotes WHERE request_id = $1`, [id]);
      expect(q).toBe(0);
      const [{ u }] = await h.dataSource.query(`SELECT count(*)::int AS u FROM quote_quota_usages WHERE professional_id = $1`, [direct.id]);
      expect(u).toBe(0);
    });
  });

  describe('medición', () => {
    it('marca solo lo sumado desde "Sumar profesionales" a un pedido ya enviado', async () => {
      const client = await user('Cliente medición');
      const otherServiceId = await freshService();
      const first = await pro('Primero med', { service: otherServiceId });
      const added = await pro('Sumado med', { service: otherServiceId });
      const plain = await pro('Sumado común', { service: otherServiceId });
      const id = await newRequest(client, 'FLEXIBLE', otherServiceId);
      // En el envío original la marca se ignora: todavía no había nada que "sumar".
      await invite(client, id, [first], { addedVia: 'ADD_PROFESSIONALS' }).expect(200);
      await invite(client, id, [added], { addedVia: 'ADD_PROFESSIONALS' }).expect(200);
      await invite(client, id, [plain]).expect(200);
      const rows = await h.dataSource.query(`SELECT professional_id, added_via FROM request_invitations WHERE request_id = $1`, [id]);
      const via = (p: Pro) => rows.find((r: { professional_id: string }) => r.professional_id === p.id).added_via;
      expect(via(first)).toBeNull();
      expect(via(added)).toBe('ADD_PROFESSIONALS');
      expect(via(plain)).toBeNull();
      await invite(client, id, [added], { addedVia: 'otra cosa' }).expect(400);
    });
  });

  // Servicios sin profesionales para el estado vacío exacto.
  async function freshService() {
    const rows: { id: string }[] = await h.dataSource.query(
      `SELECT s.id FROM services s WHERE s.active AND NOT EXISTS (SELECT 1 FROM professional_services ps WHERE ps.service_id = s.id) ORDER BY s.id`,
    );
    return rows[0].id;
  }
});
