import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { activateReferral } from '../src/acquisition/referrals';
import { NotificationType } from '../src/notifications/notification.entity';
import { notify } from '../src/notifications/notify';
import { describeE2E, Harness, startApp } from './app.harness';

const API = '/api/v1';
const PASSWORD = 'una-clave-bien-larga';
const DAY = 24 * 3600 * 1000;
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

type Item = {
  id: string;
  type: string;
  requestId: string | null;
  requestTitle: string | null;
  professionalName: string | null;
  completedBy: string | null;
  rewardDays: number | null;
  route: string;
  readAt: string | null;
};
type Page = { items: Item[]; page: number; pageSize: number; total: number };

/**
 * Fase 7: centro de notificaciones (feed, leído, "marcar todas", idempotencia,
 * ownership, oportunidades demoradas), Guardar profesional, Mis profesionales,
 * historial, recontratación (siempre TARGETED y sin consumir Free), reseña
 * post-trabajo, referidos y recordatorio de cierre.
 */
describeE2E('Fase 7: retención y notificaciones (e2e)', () => {
  let h: Harness;
  let serviceId: string;
  let zoneId: string;

  async function user(label: string, referralCode?: string) {
    const res = await h.http
      .post(`${API}/auth/register`)
      .send({
        firstName: label,
        lastName: 'Retención',
        email: `${label.toLowerCase().replace(/[^a-z0-9]/g, '')}-${randomUUID().slice(0, 8)}@test.dev`,
        password: PASSWORD,
        phone: '+54 249 555 7777',
        ...(referralCode ? { referralCode } : {}),
      })
      .expect(201);
    const me = await h.http.get(`${API}/auth/me`).set(auth(res.body.accessToken)).expect(200);
    return { token: res.body.accessToken as string, userId: me.body.id as string };
  }

  async function pro(label: string, opts: { free?: boolean; referralCode?: string } = {}) {
    const u = await user(label, opts.referralCode);
    const res = await h.http
      .post(`${API}/pro/profile`)
      .set(auth(u.token))
      .send({ headline: `${label} en Tandil`, yearsExperience: 4, serviceIds: [serviceId], zoneIds: [zoneId] })
      .expect(201);
    // Free "de verdad": ya pasó su primer éxito (sin trial), así que rigen demora y cupo.
    if (opts.free) {
      await h.dataSource.query(`UPDATE professional_profiles SET first_success_at = now() WHERE id = $1`, [res.body.id]);
    }
    return { ...u, id: res.body.id as string };
  }

  async function createRequest(token: string, title = 'Problema eléctrico') {
    const res = await h.http
      .post(`${API}/requests`)
      .set(auth(token))
      .send({
        serviceId,
        zoneId,
        title,
        description: 'Salta la térmica cada vez que prendo el horno.',
        exactAddress: 'Calle Privada 742',
        urgency: 'FLEXIBLE',
      })
      .expect(201);
    return res.body.id as string;
  }

  const invite = (token: string, requestId: string, professionalIds: string[], targeted = false) =>
    h.http.post(`${API}/requests/${requestId}/invitations`).set(auth(token)).send({ professionalIds, targeted });
  const quote = (token: string, requestId: string) =>
    h.http
      .post(`${API}/pro/requests/${requestId}/quote`)
      .set(auth(token))
      .send({ description: 'Revisión del tablero y cambio de térmica', laborAmount: 30000 });

  const feed = async (token: string, audience: 'CLIENT' | 'PROFESSIONAL', query: Record<string, unknown> = {}) =>
    (await h.http.get(`${API}/me/notifications`).query({ audience, ...query }).set(auth(token)).expect(200))
      .body as Page;
  const unreadCount = async (token: string, audience: 'CLIENT' | 'PROFESSIONAL') =>
    (await h.http.get(`${API}/me/notifications/unread-count`).query({ audience }).set(auth(token)).expect(200))
      .body.unread as number;
  const ofType = (page: Page, type: string) => page.items.filter((n) => n.type === type);

  /** Cliente + profesional con el presupuesto aceptado (trabajo por coordinar). */
  async function selectedJob(opts: { free?: boolean; client?: Awaited<ReturnType<typeof user>>; pro?: Awaited<ReturnType<typeof pro>> } = {}) {
    const client = opts.client ?? (await user('Cliente'));
    const worker = opts.pro ?? (await pro('Profesional', { free: opts.free }));
    const requestId = await createRequest(client.token);
    // Dirigido: así un Free con demora igual puede presupuestar al instante.
    await invite(client.token, requestId, [worker.id], true).expect(200);
    const q = await quote(worker.token, requestId).expect(201);
    await h.http.post(`${API}/quotes/${q.body.id}/accept`).set(auth(client.token)).expect(200);
    const jobs = (await h.http.get(`${API}/pro/jobs`).set(auth(worker.token)).expect(200)).body.items as {
      id: string;
      requestId: string;
    }[];
    return { client, worker, requestId, quoteId: q.body.id as string, jobId: jobs.find((j) => j.requestId === requestId)!.id };
  }

  const schedule = (job: { worker: { token: string }; jobId: string }, daysAhead = 2, time = '09:30') =>
    h.http
      .post(`${API}/pro/jobs/${job.jobId}/schedule`)
      .set(auth(job.worker.token))
      .send({ scheduledDate: new Date(Date.now() + daysAhead * DAY).toISOString().slice(0, 10), scheduledTime: time, durationMinutes: 60 });

  /** Trabajo agendado cuyo horario ya terminó (se corre al pasado sin esperar). */
  async function endedJob() {
    const job = await selectedJob();
    await schedule(job).expect(200);
    await h.dataSource.query(`UPDATE jobs SET scheduled_date = (now() - interval '2 days')::date WHERE id = $1`, [job.jobId]);
    return job;
  }
  const complete = (job: { worker: { token: string }; jobId: string }) =>
    h.http.post(`${API}/pro/jobs/${job.jobId}/complete`).set(auth(job.worker.token));
  const review = (token: string, requestId: string, rating = 5) =>
    h.http.post(`${API}/requests/${requestId}/review`).set(auth(token)).send({ rating, comment: 'Muy prolijo' });

  /** Un trabajo COMPLETED del cliente con el profesional. */
  async function completedJob(client: Awaited<ReturnType<typeof user>>, worker: Awaited<ReturnType<typeof pro>>) {
    const job = await selectedJob({ client, pro: worker });
    await schedule(job).expect(200);
    await h.dataSource.query(`UPDATE jobs SET scheduled_date = (now() - interval '2 days')::date WHERE id = $1`, [job.jobId]);
    await complete(job).expect(200);
    return job;
  }

  beforeAll(async () => {
    h = await startApp({
      emailVerification: false,
      firstSuccessTrial: false,
      freeOpportunityDelayMinutes: 30,
      urgentFreeOpportunityDelayMinutes: 30,
    });
    serviceId = (await h.http.get(`${API}/services`)).body.find((s: { slug: string }) => s.slug === 'plomeria').id;
    zoneId = (await h.http.get(`${API}/zones`)).body[0].id;
  }, 60_000);
  afterAll(async () => h?.app.close());

  // ---- Centro de notificaciones ---------------------------------------------
  describe('centro de notificaciones', () => {
    it('evento real → notificación → unread +1 → abrir → readAt y el contador baja', async () => {
      const client = await user('Cliente');
      const worker = await pro('Pro');
      const requestId = await createRequest(client.token);
      await invite(client.token, requestId, [worker.id]).expect(200);
      expect(await unreadCount(client.token, 'CLIENT')).toBe(0);

      await quote(worker.token, requestId).expect(201);
      expect(await unreadCount(client.token, 'CLIENT')).toBe(1);
      const [item] = (await feed(client.token, 'CLIENT')).items;
      expect(item).toMatchObject({
        type: 'CLIENT_QUOTE_RECEIVED',
        requestId,
        requestTitle: 'Problema eléctrico',
        professionalName: 'Pro Retención',
        route: `/mis-solicitudes/${requestId}`,
        readAt: null,
      });
      // Sin PII: ni dirección, ni teléfono, ni el texto del pedido.
      const json = JSON.stringify(item);
      expect(json).not.toContain('Calle Privada');
      expect(json).not.toContain('555 7777');
      expect(json).not.toContain('térmica cada vez');

      const opened = await h.http.patch(`${API}/me/notifications/${item.id}/read`).set(auth(client.token)).expect(200);
      expect(opened.body.client.unread).toBe(0);
      expect(await unreadCount(client.token, 'CLIENT')).toBe(0);
      const all = await feed(client.token, 'CLIENT');
      expect(all.items[0].readAt).not.toBeNull(); // no se borra al leer
      const [row] = await h.dataSource.query(`SELECT opened_at FROM notifications WHERE id = $1`, [item.id]);
      expect(row.opened_at).not.toBeNull(); // "abierta": sirve para la tasa de apertura
    });

    it('pagina de a 20 (configurable) y el total no depende de la página', async () => {
      const client = await user('Cliente paginado');
      const worker = await pro('Pro paginado');
      for (let i = 0; i < 3; i++) {
        const id = await createRequest(client.token, `Pedido ${i}`);
        await invite(client.token, id, [worker.id]).expect(200);
        await quote(worker.token, id).expect(201);
      }
      const first = await feed(client.token, 'CLIENT', { pageSize: 2 });
      expect(first).toMatchObject({ page: 1, pageSize: 2, total: 3 });
      expect(first.items).toHaveLength(2);
      const second = await feed(client.token, 'CLIENT', { pageSize: 2, page: 2 });
      expect(second.items).toHaveLength(1);
      expect(new Set([...first.items, ...second.items].map((n) => n.id)).size).toBe(3);
      expect((await feed(client.token, 'CLIENT')).pageSize).toBe(20);
    });

    it('"marcar todas": 3 sin leer → 0, solo del modo pedido', async () => {
      const client = await user('Cliente todas');
      const worker = await pro('Pro todas');
      for (let i = 0; i < 3; i++) {
        const id = await createRequest(client.token, `Pedido ${i}`);
        await invite(client.token, id, [worker.id]).expect(200);
        await quote(worker.token, id).expect(201);
      }
      expect(await unreadCount(client.token, 'CLIENT')).toBe(3);
      // El profesional tiene sus propias "nuevas" (modo profesional) que no se tocan desde el modo cliente.
      const proUnread = await unreadCount(worker.token, 'PROFESSIONAL');
      const res = await h.http.patch(`${API}/me/notifications/read-all`).query({ audience: 'CLIENT' }).set(auth(client.token)).expect(200);
      expect(res.body.client.unread).toBe(0);
      expect(await unreadCount(client.token, 'CLIENT')).toBe(0);
      await h.http.patch(`${API}/me/notifications/read-all`).query({ audience: 'CLIENT' }).set(auth(client.token)).expect(200);
      expect(await unreadCount(worker.token, 'PROFESSIONAL')).toBe(proUnread);
    });

    it('ownership: nadie lee, abre ni marca las notificaciones de otra persona', async () => {
      const a = await selectedJob();
      const stranger = await user('Extraño');
      const [mine] = (await feed(a.worker.token, 'PROFESSIONAL')).items;
      expect(mine).toBeDefined();
      await h.http.patch(`${API}/me/notifications/${mine.id}/read`).set(auth(stranger.token)).expect(404);
      await h.http.patch(`${API}/me/notifications/${mine.id}/read`).set(auth(a.client.token)).expect(404);
      expect((await feed(stranger.token, 'PROFESSIONAL')).items).toEqual([]);
      expect((await feed(stranger.token, 'CLIENT')).total).toBe(0);
      const before = await unreadCount(a.worker.token, 'PROFESSIONAL');
      await h.http.patch(`${API}/me/notifications/read-all`).query({ audience: 'PROFESSIONAL' }).set(auth(stranger.token)).expect(200);
      expect(await unreadCount(a.worker.token, 'PROFESSIONAL')).toBe(before);
      await h.http.patch(`${API}/me/notifications/no-es-uuid/read`).set(auth(a.worker.token)).expect(400);
      await h.http.get(`${API}/me/notifications`).query({ audience: 'OTRO' }).set(auth(a.worker.token)).expect(400);
      await h.http.get(`${API}/me/notifications/unread-count`).expect(401);
    });

    it('idempotencia: procesar el mismo evento dos veces deja una sola notificación', async () => {
      const client = await user('Cliente idem');
      const requestId = await createRequest(client.token);
      const input = { userId: client.userId, type: NotificationType.CLIENT_JOB_STARTED, requestId, dedupeRef: 'job-evento-1' };
      for (let i = 0; i < 2; i++) await h.dataSource.transaction((m) => notify(m, input, null));
      await Promise.all([1, 2].map(() => h.dataSource.transaction((m) => notify(m, input, null))));
      expect((await feed(client.token, 'CLIENT')).total).toBe(1);
      // La propia acción nunca se notifica.
      await h.dataSource.transaction((m) =>
        notify(m, { ...input, dedupeRef: 'job-evento-2' }, client.userId),
      );
      expect((await feed(client.token, 'CLIENT')).total).toBe(1);
    });

    it('una oportunidad Free demorada se anuncia recién cuando se libera; la dirigida, enseguida', async () => {
      const client = await user('Cliente demora');
      const free = await pro('Pro free', { free: true });
      const discovery = await createRequest(client.token, 'Discovery');
      await invite(client.token, discovery, [free.id]).expect(200);
      expect(await unreadCount(free.token, 'PROFESSIONAL')).toBe(0);
      expect((await feed(free.token, 'PROFESSIONAL')).total).toBe(0);
      expect((await h.http.get(`${API}/me/notifications/summary`).set(auth(free.token)).expect(200)).body.professional.requests.total).toBe(0);

      // Dirigida: llega ya, con su propio tipo, y no espera la demora.
      const targeted = await createRequest(client.token, 'Dirigida');
      await invite(client.token, targeted, [free.id], true).expect(200);
      const now = await feed(free.token, 'PROFESSIONAL');
      expect(now.items.map((n) => n.type)).toEqual(['PRO_TARGETED_REQUEST_RECEIVED']);
      expect(now.items[0].route).toBe(`/pro/solicitudes/${targeted}`);

      // Se cumple la demora (sin cron: el aviso existe porque `available_at` ya pasó).
      await h.dataSource.query(
        `UPDATE notifications SET available_at = now() - interval '1 minute' WHERE type = 'PRO_REQUEST_RECEIVED' AND request_id = $1`,
        [discovery],
      );
      const later = await feed(free.token, 'PROFESSIONAL');
      expect(later.items.map((n) => n.type).sort()).toEqual(['PRO_REQUEST_RECEIVED', 'PRO_TARGETED_REQUEST_RECEIVED']);
      expect(await unreadCount(free.token, 'PROFESSIONAL')).toBe(2);
    });
  });

  // ---- Eventos ------------------------------------------------------------------
  describe('eventos del cliente y del profesional', () => {
    it('te eligieron → job detail; presupuesto editado se junta (una novedad sin leer)', async () => {
      const client = await user('Cliente eventos');
      const worker = await pro('Pro eventos');
      const requestId = await createRequest(client.token);
      await invite(client.token, requestId, [worker.id]).expect(200);
      const q = await quote(worker.token, requestId).expect(201);
      for (const total of [31000, 32000]) {
        await h.http
          .patch(`${API}/pro/quotes/${q.body.id}`)
          .set(auth(worker.token))
          .send({ description: 'Revisión del tablero y cambio de térmica', laborAmount: total })
          .expect(200);
      }
      const clientFeed = await feed(client.token, 'CLIENT');
      expect(ofType(clientFeed, 'CLIENT_QUOTE_UPDATED')).toHaveLength(1);
      await h.http.post(`${API}/quotes/${q.body.id}/accept`).set(auth(client.token)).expect(200);

      const jobs = (await h.http.get(`${API}/pro/jobs`).set(auth(worker.token)).expect(200)).body.items;
      const [selected] = ofType(await feed(worker.token, 'PROFESSIONAL'), 'PROFESSIONAL_SELECTED');
      expect(selected.route).toBe(`/pro/trabajos/${jobs[0].id}`);
    });

    it('agendar, reagendar, iniciar y cancelar avisan al cliente; repetir el mismo horario no duplica', async () => {
      const job = await selectedJob();
      await schedule(job).expect(200);
      await schedule(job).expect(200); // doble click
      let items = (await feed(job.client.token, 'CLIENT')).items;
      expect(items.filter((n) => n.type === 'CLIENT_JOB_SCHEDULED')).toHaveLength(1);

      await schedule(job, 3, '11:00').expect(200);
      items = (await feed(job.client.token, 'CLIENT')).items;
      expect(items.filter((n) => n.type === 'CLIENT_JOB_RESCHEDULED' && !n.readAt)).toHaveLength(1);
      // El aviso del horario anterior ya no pide nada.
      expect(items.filter((n) => n.type === 'CLIENT_JOB_SCHEDULED' && !n.readAt)).toHaveLength(0);

      await h.http.post(`${API}/pro/jobs/${job.jobId}/start`).set(auth(job.worker.token)).expect(200);
      await h.http.post(`${API}/pro/jobs/${job.jobId}/start`).set(auth(job.worker.token)).expect(200);
      await h.http.post(`${API}/pro/jobs/${job.jobId}/cancel`).set(auth(job.worker.token)).expect(200);
      const types = (await feed(job.client.token, 'CLIENT')).items.map((n) => n.type);
      expect(types.filter((t) => t === 'CLIENT_JOB_STARTED')).toHaveLength(1);
      expect(types.filter((t) => t === 'CLIENT_JOB_CANCELLED')).toHaveLength(1);
      // Quien actúa no se notifica a sí mismo.
      expect(ofType(await feed(job.worker.token, 'PROFESSIONAL'), 'CLIENT_JOB_CANCELLED')).toEqual([]);
    });

    it('lazo de reseña: completado → REVIEW_AVAILABLE → abrir → reseñar → leída, no se repite y queda "Volver a contratar"', async () => {
      const job = await endedJob();
      await complete(job).expect(200);
      const [available] = ofType(await feed(job.client.token, 'CLIENT'), 'CLIENT_REVIEW_AVAILABLE');
      expect(available).toMatchObject({
        route: `/mis-solicitudes/${job.requestId}#resena`,
        professionalName: 'Profesional Retención',
        completedBy: 'PROFESSIONAL',
        readAt: null,
      });
      await h.http.patch(`${API}/me/notifications/${available.id}/read`).set(auth(job.client.token)).expect(200);
      let detail = (await h.http.get(`${API}/requests/${job.requestId}`).set(auth(job.client.token)).expect(200)).body;
      expect(detail.canReview).toBe(true);

      await review(job.client.token, job.requestId).expect(201);
      await review(job.client.token, job.requestId).expect(409);
      detail = (await h.http.get(`${API}/requests/${job.requestId}`).set(auth(job.client.token)).expect(200)).body;
      expect(detail.canReview).toBe(false);
      expect(detail.review).toMatchObject({ rating: 5 });
      expect(ofType(await feed(job.client.token, 'CLIENT'), 'CLIENT_REVIEW_AVAILABLE').every((n) => n.readAt)).toBe(true);
      // El profesional recibe la reseña y va al perfil.
      const [received] = ofType(await feed(job.worker.token, 'PROFESSIONAL'), 'PRO_REVIEW_RECEIVED');
      expect(received).toMatchObject({ route: '/pro/estadisticas#resenas', readAt: null });
      // Quien reseñó puede volver a contratar.
      const rel = (await h.http.get(`${API}/clients/me/professionals/${job.worker.id}`).set(auth(job.client.token)).expect(200)).body;
      expect(rel).toMatchObject({ canRehire: true, jobsCount: 1 });
    });

    it('si cierra el cliente (por la cita) también recibe el recordatorio de reseña, una sola vez', async () => {
      const client = await user('Cliente cita');
      const worker = await pro('Pro cita');
      const requestId = await createRequest(client.token);
      await invite(client.token, requestId, [worker.id]).expect(200);
      const q = await quote(worker.token, requestId).expect(201);
      await h.http.post(`${API}/quotes/${q.body.id}/accept`).set(auth(client.token)).expect(200);
      const proposed = await h.http
        .post(`${API}/pro/requests/${requestId}/appointments`)
        .set(auth(worker.token))
        .send({ startsAt: new Date(Date.now() + 2 * DAY).toISOString(), durationMinutes: 60 })
        .expect(200);
      await h.http.post(`${API}/appointments/${proposed.body.appointment.id}/confirm`).set(auth(client.token)).expect(200);
      await h.dataSource.query(
        `UPDATE appointments SET scheduled_start = now() - interval '3 hours', scheduled_end = now() - interval '2 hours' WHERE id = $1`,
        [proposed.body.appointment.id],
      );
      await h.http.post(`${API}/requests/${requestId}/complete`).set(auth(client.token)).expect(200);
      await h.http.post(`${API}/requests/${requestId}/complete`).set(auth(client.token)).expect(200);
      const items = (await feed(client.token, 'CLIENT')).items;
      expect(items.filter((n) => n.type === 'CLIENT_REVIEW_AVAILABLE')).toHaveLength(1);
      expect(items.find((n) => n.type === 'CLIENT_REVIEW_AVAILABLE')!.completedBy).toBe('CLIENT');
    });

    it('referidos: registro, activación (con los días) y bonus del referido, sin duplicar', async () => {
      const referrer = await pro('Referente');
      const code = (await h.http.get(`${API}/pro/acquisition/referrals`).set(auth(referrer.token)).expect(200)).body.code;
      const referred = await pro('Referido', { referralCode: code });
      const [registered] = ofType(await feed(referrer.token, 'PROFESSIONAL'), 'PRO_REFERRAL_REGISTERED');
      expect(registered).toMatchObject({ requestId: null, requestTitle: null, route: '/pro/plan#referidos' });
      expect(JSON.stringify(registered)).not.toContain('Referido'); // sin nombre de la persona

      const client = await user('Cliente independiente');
      const requestId = await createRequest(client.token);
      await invite(client.token, requestId, [referred.id], true).expect(200);
      await quote(referred.token, requestId).expect(201);
      const config = h.app.get(ConfigService);
      await Promise.all([1, 2].map(() => h.dataSource.transaction((m) => activateReferral(m, referred.id, config))));

      const activated = ofType(await feed(referrer.token, 'PROFESSIONAL'), 'PRO_REFERRAL_ACTIVATED');
      expect(activated).toHaveLength(1);
      expect(activated[0].rewardDays).toBe(15);
      const bonus = ofType(await feed(referred.token, 'PROFESSIONAL'), 'PRO_BONUS_GRANTED');
      expect(bonus).toHaveLength(1);
      expect(bonus[0].rewardDays).toBe(15);
      expect(ofType(await feed(referrer.token, 'PROFESSIONAL'), 'PRO_BONUS_GRANTED')).toEqual([]);
    });
  });

  // ---- Cierre del trabajo -------------------------------------------------------
  describe('cierre del trabajo sin botón "Iniciar"', () => {
    it('Finalizar se habilita al terminar el horario; antes, 409', async () => {
      const job = await selectedJob();
      await schedule(job).expect(200);
      const early = await complete(job).expect(409);
      expect(early.body.code).toBe('APPOINTMENT_NOT_ENDED');
      await h.dataSource.query(`UPDATE jobs SET scheduled_date = (now() - interval '2 days')::date WHERE id = $1`, [job.jobId]);
      await complete(job).expect(200);
      await complete(job).expect(200); // idempotente
    });

    it('recordatorio para las dos partes desde el fin del horario, sin cron; cerrar o reprogramar lo silencia', async () => {
      const job = await selectedJob();
      await schedule(job).expect(200);
      // Todavía no terminó: nadie recibió nada.
      expect(ofType(await feed(job.client.token, 'CLIENT'), 'CLIENT_JOB_CLOSE_DUE')).toEqual([]);
      expect(ofType(await feed(job.worker.token, 'PROFESSIONAL'), 'PRO_JOB_CLOSE_DUE')).toEqual([]);
      await h.dataSource.query(
        `UPDATE notifications SET available_at = now() - interval '1 minute' WHERE request_id = $1 AND type IN ('CLIENT_JOB_CLOSE_DUE', 'PRO_JOB_CLOSE_DUE')`,
        [job.requestId],
      );
      const [forClient] = ofType(await feed(job.client.token, 'CLIENT'), 'CLIENT_JOB_CLOSE_DUE');
      const [forPro] = ofType(await feed(job.worker.token, 'PROFESSIONAL'), 'PRO_JOB_CLOSE_DUE');
      expect(forClient).toMatchObject({ route: `/mis-solicitudes/${job.requestId}`, readAt: null });
      expect(forPro).toMatchObject({ route: `/pro/trabajos/${job.jobId}`, readAt: null });
      const summary = (await h.http.get(`${API}/me/notifications/summary`).set(auth(job.client.token)).expect(200)).body;
      expect(summary.client.closureUnread).toBe(1);

      // Cerrar el trabajo lo silencia para ambos.
      await h.dataSource.query(`UPDATE jobs SET scheduled_date = (now() - interval '2 days')::date WHERE id = $1`, [job.jobId]);
      await complete(job).expect(200);
      expect(ofType(await feed(job.client.token, 'CLIENT'), 'CLIENT_JOB_CLOSE_DUE').every((n) => n.readAt)).toBe(true);
      expect(ofType(await feed(job.worker.token, 'PROFESSIONAL'), 'PRO_JOB_CLOSE_DUE').every((n) => n.readAt)).toBe(true);
    });

    it('reprogramar reemplaza el recordatorio anterior', async () => {
      const job = await selectedJob();
      await schedule(job, 2).expect(200);
      await schedule(job, 4).expect(200);
      const rows = await h.dataSource.query(
        `SELECT read_at FROM notifications WHERE request_id = $1 AND type = 'CLIENT_JOB_CLOSE_DUE' ORDER BY created_at`,
        [job.requestId],
      );
      expect(rows).toHaveLength(2);
      expect(rows[0].read_at).not.toBeNull();
      expect(rows[1].read_at).toBeNull();
    });
  });

  // ---- Guardar profesional ------------------------------------------------------
  describe('guardar profesional', () => {
    it('guardar → aparece en Guardados → sigue guardado → quitar → desaparece; idempotente', async () => {
      const client = await user('Cliente fav');
      const worker = await pro('Pro fav');
      expect((await h.http.get(`${API}/clients/me/professionals`).set(auth(client.token)).expect(200)).body).toEqual({ hired: [], saved: [] });

      await h.http.post(`${API}/professionals/${worker.id}/favorite`).set(auth(client.token)).expect(200);
      await h.http.post(`${API}/professionals/${worker.id}/favorite`).set(auth(client.token)).expect(200);
      const [{ count }] = await h.dataSource.query(
        `SELECT count(*)::int AS count FROM professional_favorites WHERE client_id = $1`,
        [client.userId],
      );
      expect(count).toBe(1);

      const mine = (await h.http.get(`${API}/clients/me/professionals`).set(auth(client.token)).expect(200)).body;
      expect(mine.hired).toEqual([]); // favorito ≠ contratado
      expect(mine.saved).toHaveLength(1);
      expect(mine.saved[0]).toMatchObject({
        availability: 'AVAILABLE',
        canRequest: true,
        professional: { id: worker.id, displayName: 'Pro fav Retención' },
      });
      expect(JSON.stringify(mine)).not.toContain('@test.dev');
      const rel = (await h.http.get(`${API}/clients/me/professionals/${worker.id}`).set(auth(client.token)).expect(200)).body;
      expect(rel).toMatchObject({ saved: true, canRehire: false, jobsCount: 0, jobs: [] });

      await h.http.delete(`${API}/professionals/${worker.id}/favorite`).set(auth(client.token)).expect(200);
      await h.http.delete(`${API}/professionals/${worker.id}/favorite`).set(auth(client.token)).expect(200);
      expect((await h.http.get(`${API}/clients/me/professionals`).set(auth(client.token)).expect(200)).body.saved).toEqual([]);
      const events = await h.dataSource.query(
        `SELECT type FROM pro_funnel_events WHERE professional_id = $1 AND type IN ('PROFESSIONAL_SAVED', 'PROFESSIONAL_UNSAVED') ORDER BY id`,
        [worker.id],
      );
      expect(events.map((e: { type: string }) => e.type)).toEqual(['PROFESSIONAL_SAVED', 'PROFESSIONAL_UNSAVED']); // una vez cada uno aunque se repita
    });

    it('cada cliente ve solo sus guardados; no se guarda el propio perfil ni uno pausado; siempre se puede quitar', async () => {
      const a = await user('Cliente A');
      const b = await user('Cliente B');
      const worker = await pro('Pro compartido');
      await h.http.post(`${API}/professionals/${worker.id}/favorite`).set(auth(a.token)).expect(200);
      expect((await h.http.get(`${API}/clients/me/professionals`).set(auth(b.token)).expect(200)).body.saved).toEqual([]);
      // B quitando "el suyo" no toca el de A.
      await h.http.delete(`${API}/professionals/${worker.id}/favorite`).set(auth(b.token)).expect(200);
      expect((await h.http.get(`${API}/clients/me/professionals`).set(auth(a.token)).expect(200)).body.saved).toHaveLength(1);

      await h.http.post(`${API}/professionals/${worker.id}/favorite`).set(auth(worker.token)).expect(422);
      await h.http.post(`${API}/professionals/${randomUUID()}/favorite`).set(auth(a.token)).expect(404);
      await h.http.post(`${API}/professionals/${worker.id}/favorite`).expect(401);

      const paused = await pro('Pro pausado nuevo');
      await h.dataSource.query(`UPDATE professional_profiles SET status = 'PAUSED' WHERE id = $1`, [paused.id]);
      await h.http.post(`${API}/professionals/${paused.id}/favorite`).set(auth(a.token)).expect(404);
    });

    it('un profesional pausado sigue visible en guardados y contratados, con las acciones deshabilitadas', async () => {
      const client = await user('Cliente pausa');
      const worker = await pro('Pro que pausa');
      const job = await completedJob(client, worker);
      await h.http.post(`${API}/professionals/${worker.id}/favorite`).set(auth(client.token)).expect(200);
      await h.dataSource.query(`UPDATE professional_profiles SET status = 'PAUSED' WHERE id = $1`, [worker.id]);

      const mine = (await h.http.get(`${API}/clients/me/professionals`).set(auth(client.token)).expect(200)).body;
      expect(mine.hired[0]).toMatchObject({ availability: 'PAUSED', canRequest: false, jobsCount: 1 });
      expect(mine.saved[0]).toMatchObject({ availability: 'PAUSED', canRequest: false });
      const rel = (await h.http.get(`${API}/clients/me/professionals/${worker.id}`).set(auth(client.token)).expect(200)).body;
      expect(rel).toMatchObject({ availability: 'PAUSED', canRehire: false });
      expect(rel.jobs).toHaveLength(1); // el historial se conserva

      // El backend también lo impide aunque se llame a mano.
      const requestId = await createRequest(client.token);
      const res = await invite(client.token, requestId, [worker.id], true).expect(422);
      expect(res.body.code).toBe('PROFESSIONAL_NOT_ELIGIBLE');
      expect(job.requestId).toBeDefined();
      // Sin relación, un perfil pausado ajeno no se revela.
      const stranger = await user('Ajeno');
      await h.http.get(`${API}/clients/me/professionals/${worker.id}`).set(auth(stranger.token)).expect(404);
    });

    it('sin ningún servicio público el perfil figura como no disponible', async () => {
      const client = await user('Cliente sin servicio');
      const worker = await pro('Pro sin servicio');
      await completedJob(client, worker);
      await h.dataSource.query(`DELETE FROM professional_services WHERE professional_id = $1`, [worker.id]);
      const mine = (await h.http.get(`${API}/clients/me/professionals`).set(auth(client.token)).expect(200)).body;
      expect(mine.hired[0]).toMatchObject({ availability: 'UNAVAILABLE', canRequest: false });
    });
  });

  // ---- Mis profesionales + historial + recontratación ------------------------------
  describe('contratados, historial y recontratación', () => {
    it('contratados salen de Jobs COMPLETED, último trabajo primero; guardados, último guardado primero', async () => {
      const client = await user('Cliente orden');
      const first = await pro('Pro uno');
      const second = await pro('Pro dos');
      const firstJob = await completedJob(client, first);
      await completedJob(client, second);
      await h.dataSource.query(`UPDATE jobs SET completed_at = now() - interval '30 days' WHERE id = $1`, [firstJob.jobId]);
      // Un trabajo sin terminar no cuenta como contratación.
      const third = await pro('Pro tres');
      await selectedJob({ client, pro: third });

      const mine = (await h.http.get(`${API}/clients/me/professionals`).set(auth(client.token)).expect(200)).body;
      expect(mine.hired.map((p: { professional: { id: string } }) => p.professional.id)).toEqual([second.id, first.id]);
      expect(mine.hired[0]).toMatchObject({ jobsCount: 1, rehireServiceId: serviceId });
      expect(mine.hired[0].jobs[0]).toMatchObject({ title: 'Problema eléctrico', serviceName: 'Plomería' });
      expect(mine.saved).toEqual([]); // no se guarda automáticamente

      await h.http.post(`${API}/professionals/${first.id}/favorite`).set(auth(client.token)).expect(200);
      await h.http.post(`${API}/professionals/${third.id}/favorite`).set(auth(client.token)).expect(200);
      const saved = (await h.http.get(`${API}/clients/me/professionals`).set(auth(client.token)).expect(200)).body.saved;
      expect(saved.map((p: { professional: { id: string } }) => p.professional.id)).toEqual([third.id, first.id]);
      expect(saved[1].jobsCount).toBe(1);
    });

    it('historial: lista de trabajos anteriores para el cliente y "historial con este cliente" para el profesional', async () => {
      const client = await user('María');
      const worker = await pro('Pro historial');
      await completedJob(client, worker);
      const second = await completedJob(client, worker);
      const third = await selectedJob({ client, pro: worker });

      const rel = (await h.http.get(`${API}/clients/me/professionals/${worker.id}`).set(auth(client.token)).expect(200)).body;
      expect(rel.jobsCount).toBe(2);
      expect(rel.jobs).toHaveLength(2);
      expect(rel.lastCompletedAt).not.toBeNull();

      const detail = (await h.http.get(`${API}/pro/jobs/${third.jobId}`).set(auth(worker.token)).expect(200)).body;
      expect(detail.clientHistory).toMatchObject({ completedJobs: 2 });
      const firstTime = (await h.http.get(`${API}/pro/jobs/${second.jobId}`).set(auth(worker.token)).expect(200)).body;
      expect(firstTime.clientHistory).toMatchObject({ completedJobs: 1 });
      // Un cliente nuevo no tiene historial.
      const fresh = await selectedJob({ pro: worker });
      expect((await h.http.get(`${API}/pro/jobs/${fresh.jobId}`).set(auth(worker.token)).expect(200)).body.clientHistory).toBeNull();
    });

    it('volver a contratar crea una solicitud TARGETED, no consume cupo Free y queda medido', async () => {
      const client = await user('Cliente recurrente');
      const worker = await pro('Pro free recurrente', { free: true });
      await completedJob(client, worker);
      const usage = async () =>
        (await h.http.get(`${API}/pro/me`).set(auth(worker.token)).expect(200)).body.quoteUsage;
      const before = await usage();

      const requestId = await createRequest(client.token, 'Otra cosa distinta');
      await invite(client.token, requestId, [worker.id], true).expect(200);
      const [inv] = await h.dataSource.query(
        `SELECT targeted, status FROM request_invitations WHERE request_id = $1`,
        [requestId],
      );
      expect(inv).toMatchObject({ targeted: true, status: 'PENDING' });
      await quote(worker.token, requestId).expect(201);
      const after = await usage();
      expect(after).toMatchObject({ used: before.used, remaining: before.remaining }); // TARGETED no consume oportunidad Free
      expect(after.used).toBe(0);

      const events = await h.dataSource.query(
        `SELECT type FROM pro_funnel_events WHERE professional_id = $1 AND type = 'REHIRE_SUBMITTED'`,
        [worker.id],
      );
      expect(events).toHaveLength(1);
      // Un pedido dirigido a alguien que nunca trabajó para el cliente no es una recontratación.
      const stranger = await pro('Pro nuevo');
      const other = await createRequest(client.token, 'Primera vez');
      await invite(client.token, other, [stranger.id], true).expect(200);
      expect(await h.dataSource.query(`SELECT 1 FROM pro_funnel_events WHERE professional_id = $1 AND type = 'REHIRE_SUBMITTED'`, [stranger.id])).toHaveLength(0);
    });
  });
});
