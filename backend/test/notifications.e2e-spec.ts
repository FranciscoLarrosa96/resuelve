import { randomUUID } from 'crypto';
import { describeE2E, Harness, startApp } from './app.harness';

const API = '/api/v1';
const PASSWORD = 'una-clave-bien-larga';
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

type Summary = {
  client: { unread: number; completionDue: number; closureUnread: number };
  professional: {
    unread: number;
    completionDue: number;
    requests: { total: number; PENDING: number; QUOTED: number; SELECTED: number };
    agenda: number;
  } | null;
};

/**
 * Notificaciones in-app (presupuesto nuevo, coordinación del horario) y
 * cierre del trabajo por el cliente o el profesional elegido después del
 * horario, con idempotencia y concurrencia decididas por la base.
 */
describeE2E('Notificaciones y cierre del trabajo (e2e)', () => {
  let h: Harness;
  const svc: Record<string, string> = {};
  const zone: Record<string, string> = {};

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function register(label: string) {
    const email = `${label}-${randomUUID().slice(0, 8)}@test.dev`;
    const res = await h.http
      .post(`${API}/auth/register`)
      .send({ firstName: label, lastName: 'Aviso', email, password: PASSWORD, phone: '+54 249 555 7777' })
      .expect(202);
    const verify = await h.http
      .post(`${API}/auth/register/verify`)
      .send({ verificationSessionId: res.body.verificationSessionId, code: h.mail.lastCodeFor(email) })
      .expect(200);
    return { email, token: verify.body.accessToken as string };
  }

  async function pro(label: string) {
    const user = await register(label);
    const res = await h.http
      .post(`${API}/pro/profile`)
      .set(auth(user.token))
      .send({
        headline: `${label} en Tandil`,
        yearsExperience: 3,
        serviceIds: [svc.plomeria],
        zoneIds: [zone['villa-italia']],
      })
      .expect(201);
    return { ...user, proId: res.body.id as string };
  }

  async function createRequest(token: string, title = 'Problema eléctrico') {
    const res = await h.http
      .post(`${API}/requests`)
      .set(auth(token))
      .send({
        serviceId: svc.plomeria,
        zoneId: zone['villa-italia'],
        title,
        description: 'Salta la térmica cada vez que prendo el horno.',
        exactAddress: 'Calle Privada 742',
        urgency: 'FLEXIBLE',
      })
      .expect(201);
    return res.body.id as string;
  }

  const quoteBody = { description: 'Revisión del tablero y cambio de térmica', laborAmount: 30000 };
  const sendQuote = (token: string, requestId: string) =>
    h.http.post(`${API}/pro/requests/${requestId}/quote`).set(auth(token)).send(quoteBody);

  const summary = async (token: string): Promise<Summary> =>
    (await h.http.get(`${API}/me/notifications/summary`).set(auth(token)).expect(200)).body;
  const list = async (token: string, audience: 'CLIENT' | 'PROFESSIONAL', unread = true) =>
    (await h.http.get(`${API}/me/notifications`).query({ audience, unread, pageSize: 50 }).set(auth(token)).expect(200))
      .body.items as {
      id: string;
      type: string;
      requestId: string;
      requestTitle: string;
      professionalName: string | null;
      readAt: string | null;
    }[];
  const readByRequest = (token: string, requestId: string, audience: 'CLIENT' | 'PROFESSIONAL') =>
    h.http.patch(`${API}/me/notifications/read-by-request/${requestId}`).query({ audience }).set(auth(token));

  /** Cliente + ganador + perdedor, con el presupuesto del ganador aceptado. */
  async function selectedJob() {
    const client = await register('cliente');
    const winner = await pro('ganador');
    const loser = await pro('perdedor');
    const requestId = await createRequest(client.token);
    await h.http
      .post(`${API}/requests/${requestId}/invitations`)
      .set(auth(client.token))
      .send({ professionalIds: [winner.proId, loser.proId] })
      .expect(200);
    const q = await sendQuote(winner.token, requestId).expect(201);
    await sendQuote(loser.token, requestId).expect(201);
    await h.http.post(`${API}/quotes/${q.body.id}/accept`).set(auth(client.token)).expect(200);
    return { client, winner, loser, requestId };
  }

  const propose = (token: string, requestId: string, body: Record<string, unknown> = {}) =>
    h.http
      .post(`${API}/pro/requests/${requestId}/appointments`)
      .set(auth(token))
      .send({ startsAt: new Date(Date.now() + 2 * DAY).toISOString(), durationMinutes: 120, ...body });

  /** Trabajo agendado cuyo horario ya terminó (se corre al pasado sin esperar días). */
  async function endedJob() {
    const job = await selectedJob();
    const appointmentId = (await propose(job.winner.token, job.requestId).expect(200)).body.appointment
      .id as string;
    await h.http.post(`${API}/appointments/${appointmentId}/confirm`).set(auth(job.client.token)).expect(200);
    await h.dataSource.query(
      `UPDATE appointments SET scheduled_start = now() - interval '3 hours', scheduled_end = now() - interval '1 hour' WHERE id = $1`,
      [appointmentId],
    );
    return { ...job, appointmentId };
  }

  const complete = (token: string, requestId: string) =>
    h.http.post(`${API}/requests/${requestId}/complete`).set(auth(token));

  const dbState = async (requestId: string) => {
    const [r] = await h.dataSource.query(
      `SELECT status, completed_at, completed_by, selected_professional_id FROM service_requests WHERE id = $1`,
      [requestId],
    );
    const appts: { status: string }[] = await h.dataSource.query(
      `SELECT status FROM appointments WHERE request_id = $1 ORDER BY created_at DESC`,
      [requestId],
    );
    return { request: r, latest: appts[0]?.status };
  };

  beforeAll(async () => {
    h = await startApp();
    for (const s of (await h.http.get(`${API}/services`).expect(200)).body) svc[s.slug] = s.id;
    for (const z of (await h.http.get(`${API}/zones`).expect(200)).body) zone[z.slug] = z.id;
  }, 60_000);

  afterAll(async () => {
    await h?.app.close();
  });

  // ---- Presupuesto nuevo ----------------------------------------------------
  describe('presupuesto recibido', () => {
    let client: Awaited<ReturnType<typeof register>>;
    let proA: Awaited<ReturnType<typeof pro>>;
    let proB: Awaited<ReturnType<typeof pro>>;
    let requestId: string;
    let otherRequestId: string;

    beforeAll(async () => {
      client = await register('cli-noti');
      proA = await pro('pro-a');
      proB = await pro('pro-b');
      requestId = await createRequest(client.token);
      otherRequestId = await createRequest(client.token, 'Canilla que gotea');
      for (const id of [requestId, otherRequestId]) {
        await h.http
          .post(`${API}/requests/${id}/invitations`)
          .set(auth(client.token))
          .send({ professionalIds: [proA.proId, proB.proId] })
          .expect(200);
      }
    });

    it('sin presupuestos no hay novedades', async () => {
      expect(await summary(client.token)).toEqual({
        client: { unread: 0, completionDue: 0, closureUnread: 0 },
        professional: null,
      });
    });

    it('un presupuesto crea UNA notificación para el cliente dueño (doble submit incluido)', async () => {
      const [a, b] = await Promise.all([sendQuote(proA.token, requestId), sendQuote(proA.token, requestId)]);
      expect([a.status, b.status].sort()).toEqual([201, 409]);
      const items = await list(client.token, 'CLIENT');
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({
        type: 'CLIENT_QUOTE_RECEIVED',
        requestId,
        requestTitle: 'Problema eléctrico',
        professionalName: 'pro-a Aviso',
        readAt: null,
      });
      // Sin datos sensibles en la notificación.
      const json = JSON.stringify(items);
      expect(json).not.toContain('Calle Privada');
      expect(json).not.toContain('555 7777');
      expect(json).not.toContain('Salta la térmica');
      // Quien presupuesta no se notifica a sí mismo; su "Nueva solicitud" de ESTA
      // solicitud quedó leída al responderla (solo queda la otra, sin responder).
      expect((await summary(proA.token)).professional).toMatchObject({
        unread: 1,
        completionDue: 0,
        requests: { total: 1, PENDING: 1, QUOTED: 0, SELECTED: 0 },
        agenda: 0,
      });
      expect((await summary(proA.token)).client.unread).toBe(0);
    });

    it('cuenta por solicitud y marca leídas solo las de ESA solicitud', async () => {
      await sendQuote(proB.token, requestId).expect(201);
      await sendQuote(proA.token, otherRequestId).expect(201);
      expect((await summary(client.token)).client.unread).toBe(3);

      const res = await readByRequest(client.token, requestId, 'CLIENT').expect(200);
      expect(res.body.client.unread).toBe(1);
      const unread = await list(client.token, 'CLIENT');
      expect(unread.map((n) => n.requestId)).toEqual([otherRequestId]);
      // Leer no borra: siguen en la lista completa con readAt.
      const all = await list(client.token, 'CLIENT', false);
      expect(all).toHaveLength(3);
      expect(all.filter((n) => n.requestId === requestId).every((n) => n.readAt)).toBe(true);
    });

    it('ownership estricto: otra persona o el modo equivocado → 404', async () => {
      const stranger = await register('extranio');
      await readByRequest(stranger.token, otherRequestId, 'CLIENT').expect(404);
      // Un profesional invitado no puede marcar las del cliente, ni hay notificaciones suyas ajenas.
      await readByRequest(proA.token, otherRequestId, 'CLIENT').expect(404);
      await readByRequest(stranger.token, otherRequestId, 'PROFESSIONAL').expect(404);
      await readByRequest(proA.token, otherRequestId, 'PROFESSIONAL').expect(200);
      await h.http
        .get(`${API}/me/notifications`)
        .query({ audience: 'OTRO' })
        .set(auth(client.token))
        .expect(400);
      expect((await summary(client.token)).client.unread).toBe(1);
    });

    it('un presupuesto retirado deja de ser novedad', async () => {
      const quotes = (
        await h.http.get(`${API}/requests/${otherRequestId}/quotes`).set(auth(client.token)).expect(200)
      ).body as { id: string }[];
      await h.http.post(`${API}/pro/quotes/${quotes[0].id}/withdraw`).set(auth(proA.token)).expect(200);
      expect((await summary(client.token)).client.unread).toBe(0);
    });
  });

  // ---- Coordinación --------------------------------------------------------
  describe('elección y horario', () => {
    it('elegido, propuesta, cambio, confirmación, reprogramación y rechazo notifican a la otra parte', async () => {
      const job = await selectedJob();
      // Elegido: solo el ganador; el cliente ya decidió (sus avisos de presupuesto quedan leídos).
      expect(await list(job.winner.token, 'PROFESSIONAL')).toEqual([
        expect.objectContaining({ type: 'PROFESSIONAL_SELECTED', requestId: job.requestId }),
      ]);
      expect(await list(job.loser.token, 'PROFESSIONAL')).toEqual([]);
      expect((await summary(job.client.token)).client.unread).toBe(0);

      const first = (await propose(job.winner.token, job.requestId).expect(200)).body.appointment.id;
      expect((await list(job.client.token, 'CLIENT')).map((n) => n.type)).toEqual([
        'CLIENT_APPOINTMENT_PROPOSED',
      ]);
      // Cambiar la propuesta reemplaza el aviso anterior (sigue siendo 1).
      const second = (
        await propose(job.winner.token, job.requestId, {
          startsAt: new Date(Date.now() + 3 * DAY).toISOString(),
          replacesAppointmentId: first,
        }).expect(200)
      ).body.appointment.id;
      expect((await summary(job.client.token)).client.unread).toBe(1);

      await h.http.post(`${API}/appointments/${second}/confirm`).set(auth(job.client.token)).expect(200);
      expect((await list(job.winner.token, 'PROFESSIONAL')).map((n) => n.type)).toEqual([
        'PRO_APPOINTMENT_CONFIRMED',
        'PROFESSIONAL_SELECTED',
      ]);
      // Confirmar es acción propia del cliente: no le llega "horario confirmado".
      expect((await list(job.client.token, 'CLIENT', false)).map((n) => n.type)).not.toContain(
        'PRO_APPOINTMENT_CONFIRMED',
      );

      const third = (
        await propose(job.winner.token, job.requestId, {
          startsAt: new Date(Date.now() + 4 * DAY).toISOString(),
          replacesAppointmentId: second,
        }).expect(200)
      ).body.appointment.id;
      expect((await list(job.client.token, 'CLIENT')).map((n) => n.type)).toEqual([
        'CLIENT_APPOINTMENT_RESCHEDULED',
      ]);

      await h.http.post(`${API}/appointments/${third}/decline`).set(auth(job.client.token)).expect(200);
      const proUnread = await list(job.winner.token, 'PROFESSIONAL');
      // El rechazo reemplaza al "confirmado" anterior.
      expect(proUnread.map((n) => n.type)).toEqual(['PRO_APPOINTMENT_DECLINED', 'PROFESSIONAL_SELECTED']);
      // Nunca a sí mismo.
      expect((await list(job.winner.token, 'CLIENT', false)).length).toBe(0);
    });

    it('los contadores de cliente y profesional no se mezclan en la misma cuenta', async () => {
      const job = await selectedJob();
      // El ganador también es cliente de otro pedido que recibió un presupuesto.
      const ownRequest = await createRequest(job.winner.token, 'Pintura del living');
      const other = await pro('otro');
      await h.http
        .post(`${API}/requests/${ownRequest}/invitations`)
        .set(auth(job.winner.token))
        .send({ professionalIds: [other.proId] })
        .expect(200);
      await sendQuote(other.token, ownRequest).expect(201);
      expect(await summary(job.winner.token)).toMatchObject({
        client: { unread: 1, completionDue: 0 },
        professional: { unread: 1, completionDue: 0 },
      });
      await readByRequest(job.winner.token, job.requestId, 'PROFESSIONAL').expect(200);
      expect(await summary(job.winner.token)).toMatchObject({
        client: { unread: 1, completionDue: 0 },
        professional: { unread: 0, completionDue: 0 },
      });
    });
  });

  // ---- Dónde está la novedad (sidebar / pestaña / Agenda) -------------------
  describe('novedades accionables del profesional', () => {
    const invite = (token: string, requestId: string, ids: string[]) =>
      h.http
        .post(`${API}/requests/${requestId}/invitations`)
        .set(auth(token))
        .send({ professionalIds: ids })
        .expect(200);
    const pro$ = async (token: string) => (await summary(token)).professional!;

    it('1 nueva solicitud → Solicitudes 1 · Nuevas 1; abrirla baja ambos', async () => {
      const client = await register('cli-nueva');
      const p = await pro('pro-nueva');
      const requestId = await createRequest(client.token);
      await invite(client.token, requestId, [p.proId]);
      expect(await pro$(p.token)).toMatchObject({
        unread: 1,
        requests: { total: 1, PENDING: 1, QUOTED: 0, SELECTED: 0 },
        agenda: 0,
      });
      const [item] = await list(p.token, 'PROFESSIONAL');
      expect(item).toMatchObject({
        type: 'PRO_REQUEST_RECEIVED',
        requestId,
        section: 'REQUESTS',
        tab: 'PENDING',
      });
      // Nunca al cliente que invita.
      expect((await summary(client.token)).client.unread).toBe(0);
      // Reinvitar al mismo no duplica.
      await invite(client.token, requestId, [p.proId]);
      expect((await pro$(p.token)).requests.PENDING).toBe(1);

      const read = await readByRequest(p.token, requestId, 'PROFESSIONAL').expect(200);
      expect(read.body.professional).toMatchObject({ unread: 0, requests: { total: 0, PENDING: 0 } });
    });

    it('1 presupuesto aceptado → Solicitudes 1 · Aceptadas 1 (la "Nueva" ya se leyó al presupuestar)', async () => {
      const job = await selectedJob();
      expect(await pro$(job.winner.token)).toMatchObject({
        unread: 1,
        requests: { total: 1, PENDING: 0, SELECTED: 1 },
        agenda: 0,
      });
      // El perdedor no tiene nada pendiente de esta solicitud.
      expect(await pro$(job.loser.token)).toMatchObject({ unread: 0, requests: { total: 0 } });
    });

    it('1 nueva + 1 aceptada → Solicitudes 2 · Nuevas 1 · Aceptadas 1', async () => {
      const job = await selectedJob();
      const client2 = await register('cli-otra');
      const other = await createRequest(client2.token, 'Canilla que pierde');
      await invite(client2.token, other, [job.winner.proId]);
      expect(await pro$(job.winner.token)).toMatchObject({
        unread: 2,
        requests: { total: 2, PENDING: 1, SELECTED: 1 },
        agenda: 0,
      });
      // Abrir UNA solicitud no marca las otras pestañas.
      await readByRequest(job.winner.token, other, 'PROFESSIONAL').expect(200);
      expect(await pro$(job.winner.token)).toMatchObject({ requests: { total: 1, PENDING: 0, SELECTED: 1 } });
    });

    it('horario confirmado → Agenda (no suma en Solicitudes); se lee por sección', async () => {
      const job = await selectedJob();
      await readByRequest(job.winner.token, job.requestId, 'PROFESSIONAL').expect(200);
      const appointmentId = (await propose(job.winner.token, job.requestId).expect(200)).body.appointment
        .id as string;
      await h.http
        .post(`${API}/appointments/${appointmentId}/confirm`)
        .set(auth(job.client.token))
        .expect(200);
      expect(await pro$(job.winner.token)).toMatchObject({ unread: 1, requests: { total: 0 }, agenda: 1 });
      const [item] = await list(job.winner.token, 'PROFESSIONAL');
      expect(item).toMatchObject({ type: 'PRO_APPOINTMENT_CONFIRMED', section: 'AGENDA', tab: null });
      await h.http
        .patch(`${API}/me/notifications/read-by-request/${job.requestId}`)
        .query({ audience: 'PROFESSIONAL', section: 'REQUESTS' })
        .set(auth(job.winner.token))
        .expect(200);
      expect((await pro$(job.winner.token)).agenda).toBe(1); // otra sección: no la toca
      await h.http
        .patch(`${API}/me/notifications/read-by-request/${job.requestId}`)
        .query({ audience: 'PROFESSIONAL', section: 'AGENDA' })
        .set(auth(job.winner.token))
        .expect(200);
      expect((await pro$(job.winner.token)).agenda).toBe(0);
    });

    it('"Necesitan otro horario" va a Aceptadas (se propone otra fecha desde la solicitud)', async () => {
      const job = await selectedJob();
      await readByRequest(job.winner.token, job.requestId, 'PROFESSIONAL').expect(200);
      const appointmentId = (await propose(job.winner.token, job.requestId).expect(200)).body.appointment
        .id as string;
      await h.http
        .post(`${API}/appointments/${appointmentId}/decline`)
        .set(auth(job.client.token))
        .expect(200);
      expect(await pro$(job.winner.token)).toMatchObject({ requests: { total: 1, SELECTED: 1 }, agenda: 0 });
    });

    it('responder "No disponible" o que el cliente cancele deja de pedir algo', async () => {
      const client = await register('cli-cancela');
      const a = await pro('pro-rechaza');
      const b = await pro('pro-cancelada');
      const requestId = await createRequest(client.token);
      await invite(client.token, requestId, [a.proId, b.proId]);
      await h.http.post(`${API}/pro/requests/${requestId}/decline`).set(auth(a.token)).expect(200);
      expect((await pro$(a.token)).requests.PENDING).toBe(0);
      expect((await pro$(b.token)).requests.PENDING).toBe(1);
      await h.http.post(`${API}/requests/${requestId}/cancel`).set(auth(client.token)).expect(200);
      expect((await pro$(b.token)).requests.PENDING).toBe(0);
    });

    it('section inválida → 400', async () => {
      const job = await selectedJob();
      await h.http
        .patch(`${API}/me/notifications/read-by-request/${job.requestId}`)
        .query({ audience: 'PROFESSIONAL', section: 'TODO' })
        .set(auth(job.winner.token))
        .expect(400);
    });
  });

  describe('filtros agrupados de "Mis solicitudes"', () => {
    it('group agrupa estados y respeta el dueño', async () => {
      const job = await selectedJob();
      const draft = await createRequest(job.client.token, 'Borrador');
      const ids = async (query: Record<string, string>) =>
        (
          await h.http.get(`${API}/requests/mine`).query(query).set(auth(job.client.token)).expect(200)
        ).body.items.map((r: { id: string }) => r.id);
      expect(await ids({ group: 'COORDINATING' })).toEqual([job.requestId]);
      expect((await ids({ group: 'ACTIVE' })).sort()).toEqual([job.requestId, draft].sort());
      expect(await ids({ group: 'QUOTES' })).toEqual([]);
      expect(await ids({ group: 'DONE' })).toEqual([]);
      await h.http
        .get(`${API}/requests/mine`)
        .query({ group: 'OTRO' })
        .set(auth(job.client.token))
        .expect(400);
      await h.http
        .get(`${API}/requests/mine`)
        .query({ group: 'DONE', status: 'DRAFT' })
        .set(auth(job.client.token))
        .expect(422);
    });
  });

  // ---- Cierre del trabajo ---------------------------------------------------
  describe('cierre después del horario', () => {
    it('pendiente de cierre: se deriva por fecha para ambas partes, sin completar nada', async () => {
      const job = await endedJob();
      expect((await summary(job.client.token)).client.completionDue).toBe(1);
      expect((await summary(job.winner.token)).professional?.completionDue).toBe(1);
      expect((await summary(job.loser.token)).professional?.completionDue).toBe(0);

      const mine = (
        await h.http.get(`${API}/requests/${job.requestId}`).set(auth(job.client.token)).expect(200)
      ).body;
      expect(mine).toMatchObject({ status: 'SCHEDULED', completionDue: true, canReview: false });
      const proView = (
        await h.http.get(`${API}/pro/requests/${job.requestId}`).set(auth(job.winner.token)).expect(200)
      ).body;
      expect(proView.completionDue).toBe(true);
      const loserView = (
        await h.http.get(`${API}/pro/requests/${job.requestId}`).set(auth(job.loser.token)).expect(200)
      ).body;
      expect(loserView.completionDue).toBe(false);

      const due = (
        await h.http.get(`${API}/pro/appointments/completion-due`).set(auth(job.winner.token)).expect(200)
      ).body;
      expect(due).toEqual([expect.objectContaining({ id: job.appointmentId, completionDue: true })]);
      expect(JSON.stringify(due)).not.toContain('Calle Privada');
      await h.http.get(`${API}/pro/appointments/completion-due`).set(auth(job.client.token)).expect(403);

      // Todavía no hay reseña: primero se confirma que el trabajo se hizo.
      const review = await h.http
        .post(`${API}/requests/${job.requestId}/review`)
        .set(auth(job.client.token))
        .send({ rating: 5 });
      expect(review.status).toBe(409);
      expect((await dbState(job.requestId)).request.status).toBe('SCHEDULED');
    });

    it('el cliente confirma "Sí, se realizó": COMPLETED para ambos y se habilita la reseña', async () => {
      const job = await endedJob();
      const res = await complete(job.client.token, job.requestId).expect(200);
      expect(res.body).toMatchObject({
        status: 'COMPLETED',
        completedBy: 'CLIENT',
        completionDue: false,
        canReview: true,
        appointment: { id: job.appointmentId, status: 'COMPLETED' },
      });
      expect(await summary(job.client.token)).toMatchObject({ client: { completionDue: 0 } });
      expect((await summary(job.winner.token)).professional?.completionDue).toBe(0);
      const proView = (
        await h.http.get(`${API}/pro/requests/${job.requestId}`).set(auth(job.winner.token)).expect(200)
      ).body;
      expect(proView).toMatchObject({ status: 'COMPLETED', completedBy: 'CLIENT', contact: null });
      const pub = (await h.http.get(`${API}/professionals/${job.winner.proId}`).expect(200)).body;
      expect(pub.completedJobsCount).toBe(1);
      expect(JSON.stringify(pub)).not.toContain('completedBy');

      // Ya realizado: repetirlo (cliente o profesional) no cambia nada.
      const before = (await dbState(job.requestId)).request.completed_at;
      await complete(job.client.token, job.requestId).expect(200);
      const again = await complete(job.winner.token, job.requestId).expect(200);
      expect(again.body.status).toBe('COMPLETED');
      expect((await dbState(job.requestId)).request).toMatchObject({
        completed_at: before,
        completed_by: 'CLIENT',
      });

      await h.http
        .post(`${API}/requests/${job.requestId}/review`)
        .set(auth(job.client.token))
        .send({ rating: 5 })
        .expect(201);
    });

    it('el profesional lo marca realizado: la vista es la suya y el cliente puede reseñar', async () => {
      const job = await endedJob();
      const res = await complete(job.winner.token, job.requestId).expect(200);
      expect(res.body).toMatchObject({
        status: 'COMPLETED',
        completedBy: 'PROFESSIONAL',
        selectedByClient: true,
      });
      const mine = (
        await h.http.get(`${API}/requests/${job.requestId}`).set(auth(job.client.token)).expect(200)
      ).body;
      expect(mine).toMatchObject({ status: 'COMPLETED', canReview: true });
    });

    it('cliente y profesional a la vez (dos pestañas): una sola transición', async () => {
      const job = await endedJob();
      const results = await Promise.all([
        complete(job.client.token, job.requestId),
        complete(job.winner.token, job.requestId),
        complete(job.client.token, job.requestId),
      ]);
      expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
      const state = await dbState(job.requestId);
      expect(state.request.status).toBe('COMPLETED');
      expect(state.latest).toBe('COMPLETED');
      expect(['CLIENT', 'PROFESSIONAL']).toContain(state.request.completed_by);
      const pub = (await h.http.get(`${API}/professionals/${job.winner.proId}`).expect(200)).body;
      expect(pub.completedJobsCount).toBe(1);
    });

    it('"necesitamos reprogramar" después del horario: mismo profesional, nueva propuesta', async () => {
      const job = await endedJob();
      const res = await h.http
        .post(`${API}/appointments/${job.appointmentId}/cancel`)
        .set(auth(job.client.token))
        .expect(200);
      expect(res.body).toMatchObject({
        status: 'PROFESSIONAL_SELECTED',
        selectedProfessionalId: job.winner.proId,
        completionDue: false,
        appointment: { id: job.appointmentId, status: 'CANCELLED', cancelledBy: 'CLIENT' },
      });
      expect((await list(job.winner.token, 'PROFESSIONAL')).map((n) => n.type)).toContain(
        'PRO_APPOINTMENT_DECLINED',
      );
      // Ya no se puede cerrar: no hay horario confirmado.
      expect((await complete(job.winner.token, job.requestId)).status).toBe(409);
      await propose(job.winner.token, job.requestId).expect(200);
      expect((await list(job.client.token, 'CLIENT')).map((n) => n.type)).toEqual([
        'CLIENT_APPOINTMENT_PROPOSED',
      ]);
    });

    it('el profesional reprograma después del horario: vuelve a quedar por confirmar', async () => {
      const job = await endedJob();
      const res = await propose(job.winner.token, job.requestId, {
        replacesAppointmentId: job.appointmentId,
      }).expect(200);
      expect(res.body).toMatchObject({
        status: 'PROFESSIONAL_SELECTED',
        appointment: { status: 'PROPOSED' },
      });
      expect((await list(job.client.token, 'CLIENT')).map((n) => n.type)).toEqual([
        'CLIENT_APPOINTMENT_RESCHEDULED',
      ]);
    });

    it('reprogramar vs completar a la vez: la base decide y nunca queda mezclado', async () => {
      for (let i = 0; i < 3; i++) {
        const job = await endedJob();
        await Promise.all([
          h.http.post(`${API}/appointments/${job.appointmentId}/cancel`).set(auth(job.client.token)),
          complete(job.winner.token, job.requestId),
        ]);
        const { request, latest } = await dbState(job.requestId);
        const pair = `${request.status}/${latest}`;
        expect(['COMPLETED/COMPLETED', 'PROFESSIONAL_SELECTED/CANCELLED']).toContain(pair);
        expect(request.selected_professional_id).toBe(job.winner.proId);
      }
    });
  });
});
