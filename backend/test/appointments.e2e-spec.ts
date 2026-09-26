import { randomUUID } from 'crypto';
import { businessDayStart, businessToday } from '../src/common/time';
import { VerificationReviewService } from '../src/verifications/verification-review.service';
import { describeE2E, Harness, startApp } from './app.harness';

const API = '/api/v1';
const PASSWORD = 'una-clave-bien-larga';
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

/**
 * Elegibilidad de invitaciones (P0) y coordinación del trabajo: propuesta de
 * cita, confirmación/rechazo, reprogramación, cancelación, agenda, conflictos
 * de horario y trabajo realizado (COMPLETED sin depender de una reseña).
 */
describeE2E('Elegibilidad, citas y agenda (e2e)', () => {
  let h: Harness;
  let review: VerificationReviewService;
  const svc: Record<string, string> = {};
  const zone: Record<string, string> = {};

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function register(label: string) {
    const email = `${label}-${randomUUID().slice(0, 8)}@test.dev`;
    const res = await h.http
      .post(`${API}/auth/register`)
      .send({ firstName: label, lastName: 'Agenda', email, password: PASSWORD, phone: '+54 249 555 2222' })
      .expect(201);
    return { email, token: res.body.accessToken as string };
  }

  async function pro(label: string, body: Record<string, unknown> = {}) {
    const user = await register(label);
    const res = await h.http
      .post(`${API}/pro/profile`)
      .set(auth(user.token))
      .send({
        headline: `${label} en Tandil`,
        yearsExperience: 3,
        serviceIds: [svc.plomeria],
        zoneIds: [zone['villa-italia']],
        ...body,
      });
    expect(res.status).toBe(201);
    return { ...user, proId: res.body.id as string };
  }

  async function createRequest(token: string, extra: Record<string, unknown> = {}) {
    const res = await h.http
      .post(`${API}/requests`)
      .set(auth(token))
      .send({
        serviceId: svc.plomeria,
        zoneId: zone['villa-italia'],
        title: 'Pérdida bajo mesada',
        description: 'Gotea la pileta de la cocina desde ayer.',
        exactAddress: 'Quintana 860',
        urgency: 'FLEXIBLE',
        ...extra,
      })
      .expect(201);
    return res.body.id as string;
  }

  const invite = (token: string, requestId: string, professionalIds: string[]) =>
    h.http.post(`${API}/requests/${requestId}/invitations`).set(auth(token)).send({ professionalIds });

  const quoteBody = { description: 'Cambio de sifón y flexibles', laborAmount: 20000 };

  /** Cliente + ganador + perdedor, con el presupuesto del ganador aceptado. */
  async function selectedJob(winner?: Awaited<ReturnType<typeof pro>>) {
    const client = await register('cliente');
    const win = winner ?? (await pro('ganador'));
    const lose = await pro('perdedor');
    const requestId = await createRequest(client.token);
    await invite(client.token, requestId, [win.proId, lose.proId]).expect(200);
    const q = await h.http
      .post(`${API}/pro/requests/${requestId}/quote`)
      .set(auth(win.token))
      .send(quoteBody)
      .expect(201);
    await h.http
      .post(`${API}/pro/requests/${requestId}/quote`)
      .set(auth(lose.token))
      .send(quoteBody)
      .expect(201);
    await h.http.post(`${API}/quotes/${q.body.id}/accept`).set(auth(client.token)).expect(200);
    return { client, winner: win, loser: lose, requestId };
  }

  const at = (msFromNow: number) => new Date(Date.now() + msFromNow).toISOString();

  const propose = (token: string, requestId: string, body: Record<string, unknown>) =>
    h.http
      .post(`${API}/pro/requests/${requestId}/appointments`)
      .set(auth(token))
      .send({ durationMinutes: 120, ...body });

  const clientView = async (token: string, requestId: string) =>
    (await h.http.get(`${API}/requests/${requestId}`).set(auth(token)).expect(200)).body;
  const proView = async (token: string, requestId: string) =>
    (await h.http.get(`${API}/pro/requests/${requestId}`).set(auth(token)).expect(200)).body;

  /** Corre una cita al pasado (el trabajo ya empezó) sin esperar días. */
  const moveToPast = (appointmentId: string) =>
    h.dataSource.query(
      `UPDATE appointments SET scheduled_start = now() - interval '2 hours', scheduled_end = now() - interval '1 hour' WHERE id = $1`,
      [appointmentId],
    );

  beforeAll(async () => {
    h = await startApp();
    review = h.app.get(VerificationReviewService);
    for (const s of (await h.http.get(`${API}/services`).expect(200)).body) svc[s.slug] = s.id;
    for (const z of (await h.http.get(`${API}/zones`).expect(200)).body) zone[z.slug] = z.id;
  }, 60_000);

  afterAll(async () => {
    await h?.app.close();
  });

  // ---- P0: elegibilidad al invitar ---------------------------------------------
  describe('elegibilidad de invitaciones (backend)', () => {
    let client: Awaited<ReturnType<typeof register>>;
    let requestId: string;

    beforeAll(async () => {
      client = await register('cli-elig');
      requestId = await createRequest(client.token);
    });

    it('solo Centro + solicitud en Villa Italia → rechazada', async () => {
      const centro = await pro('solo-centro', { zoneIds: [zone.centro] });
      const res = await invite(client.token, requestId, [centro.proId]);
      expect(res.status).toBe(422);
      expect(res.body).toMatchObject({
        code: 'PROFESSIONAL_NOT_ELIGIBLE',
        details: { reason: 'ZONE_NOT_COVERED' },
      });
      // La búsqueda aplica la misma regla.
      const search = await h.http
        .get(`${API}/professionals`)
        .query({ service: 'plomeria', zone: 'villa-italia', pageSize: 50 });
      expect(search.body.items.map((p: { id: string }) => p.id)).not.toContain(centro.proId);
    });

    it('"Todo Tandil" + solicitud en Villa Italia → permitida', async () => {
      const todo = await pro('todo-tandil', { zoneIds: [], coversEntireCity: true });
      await invite(client.token, requestId, [todo.proId]).expect(200);
    });

    it('perfil pausado → rechazada', async () => {
      const paused = await pro('pausado');
      await h.http.patch(`${API}/pro/status`).set(auth(paused.token)).send({ status: 'PAUSED' }).expect(200);
      const res = await invite(client.token, requestId, [paused.proId]);
      expect(res.status).toBe(422);
      expect(res.body.details.reason).toBe('PROFILE_PAUSED');
    });

    it('servicio no ofrecido → rechazada', async () => {
      const elec = await pro('electricista', { serviceIds: [svc.electricidad] });
      const res = await invite(client.token, requestId, [elec.proId]);
      expect(res.status).toBe(422);
      expect(res.body.details.reason).toBe('SERVICE_NOT_OFFERED');
    });

    it('Gas pendiente → rechazada; Gas aprobada → permitida', async () => {
      const gasRequest = await createRequest(client.token, {
        serviceId: svc.gas,
        title: 'Revisión de calefactor',
      });
      const gasista = await pro('gasista', { serviceIds: [svc.gas] });
      await h.http
        .post(`${API}/pro/verifications`)
        .set(auth(gasista.token))
        .send({ type: 'LICENSE', serviceId: svc.gas, reference: 'Mat. Gas 4321' })
        .expect(201);
      const pending = await invite(client.token, gasRequest, [gasista.proId]);
      expect(pending.status).toBe(422);
      // No revela el estado interno de la matrícula: es "no ofrece el servicio".
      expect(pending.body.details.reason).toBe('SERVICE_NOT_OFFERED');

      const id = (await review.listPending()).find((v) => v.professionalId === gasista.proId)!.id;
      await review.approve(id, 'revisor-test');
      await invite(client.token, gasRequest, [gasista.proId]).expect(200);
    });
  });

  describe('el presupuesto vuelve a validar la elegibilidad', () => {
    it('pausar el perfil o dejar el servicio impide cotizar una invitación vieja', async () => {
      const client = await register('cli-quote');
      const p = await pro('cotiza');
      const requestId = await createRequest(client.token);
      await invite(client.token, requestId, [p.proId]).expect(200);

      await h.http.patch(`${API}/pro/status`).set(auth(p.token)).send({ status: 'PAUSED' }).expect(200);
      const paused = await h.http
        .post(`${API}/pro/requests/${requestId}/quote`)
        .set(auth(p.token))
        .send(quoteBody);
      expect(paused.status).toBe(422);
      expect(paused.body.details.reason).toBe('PROFILE_PAUSED');

      await h.http.patch(`${API}/pro/status`).set(auth(p.token)).send({ status: 'ACTIVE' }).expect(200);
      await h.http
        .patch(`${API}/pro/profile`)
        .set(auth(p.token))
        .send({ serviceIds: [svc.electricidad] })
        .expect(200);
      const noService = await h.http
        .post(`${API}/pro/requests/${requestId}/quote`)
        .set(auth(p.token))
        .send(quoteBody);
      expect(noService.status).toBe(422);
      expect(noService.body.details.reason).toBe('SERVICE_NOT_OFFERED');
    });

    it('cambiar de barrios después de la invitación no la invalida', async () => {
      const client = await register('cli-cobertura');
      const p = await pro('muda-barrio');
      const requestId = await createRequest(client.token);
      await invite(client.token, requestId, [p.proId]).expect(200);
      await h.http
        .patch(`${API}/pro/profile`)
        .set(auth(p.token))
        .send({ zoneIds: [zone.centro] })
        .expect(200);
      await h.http
        .post(`${API}/pro/requests/${requestId}/quote`)
        .set(auth(p.token))
        .send(quoteBody)
        .expect(201);
    });
  });

  // ---- Citas ------------------------------------------------------------------
  describe('proponer, confirmar, rechazar y reprogramar', () => {
    let job: Awaited<ReturnType<typeof selectedJob>>;
    let firstId: string;
    let secondId: string;
    let confirmedId: string;

    beforeAll(async () => {
      job = await selectedJob();
    });

    it('solo el profesional elegido propone: el perdedor y los ajenos reciben 404', async () => {
      await propose(job.loser.token, job.requestId, { startsAt: at(2 * DAY) }).expect(404);
      const stranger = await pro('ajeno');
      await propose(stranger.token, job.requestId, { startsAt: at(2 * DAY) }).expect(404);
      // Sin perfil profesional ni siquiera entra a /pro/*.
      await propose(job.client.token, job.requestId, { startsAt: at(2 * DAY) }).expect(403);
    });

    it('valida horario futuro y duración de la lista', async () => {
      const past = await propose(job.winner.token, job.requestId, { startsAt: at(-HOUR) });
      expect(past.status).toBe(422);
      await propose(job.winner.token, job.requestId, { startsAt: at(2 * DAY), durationMinutes: 45 }).expect(
        400,
      );
      await propose(job.winner.token, job.requestId, { startsAt: 'mañana' }).expect(400);
    });

    it('propuesta: la solicitud sigue PROFESSIONAL_SELECTED y el perdedor no ve la cita', async () => {
      const res = await propose(job.winner.token, job.requestId, {
        startsAt: at(2 * DAY),
        note: '  Llevo el sifón.  ',
      }).expect(200);
      expect(res.body.status).toBe('PROFESSIONAL_SELECTED');
      expect(res.body.appointment).toMatchObject({
        status: 'PROPOSED',
        durationMinutes: 120,
        note: 'Llevo el sifón.',
      });
      firstId = res.body.appointment.id;

      const mine = await clientView(job.client.token, job.requestId);
      expect(mine.appointment).toMatchObject({ id: firstId, status: 'PROPOSED' });
      const loser = await proView(job.loser.token, job.requestId);
      expect(loser.appointment).toBeNull();
      expect(JSON.stringify(loser)).not.toContain(firstId);
    });

    it('una sola cita activa: otra propuesta sin reemplazar la actual → 409', async () => {
      const res = await propose(job.winner.token, job.requestId, { startsAt: at(3 * DAY) });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('APPOINTMENT_STATE_CHANGED');
    });

    it('cambiar la propuesta reemplaza la anterior y conserva el historial', async () => {
      const res = await propose(job.winner.token, job.requestId, {
        startsAt: at(3 * DAY),
        replacesAppointmentId: firstId,
      }).expect(200);
      secondId = res.body.appointment.id;
      expect(secondId).not.toBe(firstId);
      const rows = await h.dataSource.query(
        `SELECT id, status, cancelled_by FROM appointments WHERE request_id = $1`,
        [job.requestId],
      );
      expect(rows).toHaveLength(2);
      expect(rows.find((r: { id: string }) => r.id === firstId)).toMatchObject({
        status: 'CANCELLED',
        cancelled_by: 'PROFESSIONAL',
      });
    });

    it('otro cliente y el perdedor no pueden confirmar, rechazar ni cancelar (404)', async () => {
      const other = await register('otro');
      for (const action of ['confirm', 'decline', 'cancel'])
        await h.http.post(`${API}/appointments/${secondId}/${action}`).set(auth(other.token)).expect(404);
      await h.http.post(`${API}/appointments/${secondId}/cancel`).set(auth(job.loser.token)).expect(404);
    });

    it('"No puedo en ese horario": DECLINED, sin rechazar al profesional; repetirlo no cambia nada', async () => {
      const res = await h.http
        .post(`${API}/appointments/${secondId}/decline`)
        .set(auth(job.client.token))
        .expect(200);
      expect(res.body).toMatchObject({
        status: 'PROFESSIONAL_SELECTED',
        selectedProfessionalId: job.winner.proId,
      });
      expect(res.body.appointment).toMatchObject({ id: secondId, status: 'DECLINED' });
      await h.http.post(`${API}/appointments/${secondId}/decline`).set(auth(job.client.token)).expect(200);
      const confirm = await h.http
        .post(`${API}/appointments/${secondId}/confirm`)
        .set(auth(job.client.token));
      expect(confirm.status).toBe(409);
      expect(confirm.body.code).toBe('APPOINTMENT_STATE_CHANGED');
      const pv = await proView(job.winner.token, job.requestId);
      expect(pv.appointment.status).toBe('DECLINED');
    });

    it('confirmar: cita CONFIRMED y solicitud SCHEDULED; doble click no duplica', async () => {
      const res = await propose(job.winner.token, job.requestId, {
        startsAt: at(4 * DAY),
        durationMinutes: 90,
      }).expect(200);
      confirmedId = res.body.appointment.id;
      const [a, b] = await Promise.all(
        [1, 2].map(() =>
          h.http.post(`${API}/appointments/${confirmedId}/confirm`).set(auth(job.client.token)),
        ),
      );
      expect([a.status, b.status]).toEqual([200, 200]);
      expect(a.body).toMatchObject({
        status: 'SCHEDULED',
        appointment: { id: confirmedId, status: 'CONFIRMED' },
      });
      const [{ count }] = await h.dataSource.query(
        `SELECT count(*)::int AS count FROM appointments WHERE request_id = $1 AND status = 'CONFIRMED'`,
        [job.requestId],
      );
      expect(count).toBe(1);
      expect((await proView(job.winner.token, job.requestId)).status).toBe('SCHEDULED');
    });

    it('reprogramar: cancela la confirmada y crea una propuesta que el cliente vuelve a confirmar', async () => {
      const stale = await propose(job.winner.token, job.requestId, {
        startsAt: at(5 * DAY),
        replacesAppointmentId: secondId,
      });
      expect(stale.status).toBe(409); // la UI vieja no pisa una cita confirmada

      const res = await propose(job.winner.token, job.requestId, {
        startsAt: at(5 * DAY),
        replacesAppointmentId: confirmedId,
      }).expect(200);
      expect(res.body.status).toBe('PROFESSIONAL_SELECTED');
      expect(res.body.appointment.status).toBe('PROPOSED');
      const [old] = await h.dataSource.query(`SELECT status, cancelled_by FROM appointments WHERE id = $1`, [
        confirmedId,
      ]);
      expect(old).toEqual({ status: 'CANCELLED', cancelled_by: 'PROFESSIONAL' });

      confirmedId = res.body.appointment.id;
      await h.http.post(`${API}/appointments/${confirmedId}/confirm`).set(auth(job.client.token)).expect(200);
    });

    it('cancelar horario (cliente): vuelve a PROFESSIONAL_SELECTED con el mismo profesional, sin reabrir presupuestos', async () => {
      const res = await h.http
        .post(`${API}/appointments/${confirmedId}/cancel`)
        .set(auth(job.client.token))
        .expect(200);
      expect(res.body).toMatchObject({
        status: 'PROFESSIONAL_SELECTED',
        selectedProfessionalId: job.winner.proId,
        appointment: { id: confirmedId, status: 'CANCELLED', cancelledBy: 'CLIENT' },
      });
      const quotes = (
        await h.http.get(`${API}/requests/${job.requestId}/quotes`).set(auth(job.client.token)).expect(200)
      ).body;
      expect(quotes.map((q: { status: string }) => q.status).sort()).toEqual(['ACCEPTED', 'REJECTED']);
      await h.http.post(`${API}/appointments/${confirmedId}/cancel`).set(auth(job.client.token)).expect(200); // idempotente
      // El profesional puede proponer otra fecha.
      await propose(job.winner.token, job.requestId, { startsAt: at(6 * DAY) }).expect(200);
    });

    it('el profesional elegido puede retirar su propuesta', async () => {
      const current = (await proView(job.winner.token, job.requestId)).appointment;
      const res = await h.http
        .post(`${API}/appointments/${current.id}/cancel`)
        .set(auth(job.winner.token))
        .expect(200);
      expect(res.body.appointment).toMatchObject({ status: 'CANCELLED', cancelledBy: 'PROFESSIONAL' });
      expect(res.body.invitationStatus).toBe('SELECTED'); // vista del profesional
    });
  });

  describe('concurrencia', () => {
    it('dos propuestas simultáneas: solo una queda activa', async () => {
      const job = await selectedJob();
      const results = await Promise.all(
        [2, 3].map((d) => propose(job.winner.token, job.requestId, { startsAt: at(d * DAY) })),
      );
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      const [{ count }] = await h.dataSource.query(
        `SELECT count(*)::int AS count FROM appointments WHERE request_id = $1 AND status IN ('PROPOSED', 'CONFIRMED')`,
        [job.requestId],
      );
      expect(count).toBe(1);
    });

    it('dos pestañas: confirmar y rechazar a la vez → decide el estado real, la otra recibe 409', async () => {
      const job = await selectedJob();
      const id = (await propose(job.winner.token, job.requestId, { startsAt: at(2 * DAY) }).expect(200)).body
        .appointment.id;
      const results = await Promise.all(
        ['confirm', 'decline'].map((a) =>
          h.http.post(`${API}/appointments/${id}/${a}`).set(auth(job.client.token)),
        ),
      );
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(results.find((r) => r.status === 409)!.body.code).toBe('APPOINTMENT_STATE_CHANGED');
    });

    it('una propuesta vencida ya no se puede confirmar', async () => {
      const job = await selectedJob();
      const id = (await propose(job.winner.token, job.requestId, { startsAt: at(2 * DAY) }).expect(200)).body
        .appointment.id;
      await moveToPast(id);
      const res = await h.http.post(`${API}/appointments/${id}/confirm`).set(auth(job.client.token));
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('APPOINTMENT_EXPIRED');
    });
  });

  describe('conflictos de horario', () => {
    it('dos citas CONFIRMED del mismo profesional no se superponen; canceladas y de otros no bloquean', async () => {
      const busy = await pro('ocupado');
      const job1 = await selectedJob(busy);
      const t = Date.now() + 3 * DAY;
      const a1 = (
        await propose(busy.token, job1.requestId, { startsAt: new Date(t).toISOString() }).expect(200)
      ).body.appointment.id;
      await h.http.post(`${API}/appointments/${a1}/confirm`).set(auth(job1.client.token)).expect(200);

      // Proponer encima de un trabajo confirmado: 409 sin datos del otro cliente.
      const job2 = await selectedJob(busy);
      const clash = await propose(busy.token, job2.requestId, { startsAt: new Date(t + HOUR).toISOString() });
      expect(clash.status).toBe(409);
      expect(clash.body.code).toBe('APPOINTMENT_OVERLAP');
      expect(JSON.stringify(clash.body)).not.toMatch(/Quintana|cliente-|@test\.dev/);

      // Justo a continuación no se superpone (el fin es excluido).
      await propose(busy.token, job2.requestId, { startsAt: new Date(t + 2 * HOUR).toISOString() }).expect(
        200,
      );

      // Otro profesional en el mismo horario: sin conflicto.
      const job3 = await selectedJob();
      await propose(job3.winner.token, job3.requestId, { startsAt: new Date(t).toISOString() }).expect(200);

      // Cancelada no bloquea.
      await h.http.post(`${API}/appointments/${a1}/cancel`).set(auth(job1.client.token)).expect(200);
      const job4 = await selectedJob(busy);
      await propose(busy.token, job4.requestId, { startsAt: new Date(t).toISOString() }).expect(200);
    });

    it('propuestas superpuestas se permiten, pero solo se puede confirmar una', async () => {
      const busy = await pro('doble');
      const [j1, j2] = [await selectedJob(busy), await selectedJob(busy)];
      const start = at(4 * DAY);
      const p1 = (await propose(busy.token, j1.requestId, { startsAt: start }).expect(200)).body.appointment
        .id;
      const p2 = (await propose(busy.token, j2.requestId, { startsAt: start }).expect(200)).body.appointment
        .id;
      await h.http.post(`${API}/appointments/${p1}/confirm`).set(auth(j1.client.token)).expect(200);
      const second = await h.http.post(`${API}/appointments/${p2}/confirm`).set(auth(j2.client.token));
      expect(second.status).toBe(409);
      expect(second.body.code).toBe('APPOINTMENT_OVERLAP');
    });
  });

  // ---- Trabajo realizado --------------------------------------------------------
  describe('trabajo realizado (COMPLETED)', () => {
    let job: Awaited<ReturnType<typeof selectedJob>>;
    let appointmentId: string;

    beforeAll(async () => {
      job = await selectedJob();
    });

    it('sin cita confirmada no se puede completar', async () => {
      const res = await h.http
        .post(`${API}/pro/requests/${job.requestId}/complete`)
        .set(auth(job.winner.token));
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('INVALID_REQUEST_STATE');
    });

    it('antes del día del trabajo tampoco', async () => {
      appointmentId = (await propose(job.winner.token, job.requestId, { startsAt: at(2 * DAY) }).expect(200))
        .body.appointment.id;
      await h.http
        .post(`${API}/appointments/${appointmentId}/confirm`)
        .set(auth(job.client.token))
        .expect(200);
      const res = await h.http
        .post(`${API}/pro/requests/${job.requestId}/complete`)
        .set(auth(job.winner.token));
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('APPOINTMENT_NOT_STARTED');
    });

    it('el cliente y el perdedor no pueden marcarlo como realizado', async () => {
      await h.http
        .post(`${API}/pro/requests/${job.requestId}/complete`)
        .set(auth(job.client.token))
        .expect(403);
      await h.http
        .post(`${API}/pro/requests/${job.requestId}/complete`)
        .set(auth(job.loser.token))
        .expect(404);
    });

    it('el elegido lo marca: cita y solicitud COMPLETED; doble click no cambia nada', async () => {
      await moveToPast(appointmentId);
      const [a, b] = await Promise.all(
        [1, 2].map(() =>
          h.http.post(`${API}/pro/requests/${job.requestId}/complete`).set(auth(job.winner.token)),
        ),
      );
      expect([a.status, b.status]).toEqual([200, 200]);
      expect(a.body).toMatchObject({
        status: 'COMPLETED',
        appointment: { id: appointmentId, status: 'COMPLETED' },
      });
      expect(a.body.completedAt).toBeTruthy();
      expect(a.body.contact).toBeNull(); // terminado: deja de compartirse

      const mine = await clientView(job.client.token, job.requestId);
      expect(mine).toMatchObject({ status: 'COMPLETED', appointment: { status: 'COMPLETED' } });
      const pub = (await h.http.get(`${API}/professionals/${job.winner.proId}`).expect(200)).body;
      expect(pub.completedJobsCount).toBe(1);
    });

    it('después ya no se reprograma, cancela ni cancela la solicitud', async () => {
      const res = await propose(job.winner.token, job.requestId, {
        startsAt: at(2 * DAY),
        replacesAppointmentId: appointmentId,
      });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('INVALID_REQUEST_STATE');
      await h.http
        .post(`${API}/appointments/${appointmentId}/cancel`)
        .set(auth(job.client.token))
        .expect(409);
      await h.http.post(`${API}/requests/${job.requestId}/cancel`).set(auth(job.client.token)).expect(409);
    });

    it('la reseña es opcional y posterior: no cambia el estado', async () => {
      await h.http
        .post(`${API}/requests/${job.requestId}/review`)
        .set(auth(job.client.token))
        .send({ rating: 5 })
        .expect(201);
      expect((await clientView(job.client.token, job.requestId)).status).toBe('COMPLETED');
    });
  });

  it('cancelar la solicitud cancela la cita activa en la misma operación', async () => {
    const job = await selectedJob();
    const id = (await propose(job.winner.token, job.requestId, { startsAt: at(2 * DAY) }).expect(200)).body
      .appointment.id;
    await h.http.post(`${API}/appointments/${id}/confirm`).set(auth(job.client.token)).expect(200);
    const res = await h.http
      .post(`${API}/requests/${job.requestId}/cancel`)
      .set(auth(job.client.token))
      .expect(200);
    expect(res.body).toMatchObject({
      status: 'CANCELLED',
      appointment: { id, status: 'CANCELLED', cancelledBy: 'CLIENT' },
    });
  });

  // ---- Agenda -----------------------------------------------------------------
  describe('agenda del profesional', () => {
    it('rango con horario de Argentina, solo propias, sin ruido ni datos de contacto', async () => {
      const agendaPro = await pro('agenda');
      const day = businessToday(new Date(Date.now() + 3 * DAY));
      const next = businessToday(new Date(Date.now() + 4 * DAY));
      const dayAfter = businessToday(new Date(Date.now() + 5 * DAY));

      // 22:30 en Tandil = 01:30 UTC del día siguiente: tiene que quedar en `day`.
      const late = await selectedJob(agendaPro);
      const lateId = (
        await propose(agendaPro.token, late.requestId, {
          startsAt: `${day}T22:30:00-03:00`,
          durationMinutes: 60,
        }).expect(200)
      ).body.appointment.id;
      await h.http.post(`${API}/appointments/${lateId}/confirm`).set(auth(late.client.token)).expect(200);

      // Una propuesta (se muestra, secundaria) y una rechazada (no se muestra).
      const pending = await selectedJob(agendaPro);
      const pendingId = (
        await propose(agendaPro.token, pending.requestId, { startsAt: `${day}T10:00:00-03:00` }).expect(200)
      ).body.appointment.id;
      const declined = await selectedJob(agendaPro);
      const declinedId = (
        await propose(agendaPro.token, declined.requestId, { startsAt: `${day}T15:00:00-03:00` }).expect(200)
      ).body.appointment.id;
      await h.http
        .post(`${API}/appointments/${declinedId}/decline`)
        .set(auth(declined.client.token))
        .expect(200);

      const query = (from: string, to: string) =>
        h.http
          .get(`${API}/pro/appointments`)
          .set(auth(agendaPro.token))
          .query({ from: businessDayStart(from).toISOString(), to: businessDayStart(to).toISOString() });

      const res = await query(day, next).expect(200);
      expect(res.body.map((a: { id: string }) => a.id)).toEqual([pendingId, lateId]);
      expect(res.body[1]).toMatchObject({
        status: 'CONFIRMED',
        durationMinutes: 60,
        service: { name: 'Plomería' },
        zone: { name: 'Villa Italia' },
        client: { firstName: 'cliente', lastInitial: 'A' },
      });
      expect(new Date(res.body[1].startsAt).toISOString()).toBe(`${next}T01:30:00.000Z`);
      const json = JSON.stringify(res.body);
      expect(json).not.toContain('Quintana 860');
      expect(json).not.toContain('555 2222');
      expect(json).not.toContain('@test.dev');

      expect((await query(next, dayAfter).expect(200)).body).toEqual([]);

      // Otro profesional no ve estas citas.
      const other = await pro('otra-agenda');
      const theirs = await h.http
        .get(`${API}/pro/appointments`)
        .set(auth(other.token))
        .query({ from: businessDayStart(day).toISOString(), to: businessDayStart(next).toISOString() })
        .expect(200);
      expect(theirs.body).toEqual([]);
    });

    it('rango inválido o demasiado largo → 422', async () => {
      const p = await pro('rango');
      const from = new Date();
      await h.http
        .get(`${API}/pro/appointments`)
        .set(auth(p.token))
        .query({ from: from.toISOString(), to: new Date(from.getTime() - DAY).toISOString() })
        .expect(422);
      await h.http
        .get(`${API}/pro/appointments`)
        .set(auth(p.token))
        .query({ from: from.toISOString(), to: new Date(from.getTime() + 90 * DAY).toISOString() })
        .expect(422);
    });

    it('los trabajos realizados siguen visibles en su día', async () => {
      const job = await selectedJob();
      const id = (await propose(job.winner.token, job.requestId, { startsAt: at(2 * DAY) }).expect(200)).body
        .appointment.id;
      await h.http.post(`${API}/appointments/${id}/confirm`).set(auth(job.client.token)).expect(200);
      await moveToPast(id);
      await h.http
        .post(`${API}/pro/requests/${job.requestId}/complete`)
        .set(auth(job.winner.token))
        .expect(200);
      const res = await h.http
        .get(`${API}/pro/appointments`)
        .set(auth(job.winner.token))
        .query({
          from: new Date(Date.now() - DAY).toISOString(),
          to: new Date(Date.now() + DAY).toISOString(),
        })
        .expect(200);
      expect(res.body).toEqual([expect.objectContaining({ id, status: 'COMPLETED' })]);
    });
  });
});
