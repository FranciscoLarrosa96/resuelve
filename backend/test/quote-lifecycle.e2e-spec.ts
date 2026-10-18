import { randomUUID } from 'crypto';
import { describeE2E, Harness, startApp } from './app.harness';

const API = '/api/v1';
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const proposal = { description: 'Cambio de sifón y prueba de pérdidas', laborAmount: 20000 };

/** Cruza los módulos reales en una base descartable; los proveedores externos son falsos. */
describeE2E('Del presupuesto al trabajo reseñado (e2e)', () => {
  let h: Harness;
  let serviceId: string;
  let zoneId: string;

  async function user(label: string) {
    const email = `${label}-${randomUUID()}@test.dev`;
    const registered = await h.http.post(`${API}/auth/register`).send({
      firstName: label, lastName: 'Recorrido', email, password: 'una-clave-bien-larga', phone: '+54 249 555 2222',
    }).expect(202);
    const verified = await h.http.post(`${API}/auth/register/verify`).send({
      verificationSessionId: registered.body.verificationSessionId, code: h.mail.lastCodeFor(email),
    }).expect(200);
    return { token: verified.body.accessToken as string };
  }

  async function pro(label: string) {
    const account = await user(label);
    const profile = await h.http.post(`${API}/pro/profile`).set(auth(account.token)).send({
      headline: 'Plomería de prueba', serviceIds: [serviceId], zoneIds: [zoneId], yearsExperience: 3,
    }).expect(201);
    return { ...account, id: profile.body.id as string };
  }

  async function selected() {
    const client = await user('Cliente');
    const winner = await pro('Elegido');
    const other = await pro('Otro');
    const request = await h.http.post(`${API}/requests`).set(auth(client.token)).send({
      serviceId, zoneId, title: 'Arreglar la pileta', description: 'Gotea la pileta de la cocina desde ayer.',
      exactAddress: 'Dirección privada de prueba 123', urgency: 'FLEXIBLE',
    }).expect(201);
    const requestId = request.body.id as string;
    await h.http.post(`${API}/requests/${requestId}/invitations`).set(auth(client.token))
      .send({ professionalIds: [winner.id, other.id] }).expect(200);
    const q = await h.http.post(`${API}/pro/requests/${requestId}/quote`).set(auth(winner.token)).send(proposal).expect(201);
    const otherQuote = await h.http.post(`${API}/pro/requests/${requestId}/quote`).set(auth(other.token))
      .send({ ...proposal, laborAmount: 25000 }).expect(201);
    await h.http.patch(`${API}/pro/quotes/${q.body.id}`).set(auth(winner.token))
      .send({ ...proposal, laborAmount: 21000 }).expect(200);
    const notifications = await h.http.get(`${API}/me/notifications?audience=CLIENT`).set(auth(client.token)).expect(200);
    expect(notifications.body.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ requestId, route: `/mis-solicitudes/${requestId}`, type: 'CLIENT_QUOTE_UPDATED' }),
    ]));
    const quotes = await h.http.get(`${API}/requests/${requestId}/quotes`).set(auth(client.token)).expect(200);
    expect(quotes.body).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: q.body.id, totalAmount: '21000.00' }),
      expect.objectContaining({ id: otherQuote.body.id, totalAmount: '25000.00' }),
    ]));
    const accepted = await h.http.post(`${API}/quotes/${q.body.id}/accept`).set(auth(client.token)).expect(200);
    const jobs = await h.http.get(`${API}/pro/jobs`).set(auth(winner.token)).expect(200);
    const own = jobs.body.items.filter((j: { requestId: string }) => j.requestId === requestId);
    expect(own).toHaveLength(1);
    const jobId = own[0].id as string;
    expect(accepted.body).toMatchObject({ status: 'PROFESSIONAL_SELECTED', acceptedQuoteId: q.body.id });
    await h.http.get(`${API}/pro/jobs/${jobId}`).set(auth(other.token)).expect(404);
    const loserView = await h.http.get(`${API}/pro/requests/${requestId}`).set(auth(other.token)).expect(200);
    expect(loserView.body.contact).toBeNull();
    const winnerView = await h.http.get(`${API}/pro/jobs/${jobId}`).set(auth(winner.token)).expect(200);
    expect(winnerView.body.client.exactAddress).toBe('Dirección privada de prueba 123');
    return { client, winner, requestId, jobId };
  }

  const schedule = (token: string, id: string) => h.http.post(`${API}/pro/jobs/${id}/schedule`).set(auth(token))
    .send({ scheduledDate: '2099-06-10', scheduledTime: '10:00', durationMinutes: 60 });
  const moveToPast = (id: string) => h.dataSource.query(
    `UPDATE jobs SET scheduled_date = (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date - 1,
      scheduled_time = '10:00', duration_minutes = 60 WHERE id = $1`, [id],
  );

  beforeAll(async () => {
    h = await startApp();
    serviceId = (await h.http.get(`${API}/services`).expect(200)).body.find((s: { slug: string }) => s.slug === 'plomeria').id;
    zoneId = (await h.http.get(`${API}/zones?city=tandil`).expect(200)).body[0].id;
  }, 60_000);
  afterAll(async () => h?.app.close());

  it('edita, compara, elige, agenda, reprograma, cierra y reseña el mismo trabajo', async () => {
    const { client, winner, requestId, jobId } = await selected();
    await h.http.post(`${API}/requests/${requestId}/review`).set(auth(client.token)).send({ rating: 5 }).expect(409);
    await schedule(winner.token, jobId).expect(200);
    await schedule(winner.token, jobId).expect(200);
    const events = await h.dataSource.query(`SELECT count(*)::int AS count FROM job_events WHERE job_id=$1 AND type='SCHEDULED'`, [jobId]);
    expect(events[0].count).toBe(1);
    const notices = await h.http.get(`${API}/me/notifications?audience=CLIENT`).set(auth(client.token)).expect(200);
    expect(notices.body.items.filter((n: { requestId: string; type: string }) => n.requestId === requestId && n.type === 'CLIENT_JOB_SCHEDULED')).toHaveLength(1);
    await h.http.post(`${API}/requests/${requestId}/complete`).set(auth(client.token)).expect(409);
    const again = await h.http.post(`${API}/requests/${requestId}/reschedule`).set(auth(client.token)).expect(200);
    expect(again.body).toMatchObject({ status: 'PROFESSIONAL_SELECTED', job: { id: jobId, status: 'TO_COORDINATE' } });
    await schedule(winner.token, jobId).expect(200);
    await moveToPast(jobId);
    const done = await h.http.post(`${API}/requests/${requestId}/complete`).set(auth(client.token)).expect(200);
    expect(done.body).toMatchObject({ status: 'COMPLETED', completedBy: 'CLIENT', canReview: true });
    await h.http.post(`${API}/requests/${requestId}/review`).set(auth(client.token)).send({ rating: 5, comment: 'Resolvió el trabajo acordado.' }).expect(201);
    const duplicate = await h.http.post(`${API}/requests/${requestId}/review`).set(auth(client.token)).send({ rating: 5 }).expect(409);
    expect(duplicate.body.code).toBe('REVIEW_ALREADY_EXISTS');
    const closed = await h.http.get(`${API}/pro/jobs/${jobId}`).set(auth(winner.token)).expect(200);
    expect(closed.body).toMatchObject({ status: 'COMPLETED', clientReviewed: true, client: { phone: null, exactAddress: null } });
    const publicPro = await h.http.get(`${API}/professionals/${winner.id}`).expect(200);
    expect(publicPro.body).toMatchObject({ completedJobsCount: 1, reviewsCount: 1, averageRating: 5 });
  });

  it('cliente y profesional cierran a la vez sin duplicar transición, evento ni aviso de reseña', async () => {
    const { client, winner, requestId, jobId } = await selected();
    await schedule(winner.token, jobId).expect(200);
    await moveToPast(jobId);
    const [clientResult, proResult] = await Promise.all([
      h.http.post(`${API}/requests/${requestId}/complete`).set(auth(client.token)),
      h.http.post(`${API}/pro/jobs/${jobId}/complete`).set(auth(winner.token)),
    ]);
    expect(clientResult.status).toBe(200);
    expect(proResult.status).toBe(200);
    const events = await h.dataSource.query(`SELECT count(*)::int AS count FROM job_events WHERE job_id=$1 AND type='COMPLETED'`, [jobId]);
    expect(events[0].count).toBe(1);
    const request = await h.http.get(`${API}/requests/${requestId}`).set(auth(client.token)).expect(200);
    expect(request.body.status).toBe('COMPLETED');
    const notices = await h.dataSource.query(`SELECT count(*)::int AS count FROM notifications WHERE request_id=$1 AND type='CLIENT_REVIEW_AVAILABLE'`, [requestId]);
    expect(notices[0].count).toBe(1);
  });
});
