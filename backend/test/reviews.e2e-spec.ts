import { randomUUID } from 'crypto';
import { ReviewModerationService } from '../src/reviews/review-moderation.service';
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
      .expect(202);
    const verify = await h.http
      .post(`${API}/auth/register/verify`)
      .send({ verificationSessionId: res.body.verificationSessionId, code: h.mail.lastCodeFor(email) })
      .expect(200);
    return { email, token: verify.body.accessToken as string };
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
    await h.http.post(`${API}/requests/${job.requestId}/complete`).set(auth(winner.token)).expect(200);
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
      expect(Object.keys(r).sort()).toEqual([
        'comment',
        'createdAt',
        'id',
        'invited',
        'rating',
        'reviewerDisplayName',
      ]);
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
  describe('reseñas por invitación (QR o enlace del profesional)', () => {
    let owner: Pro;
    const postInvited = (token: string | null, proId: string, body: Record<string, unknown>) => {
      const req = h.http.post(`${API}/professionals/${proId}/invited-review`);
      return (token ? req.set(auth(token)) : req).send(body);
    };
    const statusOf = (token: string, proId: string) =>
      h.http.get(`${API}/professionals/${proId}/invited-review`).set(auth(token));

    beforeAll(async () => {
      owner = await pro('invitador');
    });

    it('sin cuenta no se puede (401)', async () => {
      expect((await postInvited(null, owner.proId, { rating: 5 })).status).toBe(401);
    });

    it('un vecino con cuenta puede reseñar sin haber contratado: queda aparte y no mueve el rating', async () => {
      const vecino = await register('vecino', 'Apellidoprivado');
      expect((await statusOf(vecino.token, owner.proId)).body).toMatchObject({
        canReview: true,
        blocker: null,
        review: null,
      });
      const res = await postInvited(vecino.token, owner.proId, {
        rating: 4,
        comment: 'Vino rápido y dejó todo limpio.',
      });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ rating: 4, comment: 'Vino rápido y dejó todo limpio.' });

      const pub = await publicPro(owner.proId);
      // Rating, cantidad y distribución son SOLO de trabajos por Resuelve.
      expect(pub).toMatchObject({ averageRating: null, reviewsCount: 0, reviews: [] });
      expect(pub.ratingDistribution.every((d: { count: number }) => d.count === 0)).toBe(true);
      expect(pub).toMatchObject({ invitedReviewsCount: 1, invitedAverageRating: 4 });
      expect(pub.invitedReviews).toHaveLength(1);
      expect(pub.invitedReviews[0]).toMatchObject({
        rating: 4,
        invited: true,
        reviewerDisplayName: 'vecino',
      });
      expect(JSON.stringify(pub)).not.toContain('Apellidoprivado');

      // Búsqueda: no cumple ningún rating mínimo por una reseña por invitación.
      const search = await h.http.get(`${API}/professionals?minRating=1`).expect(200);
      expect(search.body.items.map((p: { id: string }) => p.id)).not.toContain(owner.proId);
    });

    it('una sola por persona y profesional; el estado lo informa', async () => {
      const u = await register('unica');
      await postInvited(u.token, owner.proId, { rating: 5 }).expect(201);
      const again = await postInvited(u.token, owner.proId, { rating: 1 });
      expect(again.status).toBe(409);
      expect(again.body.code).toBe('REVIEW_ALREADY_EXISTS');
      expect((await statusOf(u.token, owner.proId)).body).toMatchObject({
        canReview: false,
        blocker: 'ALREADY_REVIEWED',
        review: { rating: 5 },
      });
    });

    it('el profesional no puede reseñarse a sí mismo', async () => {
      const res = await postInvited(owner.token, owner.proId, { rating: 5 });
      expect(res.status).toBe(409);
      expect(res.body.details).toMatchObject({ blocker: 'OWN_PROFILE' });
    });

    it('valida puntaje y texto como la reseña verificada', async () => {
      const u = await register('validador');
      for (const body of [
        {},
        { rating: 0 },
        { rating: 6 },
        { rating: 5, comment: '<b>hola</b>' },
        { rating: 5, comment: 'x'.repeat(1001) },
        { rating: 5, professionalId: owner.proId },
      ]) {
        const res = await postInvited(u.token, owner.proId, body);
        expect({ body, status: res.status }).toEqual({ body, status: 400 });
      }
    });

    it('un profesional inexistente es 404', async () => {
      const u = await register('perdido');
      expect((await postInvited(u.token, randomUUID(), { rating: 5 })).status).toBe(404);
    });

    it('si contrató por Resuelve y su trabajo no tiene reseña, va por el trabajo; ya reseñado, no duplica', async () => {
      const target = await pro('contratado');
      const job = await completedJob(target, 'cliente-real');
      const status = (await statusOf(job.client.token, target.proId)).body;
      expect(status).toMatchObject({ canReview: false, blocker: 'USE_JOB_REVIEW', requestId: job.requestId });
      expect((await postInvited(job.client.token, target.proId, { rating: 5 })).status).toBe(409);

      await postReview(job.client.token, job.requestId, { rating: 5 }).expect(201);
      expect((await statusOf(job.client.token, target.proId)).body.blocker).toBe('ALREADY_REVIEWED');
      // Esa reseña sí es verificada y cuenta.
      expect(await publicPro(target.proId)).toMatchObject({ reviewsCount: 1, invitedReviewsCount: 0 });
    });

    it('el listado separa los dos tipos (kind) y rechaza un kind inválido', async () => {
      const invited = await h.http
        .get(`${API}/professionals/${owner.proId}/reviews?kind=invited`)
        .expect(200);
      expect(invited.body.total).toBe(2);
      expect(invited.body.items.every((r: { invited: boolean }) => r.invited)).toBe(true);
      const verified = await h.http.get(`${API}/professionals/${owner.proId}/reviews`).expect(200);
      expect(verified.body).toMatchObject({ total: 0, items: [] });
      await h.http.get(`${API}/professionals/${owner.proId}/reviews?kind=otro`).expect(400);
    });

    it('el profesional recibe el aviso de la reseña', async () => {
      const rows = await h.dataSource.query(
        `SELECT n.type FROM notifications n JOIN professional_profiles p ON p.user_id = n.user_id
          WHERE p.id = $1 AND n.type = 'PRO_REVIEW_RECEIVED'`,
        [owner.proId],
      );
      expect(rows.length).toBe(2);
    });

    describe('sin cuenta (nombre + correo)', () => {
      const postGuest = (proId: string, body: Record<string, unknown>) =>
        h.http.post(`${API}/professionals/${proId}/guest-review`).send(body);

      it('deja reseñar con nombre y correo, sin registrarse; publica solo el nombre de pila', async () => {
        const target = await pro('invitadoguest');
        const res = await postGuest(target.proId, {
          rating: 5,
          comment: 'Excelente atención.',
          name: '  Laura Gómez ',
          email: 'Laura@Correo.com',
        });
        expect(res.status).toBe(201);
        const pub = await publicPro(target.proId);
        expect(pub).toMatchObject({ reviewsCount: 0, averageRating: null, invitedReviewsCount: 1 });
        expect(pub.invitedReviews[0]).toMatchObject({
          rating: 5,
          invited: true,
          reviewerDisplayName: 'Laura',
        });
        // El correo y el apellido nunca salen en lo público.
        const raw =
          JSON.stringify(pub) +
          JSON.stringify(
            (await h.http.get(`${API}/professionals/${target.proId}/reviews?kind=invited`)).body,
          );
        expect(raw).not.toMatch(/correo\.com|Gómez/i);
        const [row] = await h.dataSource.query(
          `SELECT client_id, reviewer_email FROM reviews WHERE professional_id = $1`,
          [target.proId],
        );
        expect(row).toEqual({ client_id: null, reviewer_email: 'laura@correo.com' });
      });

      it('el mismo correo no puede reseñar dos veces (aunque cambie mayúsculas o nombre)', async () => {
        const target = await pro('unaguest');
        await postGuest(target.proId, { rating: 4, name: 'Ana', email: 'ana@correo.com' }).expect(201);
        const again = await postGuest(target.proId, { rating: 1, name: 'Otra', email: 'ANA@correo.com' });
        expect(again.status).toBe(409);
        expect(again.body.code).toBe('REVIEW_ALREADY_EXISTS');
        // Otro profesional sí se puede reseñar con el mismo correo.
        await postGuest(owner.proId, { rating: 4, name: 'Ana', email: 'ana@correo.com' }).expect(201);
      });

      it('valida correo, nombre y puntaje', async () => {
        const target = await pro('validaguest');
        for (const body of [
          { rating: 5, name: 'Ana' },
          { rating: 5, name: 'Ana', email: 'no-es-un-correo' },
          { rating: 5, email: 'a@b.com' },
          { rating: 5, name: '<b>Ana</b>', email: 'a@b.com' },
          { name: 'Ana', email: 'a@b.com' },
        ]) {
          const res = await postGuest(target.proId, body);
          expect({ body, status: res.status }).toEqual({ body, status: 400 });
        }
      });

      it('un correo que es de una cuenta se trata como esa cuenta: el propio profesional no se reseña', async () => {
        const res = await postGuest(owner.proId, { rating: 5, name: 'Yo', email: owner.email });
        expect(res.status).toBe(409);
        expect(res.body.details).toMatchObject({ blocker: 'OWN_PROFILE' });
      });

      it('un correo de una cuenta con trabajo terminado sin reseña va por el trabajo', async () => {
        const target = await pro('guestjob');
        const job = await completedJob(target, 'clienteguest');
        const res = await postGuest(target.proId, { rating: 5, name: 'Cli', email: job.client.email });
        expect(res.status).toBe(409);
        expect(res.body.details).toMatchObject({ blocker: 'USE_JOB_REVIEW', requestId: job.requestId });
      });

      it('perfil inexistente → 404', async () => {
        expect((await postGuest(randomUUID(), { rating: 5, name: 'Ana', email: 'x@y.com' })).status).toBe(
          404,
        );
      });
    });

    it('la base impide una reseña verificada sin trabajo o una invitada con trabajo', async () => {
      const u = await register('constraint');
      const [{ id: clientId }] = await h.dataSource.query(`SELECT id FROM users WHERE email = $1`, [u.email]);
      await expect(
        h.dataSource.query(
          `INSERT INTO reviews (professional_id, client_id, rating, verified_work) VALUES ($1, $2, 5, true)`,
          [owner.proId, clientId],
        ),
      ).rejects.toThrow();
    });
  });
  describe('reportar reseñas y moderación', () => {
    let target: Pro;
    let job: Awaited<ReturnType<typeof completedJob>>;
    let reviewId: string;
    const report = (token: string | null, id: string, body: Record<string, unknown>) => {
      const req = h.http.post(`${API}/reviews/${id}/report`);
      return (token ? req.set(auth(token)) : req).send(body);
    };

    beforeAll(async () => {
      target = await pro('reportado');
      job = await completedJob(target, 'autorresena');
      await postReview(job.client.token, job.requestId, { rating: 1, comment: 'Mala experiencia' }).expect(
        201,
      );
      reviewId = (await publicPro(target.proId)).reviews[0].id;
    });

    it('hace falta cuenta para reportar (401) y el motivo es obligatorio y válido (400)', async () => {
      expect((await report(null, reviewId, { reason: 'FAKE' })).status).toBe(401);
      const u = await register('reportante0');
      for (const body of [
        {},
        { reason: 'OTRO' },
        { reason: 'FAKE', details: '<b>x</b>' },
        { reason: 'FAKE', details: 'x'.repeat(501) },
      ]) {
        expect({ body, status: (await report(u.token, reviewId, body)).status }).toEqual({
          body,
          status: 400,
        });
      }
    });

    it('una reseña inexistente es 404 y la propia no se puede reportar (409)', async () => {
      const u = await register('reportante1');
      expect((await report(u.token, randomUUID(), { reason: 'SPAM' })).status).toBe(404);
      const own = await report(job.client.token, reviewId, { reason: 'SPAM' });
      expect(own.status).toBe(409);
    });

    it('el profesional reporta; es idempotente y NO oculta nada por sí solo', async () => {
      const res = await report(target.token, reviewId, { reason: 'FAKE', details: 'Nunca trabajó conmigo.' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ reported: true });
      await report(target.token, reviewId, { reason: 'OFFENSIVE' }).expect(200);
      const rows = await h.dataSource.query(
        `SELECT reason, status FROM review_reports WHERE review_id = $1`,
        [reviewId],
      );
      expect(rows).toEqual([{ reason: 'FAKE', status: 'OPEN' }]);
      expect(await publicPro(target.proId)).toMatchObject({ reviewsCount: 1, averageRating: 1 });
    });

    it('el administrador la oculta: deja de mostrarse y de contar, pero conserva el lugar; restaurar la devuelve', async () => {
      const moderation = h.app.get(ReviewModerationService);
      const open = (await moderation.listOpen()).filter((r) => r.reviewId === reviewId);
      expect(open).toHaveLength(1);
      expect(open[0]).toMatchObject({ reason: 'FAKE', kind: 'VERIFICADA', reviewer: 'autorresena' });
      const second = await register('reportante2');
      await report(second.token, reviewId, { reason: 'SPAM' }).expect(200);

      const hidden = await moderation.hide(open[0].reportId, 'test', 'No corresponde a un trabajo real');
      expect(hidden.hidden).toBe(true);
      const after = await publicPro(target.proId);
      expect(after).toMatchObject({ reviewsCount: 0, averageRating: null, reviews: [] });
      expect(after.ratingDistribution.every((d: { count: number }) => d.count === 0)).toBe(true);
      expect((await h.http.get(`${API}/professionals/${target.proId}/reviews`).expect(200)).body.total).toBe(
        0,
      );
      // Todos los reportes abiertos de esa reseña quedan resueltos; ya no se puede reportar.
      expect((await moderation.listOpen()).filter((r) => r.reviewId === reviewId)).toHaveLength(0);
      expect((await report(second.token, reviewId, { reason: 'SPAM' })).status).toBe(404);
      // Conserva el lugar: no puede volver a reseñar ese trabajo.
      expect((await postReview(job.client.token, job.requestId, { rating: 5 })).status).toBe(409);

      await moderation.restore(reviewId);
      expect(await publicPro(target.proId)).toMatchObject({ reviewsCount: 1, averageRating: 1 });
    });

    it('descartar un reporte deja la reseña como estaba', async () => {
      const moderation = h.app.get(ReviewModerationService);
      const u = await register('reportante3');
      await report(u.token, reviewId, { reason: 'OTHER' }).expect(200);
      const [item] = (await moderation.listOpen()).filter((r) => r.reviewId === reviewId);
      expect((await moderation.dismiss(item.reportId, 'test')).status).toBe('DISMISSED');
      expect(await publicPro(target.proId)).toMatchObject({ reviewsCount: 1 });
    });

    it('también se reportan las reseñas por invitación sin cuenta (reviewer visible: nombre de pila)', async () => {
      const guestPro = await pro('conguest');
      await h.http
        .post(`${API}/professionals/${guestPro.proId}/guest-review`)
        .send({ rating: 5, name: 'Tito Pérez', email: 'tito@correo.com' })
        .expect(201);
      const invitedId = (await publicPro(guestPro.proId)).invitedReviews[0].id;
      const u = await register('reportante4');
      await report(u.token, invitedId, { reason: 'FAKE' }).expect(200);
      const moderation = h.app.get(ReviewModerationService);
      const [item] = (await moderation.listOpen()).filter((r) => r.reviewId === invitedId);
      expect(item).toMatchObject({ kind: 'INVITADA', reviewer: 'Tito' });
      await moderation.hide(item.reportId, 'test', 'Spam');
      expect(await publicPro(guestPro.proId)).toMatchObject({ invitedReviewsCount: 0, invitedReviews: [] });
    });
  });
});
