import { randomUUID } from 'crypto';
import { describeE2E, Harness, startApp } from './app.harness';

const API = '/api/v1';
const PASSWORD = 'una-clave-bien-larga';
const DAY = 24 * 3600 * 1000;

/**
 * Reseñas y reputación reales: quién puede reseñar, una por trabajo, rating
 * y cantidad recalculados, privacidad del DTO público, paginación y minRating.
 */
describeE2E('Reseñas y reputación (e2e)', () => {
  let h: Harness;
  const svc: Record<string, string> = {};
  const zone: Record<string, string> = {};

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  /** El apellido de los CLIENTES es privado: el test verifica que no aparezca en lo público. */
  async function register(label: string, lastName = 'Privadez') {
    const email = `${label}-${randomUUID().slice(0, 8)}@test.dev`;
    const res = await h.http
      .post(`${API}/auth/register`)
      .send({ firstName: label, lastName, email, password: PASSWORD, phone: '+54 249 555 3333' })
      .expect(201);
    return { email, token: res.body.accessToken as string };
  }

  async function pro(label: string) {
    const user = await register(label, 'Resena');
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

  type Pro = Awaited<ReturnType<typeof pro>>;
  const quoteBody = { description: 'Cambio de sifón y flexibles', laborAmount: 20000 };

  /** Cliente + ganador + perdedor con el presupuesto del ganador aceptado (PROFESSIONAL_SELECTED). */
  async function selectedJob(winner: Pro, clientLabel = 'cliente') {
    const client = await register(clientLabel);
    const lose = await pro('perdedor');
    const req = await h.http
      .post(`${API}/requests`)
      .set(auth(client.token))
      .send({
        serviceId: svc.plomeria,
        zoneId: zone['villa-italia'],
        title: 'Pérdida bajo mesada',
        description: 'Gotea la pileta de la cocina desde ayer.',
        exactAddress: 'Quintana 860',
        urgency: 'FLEXIBLE',
      })
      .expect(201);
    const requestId = req.body.id as string;
    await h.http
      .post(`${API}/requests/${requestId}/invitations`)
      .set(auth(client.token))
      .send({ professionalIds: [winner.proId, lose.proId] })
      .expect(200);
    const q = await h.http
      .post(`${API}/pro/requests/${requestId}/quote`)
      .set(auth(winner.token))
      .send(quoteBody)
      .expect(201);
    await h.http
      .post(`${API}/pro/requests/${requestId}/quote`)
      .set(auth(lose.token))
      .send(quoteBody)
      .expect(201);
    await h.http.post(`${API}/quotes/${q.body.id}/accept`).set(auth(client.token)).expect(200);
    return { client, winner, loser: lose, requestId };
  }

  /** Mismo flujo real hasta COMPLETED: propone, confirma, (el trabajo ya pasó) y lo marca realizado. */
  async function completedJob(winner: Pro, clientLabel?: string) {
    const job = await selectedJob(winner, clientLabel);
    const appt = await h.http
      .post(`${API}/pro/requests/${job.requestId}/appointments`)
      .set(auth(winner.token))
      .send({ startsAt: new Date(Date.now() + 2 * DAY).toISOString(), durationMinutes: 60 })
      .expect(200);
    const id = appt.body.appointment.id as string;
    await h.http.post(`${API}/appointments/${id}/confirm`).set(auth(job.client.token)).expect(200);
    // El trabajo ya ocurrió (no esperamos días): la cita se corre al pasado.
    await h.dataSource.query(
      `UPDATE appointments SET scheduled_start = now() - interval '2 hours', scheduled_end = now() - interval '1 hour' WHERE id = $1`,
      [id],
    );
    await h.http.post(`${API}/pro/requests/${job.requestId}/complete`).set(auth(winner.token)).expect(200);
    return job;
  }

  const postReview = (token: string, requestId: string, body: Record<string, unknown>) =>
    h.http.post(`${API}/requests/${requestId}/review`).set(auth(token)).send(body);
  const publicPro = async (id: string) => (await h.http.get(`${API}/professionals/${id}`).expect(200)).body;
  const clientView = async (token: string, requestId: string) =>
    (await h.http.get(`${API}/requests/${requestId}`).set(auth(token)).expect(200)).body;

  beforeAll(async () => {
    h = await startApp();
    for (const s of (await h.http.get(`${API}/services`).expect(200)).body) svc[s.slug] = s.id;
    for (const z of (await h.http.get(`${API}/zones`).expect(200)).body) zone[z.slug] = z.id;
  }, 60_000);

  afterAll(async () => {
    await h?.app.close();
  });

  describe('quién puede reseñar', () => {
    let winner: Pro;
    let job: Awaited<ReturnType<typeof completedJob>>;

    beforeAll(async () => {
      winner = await pro('francisco');
      job = await completedJob(winner, 'maria');
    });

    it('antes de COMPLETED no se puede (ni el CTA aparece)', async () => {
      const other = await selectedJob(winner);
      const view = await clientView(other.client.token, other.requestId);
      expect(view).toMatchObject({ status: 'PROFESSIONAL_SELECTED', canReview: false, review: null });
      const res = await postReview(other.client.token, other.requestId, { rating: 5 });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('REVIEW_NOT_ALLOWED');
    });

    it('COMPLETED sin reseña: canReview true', async () => {
      expect(await clientView(job.client.token, job.requestId)).toMatchObject({
        status: 'COMPLETED',
        canReview: true,
        review: null,
      });
    });

    it('otro usuario, el ganador o el perdedor no pueden reseñar ese trabajo (404)', async () => {
      const stranger = await register('extrano');
      for (const token of [stranger.token, job.winner.token, job.loser.token]) {
        expect((await postReview(token, job.requestId, { rating: 5 })).status).toBe(404);
      }
    });

    it('el body no elige a quién reseñar: professionalId extra → 400', async () => {
      const res = await postReview(job.client.token, job.requestId, {
        rating: 1,
        professionalId: job.loser.proId,
      });
      expect(res.status).toBe(400);
    });

    it('ratings inválidos y comentarios inválidos → 400', async () => {
      for (const body of [
        { rating: 0 },
        { rating: 6 },
        { rating: 4.5 },
        { rating: '5' },
        {},
        { rating: 5, comment: 'x'.repeat(1001) },
        { rating: 5, comment: 'Genial <script>alert(1)</script>' },
        { rating: 5, comment: '<b>Excelente</b>' },
      ]) {
        const res = await postReview(job.client.token, job.requestId, body);
        expect({ body, status: res.status }).toEqual({ body, status: 400 });
      }
    });

    it('doble submit simultáneo: una sola reseña, al profesional elegido', async () => {
      const results = await Promise.all(
        [1, 2].map(() =>
          postReview(job.client.token, job.requestId, {
            rating: 5,
            comment: '  Llegó puntual y resolvió <3  ',
          }),
        ),
      );
      const statuses = results.map((r) => r.status).sort();
      expect(statuses).toEqual([201, 409]);
      const created = results.find((r) => r.status === 201)!.body;
      expect(created).toEqual({
        id: expect.any(String),
        rating: 5,
        comment: 'Llegó puntual y resolvió <3',
        createdAt: expect.any(String),
      });
      expect(results.find((r) => r.status === 409)!.body.code).toBe('REVIEW_ALREADY_EXISTS');

      const again = await postReview(job.client.token, job.requestId, { rating: 1 });
      expect(again.status).toBe(409);
      expect(again.body.code).toBe('REVIEW_ALREADY_EXISTS');

      const [{ count }] = await h.dataSource.query(
        `SELECT COUNT(*)::int AS count FROM reviews WHERE request_id = $1 AND professional_id = $2`,
        [job.requestId, winner.proId],
      );
      expect(count).toBe(1);
    });

    it('la reseña no cambia el estado y el cliente la ve como suya', async () => {
      expect(await clientView(job.client.token, job.requestId)).toMatchObject({
        status: 'COMPLETED',
        canReview: false,
        review: { rating: 5, comment: 'Llegó puntual y resolvió <3' },
      });
      const list = await h.http.get(`${API}/requests/mine`).set(auth(job.client.token)).expect(200);
      expect(list.body.items[0]).toMatchObject({
        id: job.requestId,
        canReview: false,
        review: { rating: 5 },
      });
    });

    it('el perdedor no recibe reputación', async () => {
      expect(await publicPro(job.loser.proId)).toMatchObject({ averageRating: null, reviewsCount: 0 });
    });

    it('self review: si el cliente es el mismo profesional, no se puede', async () => {
      const self = await pro('mismo');
      const selfJob = await completedJob(self);
      // Caso borde: la solicitud termina a nombre del propio profesional.
      await h.dataSource.query(
        `UPDATE service_requests SET client_id = (SELECT user_id FROM professional_profiles WHERE id = $1) WHERE id = $2`,
        [self.proId, selfJob.requestId],
      );
      expect(await clientView(self.token, selfJob.requestId)).toMatchObject({ canReview: false });
      const res = await postReview(self.token, selfJob.requestId, { rating: 5 });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('REVIEW_NOT_ALLOWED');
      expect(await publicPro(self.proId)).toMatchObject({ averageRating: null, reviewsCount: 0 });
    });
  });

  describe('rating agregado, perfil público y búsqueda', () => {
    let winner: Pro;

    beforeAll(async () => {
      winner = await pro('rating');
    });

    it('0 reseñas: averageRating null, reviewsCount 0 y no cumple minRating', async () => {
      expect(await publicPro(winner.proId)).toMatchObject({
        averageRating: null,
        reviewsCount: 0,
        reviews: [],
      });
      const search = await h.http
        .get(`${API}/professionals`)
        .query({ service: svc.plomeria, minRating: 0, pageSize: 50 })
        .expect(200);
      expect(search.body.items.map((p: { id: string }) => p.id)).not.toContain(winner.proId);
    });

    it('5 + 3 → 4,0 con 2 reseñas; el comentario es opcional', async () => {
      const a = await completedJob(winner, 'ana');
      await postReview(a.client.token, a.requestId, {
        rating: 5,
        comment: 'Llegó puntual y dejó todo funcionando.',
      }).expect(201);
      const b = await completedJob(winner, 'beto');
      await postReview(b.client.token, b.requestId, { rating: 3, comment: '   ' }).expect(201);

      const p = await publicPro(winner.proId);
      expect(p).toMatchObject({ averageRating: 4, reviewsCount: 2 });
      expect(p.ratingDistribution).toEqual(
        expect.arrayContaining([
          { stars: 5, count: 1 },
          { stars: 3, count: 1 },
        ]),
      );
      // Más recientes primero; sin comentario → null.
      expect(p.reviews.map((r: { rating: number; comment: string | null }) => [r.rating, r.comment])).toEqual(
        [
          [3, null],
          [5, 'Llegó puntual y dejó todo funcionando.'],
        ],
      );
    });

    it('DTO público: solo nombre de pila, sin ids ni datos del trabajo', async () => {
      const [r] = (await publicPro(winner.proId)).reviews;
      expect(Object.keys(r).sort()).toEqual(['comment', 'createdAt', 'id', 'rating', 'reviewerDisplayName']);
      expect(r.reviewerDisplayName).toBe('beto');
      const raw = JSON.stringify(await publicPro(winner.proId));
      for (const leak of ['Privadez', 'P.', 'Quintana', '555 3333', '20000', '@test.dev'])
        expect(raw).not.toContain(leak);
    });

    it('paginado: GET /professionals/:id/reviews', async () => {
      const page1 = await h.http
        .get(`${API}/professionals/${winner.proId}/reviews`)
        .query({ page: 1, pageSize: 1 })
        .expect(200);
      expect(page1.body).toMatchObject({ page: 1, pageSize: 1, total: 2 });
      expect(page1.body.items).toHaveLength(1);
      const page2 = await h.http
        .get(`${API}/professionals/${winner.proId}/reviews`)
        .query({ page: 2, pageSize: 1 })
        .expect(200);
      expect(page2.body.items[0].rating).toBe(5);
      expect(page2.body.items[0].id).not.toBe(page1.body.items[0].id);
      await h.http.get(`${API}/professionals/${randomUUID()}/reviews`).expect(404);
    });

    it('rating real en búsqueda, minRating y comparador de presupuestos', async () => {
      const find = async (minRating: number) =>
        (
          await h.http
            .get(`${API}/professionals`)
            .query({ service: svc.plomeria, minRating, pageSize: 50 })
            .expect(200)
        ).body.items.find((p: { id: string }) => p.id === winner.proId);
      expect(await find(4)).toMatchObject({ averageRating: 4, reviewsCount: 2 });
      expect(await find(4.5)).toBeUndefined();

      const job = await selectedJob(winner);
      const quotes = await h.http
        .get(`${API}/requests/${job.requestId}/quotes`)
        .set(auth(job.client.token))
        .expect(200);
      const mine = quotes.body.find(
        (q: { professional: { id: string } }) => q.professional.id === winner.proId,
      );
      expect(mine.professional).toMatchObject({ averageRating: 4, reviewsCount: 2 });
    });
  });
});
