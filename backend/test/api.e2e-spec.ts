import { randomUUID } from 'crypto';
import { describeE2E, Harness, startApp } from './app.harness';

const API = '/api/v1';
const PASSWORD = 'una-clave-bien-larga';

describeE2E('Resuelve API (e2e, PostgreSQL real)', () => {
  let h: Harness;
  let plomeriaId: string;
  let electricidadId: string;
  let villaItaliaId: string;

  // ---- helpers ------------------------------------------------------------
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function register(label: string) {
    const email = `${label}-${randomUUID().slice(0, 8)}@test.dev`;
    const res = await h.http
      .post(`${API}/auth/register`)
      .send({ firstName: label, lastName: 'Test', email, password: PASSWORD, phone: '+54 249 555 0000' });
    expect(res.status).toBe(201);
    return { email, token: res.body.accessToken as string, refresh: res.body.refreshToken as string };
  }

  async function registerPro(label: string, serviceIds = [plomeriaId], available = true) {
    const user = await register(label);
    const res = await h.http
      .post(`${API}/pro/profile`)
      .set(auth(user.token))
      .send({ headline: 'Plomero', yearsExperience: 5, serviceIds, zoneIds: [villaItaliaId] });
    expect(res.status).toBe(201);
    if (available)
      await h.http
        .patch(`${API}/pro/availability`)
        .set(auth(user.token))
        .send({ availableToday: true })
        .expect(200);
    return { ...user, proId: res.body.id as string };
  }

  async function createRequest(token: string, extra: Record<string, unknown> = {}) {
    const res = await h.http
      .post(`${API}/requests`)
      .set(auth(token))
      .send({
        serviceId: plomeriaId,
        zoneId: villaItaliaId,
        title: 'Pérdida bajo mesada',
        description: 'Gotea la pileta de la cocina desde ayer.',
        exactAddress: 'Calle Secreta 123',
        urgency: 'TODAY',
        ...extra,
      });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  const quoteBody = {
    description: 'Cambio de sifón y flexibles',
    laborAmount: 20000,
    items: [{ description: 'Sifón', quantity: 2, unitPrice: 4500.5 }],
  };

  beforeAll(async () => {
    h = await startApp();
    const services = (await h.http.get(`${API}/services`).expect(200)).body as { id: string; slug: string }[];
    plomeriaId = services.find((s) => s.slug === 'plomeria')!.id;
    electricidadId = services.find((s) => s.slug === 'electricidad')!.id;
    const zones = (await h.http.get(`${API}/zones`).expect(200)).body as { id: string; slug: string }[];
    villaItaliaId = zones.find((z) => z.slug === 'villa-italia')!.id;
  }, 60_000);

  afterAll(async () => {
    await h?.app.close();
  });

  // ---- Infra --------------------------------------------------------------
  it('GET /health responde ok con la base arriba', async () => {
    const res = await h.http.get(`${API}/health`).expect(200);
    expect(res.body).toMatchObject({ status: 'ok', database: 'up' });
  });

  it('los endpoints privados exigen token (error con formato consistente)', async () => {
    const res = await h.http.get(`${API}/requests/mine`).expect(401);
    expect(res.body).toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
    expect(res.body.path).toBe(`${API}/requests/mine`);
  });

  // ---- Auth ---------------------------------------------------------------
  describe('auth', () => {
    it('register + me, sin exponer passwordHash', async () => {
      const u = await register('ana');
      const me = await h.http.get(`${API}/auth/me`).set(auth(u.token)).expect(200);
      expect(me.body.email).toBe(u.email);
      expect(JSON.stringify(me.body)).not.toMatch(/password/i);
    });

    it('no permite registrar dos veces el mismo email (sin importar mayúsculas)', async () => {
      const u = await register('dup');
      const res = await h.http
        .post(`${API}/auth/register`)
        .send({ firstName: 'X', lastName: 'Y', email: u.email.toUpperCase(), password: PASSWORD });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('EMAIL_ALREADY_REGISTERED');
    });

    it('login correcto', async () => {
      const u = await register('login');
      const res = await h.http
        .post(`${API}/auth/login`)
        .send({ email: u.email, password: PASSWORD })
        .expect(200);
      expect(res.body.accessToken).toBeTruthy();
      expect(res.body.tokenType).toBe('Bearer');
    });

    it('password incorrecta y email inexistente dan el mismo 401', async () => {
      const u = await register('wrong');
      const bad = await h.http
        .post(`${API}/auth/login`)
        .send({ email: u.email, password: 'otra-clave-cualquiera' });
      const none = await h.http
        .post(`${API}/auth/login`)
        .send({ email: 'nadie@test.dev', password: 'otra-clave-cualquiera' });
      expect(bad.status).toBe(401);
      expect(none.status).toBe(401);
      expect(bad.body.code).toBe('INVALID_CREDENTIALS');
      expect(none.body.message).toBe(bad.body.message);
    });

    describe('rotación del refresh token', () => {
      const refresh = (token: string) => h.http.post(`${API}/auth/refresh`).send({ refreshToken: token });
      const me = (access: string) => h.http.get(`${API}/auth/me`).set('Authorization', `Bearer ${access}`);
      /** Simula que pasó la ventana de gracia desde la rotación. */
      const ageRotation = (token: string) =>
        h.dataSource.query(
          `UPDATE refresh_tokens SET revoked_at = revoked_at - interval '1 minute' WHERE token_hash = encode(sha256($1::bytea), 'hex')`,
          [token],
        );

      it('rota: el nuevo sirve y el anterior queda revocado y enlazado', async () => {
        const u = await register('rot-ok');
        const r2 = await refresh(u.refresh).expect(200);
        await me(r2.body.accessToken).expect(200);
        const r3 = await refresh(r2.body.refreshToken).expect(200);
        await me(r3.body.accessToken).expect(200);
        const [row] = await h.dataSource.query(
          `SELECT revoked_at IS NOT NULL AS revoked, replaced_by_id IS NOT NULL AS linked
           FROM refresh_tokens WHERE token_hash = encode(sha256($1::bytea), 'hex')`,
          [u.refresh],
        );
        expect(row).toEqual({ revoked: true, linked: true });
      });

      it('reintento inmediato del token rotado (respuesta perdida): sesión utilizable, sin revocar', async () => {
        const u = await register('rot-retry');
        const r2 = await refresh(u.refresh).expect(200);
        // El navegador nunca recibió R2 (la recarga cortó la respuesta) y reenvía R1.
        const r3 = await refresh(u.refresh).expect(200);
        expect(r3.body.refreshToken).not.toBe(r2.body.refreshToken);
        await me(r3.body.accessToken).expect(200);
        // Los dos descendientes siguen valiendo: ninguno deja al cliente con un token muerto.
        await refresh(r3.body.refreshToken).expect(200);
        await refresh(r2.body.refreshToken).expect(200);
      });

      it('dos refresh simultáneos con el mismo token: ambos reciben una sesión que sirve', async () => {
        const u = await register('rot-concurrent');
        const [a, b] = await Promise.all([refresh(u.refresh), refresh(u.refresh)]);
        expect([a.status, b.status]).toEqual([200, 200]);
        expect(a.body.refreshToken).not.toBe(b.body.refreshToken);
        const [a2, b2] = await Promise.all([refresh(a.body.refreshToken), refresh(b.body.refreshToken)]);
        expect([a2.status, b2.status]).toEqual([200, 200]);
      });

      it('fuera de la ventana de gracia, reusar el token rotado es robo: se cierran todas las sesiones', async () => {
        const u = await register('rot-reuse');
        const r2 = await refresh(u.refresh).expect(200);
        await ageRotation(u.refresh);
        const reuse = await refresh(u.refresh);
        expect(reuse.status).toBe(401);
        expect(reuse.body.code).toBe('INVALID_REFRESH_TOKEN');
        await refresh(r2.body.refreshToken).expect(401);
      });

      it('dentro de la ventana, si la familia ya se cerró (logout), el reintento no revive la sesión', async () => {
        const u = await register('rot-closed');
        const r2 = await refresh(u.refresh).expect(200);
        await h.http.post(`${API}/auth/logout`).send({ refreshToken: r2.body.refreshToken }).expect(204);
        const retry = await refresh(u.refresh);
        expect(retry.status).toBe(401);
        expect(retry.body.code).toBe('INVALID_REFRESH_TOKEN');
      });

      it('dentro de la ventana, si hubo revocación por robo, el reintento tampoco sirve', async () => {
        const u = await register('rot-stolen');
        const r2 = await refresh(u.refresh).expect(200);
        await refresh(r2.body.refreshToken).expect(200);
        await ageRotation(r2.body.refreshToken);
        await refresh(r2.body.refreshToken).expect(401); // reuso real: revoca todo
        await refresh(u.refresh).expect(401); // R1 todavía en ventana, pero su familia murió
      });
    });

    it('logout revoca el refresh token', async () => {
      const u = await register('logout');
      await h.http.post(`${API}/auth/logout`).send({ refreshToken: u.refresh }).expect(204);
      await h.http.post(`${API}/auth/refresh`).send({ refreshToken: u.refresh }).expect(401);
    });

    it('guarda refresh tokens hasheados, nunca en claro', async () => {
      const u = await register('hash');
      const rows: { token_hash: string }[] = await h.dataSource.query(
        'SELECT token_hash FROM refresh_tokens',
      );
      expect(rows.some((r) => r.token_hash === u.refresh)).toBe(false);
      expect(rows.every((r) => /^[0-9a-f]{64}$/.test(r.token_hash))).toBe(true);
    });
  });

  // ---- Requests -------------------------------------------------------------
  describe('requests', () => {
    it('el cliente solo ve y edita sus solicitudes', async () => {
      const owner = await register('owner');
      const other = await register('other');
      const id = await createRequest(owner.token);

      await h.http.get(`${API}/requests/${id}`).set(auth(other.token)).expect(404);
      await h.http
        .patch(`${API}/requests/${id}`)
        .set(auth(other.token))
        .send({ title: 'Hackeado' })
        .expect(404);
      const ok = await h.http
        .patch(`${API}/requests/${id}`)
        .set(auth(owner.token))
        .send({ title: 'Pérdida en la cocina' })
        .expect(200);
      expect(ok.body.title).toBe('Pérdida en la cocina');
      const mine = await h.http.get(`${API}/requests/mine`).set(auth(other.token)).expect(200);
      expect(mine.body.items.some((r: { id: string }) => r.id === id)).toBe(false);
    });

    it('máximo 3 profesionales invitados por solicitud', async () => {
      const client = await register('max3');
      const pros = await Promise.all(['p1', 'p2', 'p3', 'p4'].map((l) => registerPro(l)));
      const id = await createRequest(client.token);

      const tooMany = await h.http
        .post(`${API}/requests/${id}/invitations`)
        .set(auth(client.token))
        .send({ professionalIds: pros.map((p) => p.proId) });
      expect(tooMany.status).toBe(400); // el DTO no acepta más de 3

      const three = await h.http
        .post(`${API}/requests/${id}/invitations`)
        .set(auth(client.token))
        .send({ professionalIds: pros.slice(0, 3).map((p) => p.proId) })
        .expect(200);
      expect(three.body.status).toBe('WAITING_QUOTES');
      expect(three.body.invitations).toHaveLength(3);

      const fourth = await h.http
        .post(`${API}/requests/${id}/invitations`)
        .set(auth(client.token))
        .send({ professionalIds: [pros[3].proId] });
      expect(fourth.status).toBe(422);
      expect(fourth.body.code).toBe('INVITATION_LIMIT_REACHED');
    });

    it('no se puede invitar a quien no ofrece el servicio', async () => {
      const client = await register('elig');
      const electricista = await registerPro('elec', [electricidadId]);
      const id = await createRequest(client.token);
      const res = await h.http
        .post(`${API}/requests/${id}/invitations`)
        .set(auth(client.token))
        .send({ professionalIds: [electricista.proId] });
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('PROFESSIONAL_NOT_ELIGIBLE');
    });

    it('urgencias: solo profesionales disponibles hoy', async () => {
      const client = await register('urg');
      const offline = await registerPro('offline', [plomeriaId], false);
      const id = await createRequest(client.token, { urgency: 'URGENT' });
      const res = await h.http
        .post(`${API}/requests/${id}/invitations`)
        .set(auth(client.token))
        .send({ professionalIds: [offline.proId] });
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('PROFESSIONAL_NOT_ELIGIBLE');
    });
  });

  // ---- Quotes + accept + privacy + transitions + reviews ----------------
  describe('flujo completo de un trabajo', () => {
    let client: Awaited<ReturnType<typeof register>>;
    let proA: Awaited<ReturnType<typeof registerPro>>;
    let proB: Awaited<ReturnType<typeof registerPro>>;
    let outsider: Awaited<ReturnType<typeof registerPro>>;
    let requestId: string;
    let quoteA: string;
    let quoteB: string;

    beforeAll(async () => {
      client = await register('cliente');
      proA = await registerPro('proA');
      proB = await registerPro('proB');
      outsider = await registerPro('outsider');
      requestId = await createRequest(client.token);
      await h.http
        .post(`${API}/requests/${requestId}/invitations`)
        .set(auth(client.token))
        .send({ professionalIds: [proA.proId, proB.proId] })
        .expect(200);
    });

    it('un profesional solo cotiza solicitudes que recibió', async () => {
      const res = await h.http
        .post(`${API}/pro/requests/${requestId}/quote`)
        .set(auth(outsider.token))
        .send(quoteBody);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('NOT_INVITED');
      await h.http.get(`${API}/pro/requests/${requestId}`).set(auth(outsider.token)).expect(404);
    });

    it('el total se calcula en el servidor (no se acepta totalAmount)', async () => {
      const forged = await h.http
        .post(`${API}/pro/requests/${requestId}/quote`)
        .set(auth(proA.token))
        .send({ ...quoteBody, totalAmount: 1 });
      expect(forged.status).toBe(400);

      const res = await h.http
        .post(`${API}/pro/requests/${requestId}/quote`)
        .set(auth(proA.token))
        .send(quoteBody)
        .expect(201);
      expect(res.body).toMatchObject({
        laborAmount: '20000.00',
        materialsAmount: '9001.00',
        totalAmount: '29001.00',
        status: 'PENDING',
      });
      quoteA = res.body.id;
    });

    it('no permite dos presupuestos activos del mismo profesional; se edita el existente', async () => {
      const dup = await h.http
        .post(`${API}/pro/requests/${requestId}/quote`)
        .set(auth(proA.token))
        .send(quoteBody);
      expect(dup.status).toBe(409);
      expect(dup.body.code).toBe('QUOTE_ALREADY_EXISTS');
      expect(dup.body.details.quoteId).toBe(quoteA);

      const edited = await h.http
        .patch(`${API}/pro/quotes/${quoteA}`)
        .set(auth(proA.token))
        .send({ description: 'Cambio de sifón', laborAmount: 25000.5, materialsAmount: 1000 })
        .expect(200);
      expect(edited.body.totalAmount).toBe('26000.50');
      expect(edited.body.items).toHaveLength(0);
    });

    it('privacidad: el profesional invitado no recibe dirección ni teléfono', async () => {
      const res = await h.http.get(`${API}/pro/requests/${requestId}`).set(auth(proA.token)).expect(200);
      expect(res.body.contact).toBeNull();
      expect(JSON.stringify(res.body)).not.toContain('Calle Secreta 123');
      expect(JSON.stringify(res.body)).not.toContain('555 0000');
      expect(res.body.zone.slug).toBe('villa-italia');
    });

    it('la solicitud pasa a QUOTES_RECEIVED y el cliente ve los presupuestos', async () => {
      quoteB = (
        await h.http
          .post(`${API}/pro/requests/${requestId}/quote`)
          .set(auth(proB.token))
          .send(quoteBody)
          .expect(201)
      ).body.id;
      const req = await h.http.get(`${API}/requests/${requestId}`).set(auth(client.token)).expect(200);
      expect(req.body.status).toBe('QUOTES_RECEIVED');
      const quotes = await h.http
        .get(`${API}/requests/${requestId}/quotes`)
        .set(auth(client.token))
        .expect(200);
      expect(quotes.body.map((q: { id: string }) => q.id).sort()).toEqual([quoteA, quoteB].sort());
    });

    it('transición imposible: no se puede completar ni reseñar antes de elegir', async () => {
      const complete = await h.http.post(`${API}/requests/${requestId}/complete`).set(auth(proA.token));
      expect(complete.status).toBe(404); // todavía nadie fue elegido
      const review = await h.http
        .post(`${API}/requests/${requestId}/review`)
        .set(auth(client.token))
        .send({ rating: 5 });
      expect(review.status).toBe(409);
      expect(review.body.code).toBe('REVIEW_NOT_ALLOWED');
    });

    it('solo el dueño acepta un presupuesto', async () => {
      const other = await register('intruso');
      await h.http.post(`${API}/quotes/${quoteA}/accept`).set(auth(other.token)).expect(404);
      await h.http.post(`${API}/quotes/${quoteA}/accept`).set(auth(proA.token)).expect(404);
    });

    it('aceptar: una sola quote gana y las demás quedan rechazadas', async () => {
      const res = await h.http.post(`${API}/quotes/${quoteA}/accept`).set(auth(client.token)).expect(200);
      expect(res.body).toMatchObject({
        status: 'PROFESSIONAL_SELECTED',
        selectedProfessionalId: proA.proId,
        acceptedQuoteId: quoteA,
      });

      const second = await h.http.post(`${API}/quotes/${quoteB}/accept`).set(auth(client.token));
      expect(second.status).toBe(409);
      expect(second.body.code).toBe('INVALID_QUOTE_STATE');

      const quotes = await h.http
        .get(`${API}/requests/${requestId}/quotes`)
        .set(auth(client.token))
        .expect(200);
      const status = Object.fromEntries(
        quotes.body.map((q: { id: string; status: string }) => [q.id, q.status]),
      );
      expect(status).toEqual({ [quoteA]: 'ACCEPTED', [quoteB]: 'REJECTED' });
    });

    it('privacidad: el elegido ve la dirección; el no seleccionado sigue sin verla', async () => {
      const a = await h.http.get(`${API}/pro/requests/${requestId}`).set(auth(proA.token)).expect(200);
      expect(a.body.contact).toMatchObject({ exactAddress: 'Calle Secreta 123', phone: '+54 249 555 0000' });
      const b = await h.http.get(`${API}/pro/requests/${requestId}`).set(auth(proB.token)).expect(200);
      expect(b.body.contact).toBeNull();
      expect(JSON.stringify(b.body)).not.toContain('Calle Secreta 123');
    });

    it('cita, completar (solo el elegido) y transiciones imposibles', async () => {
      const start = new Date(Date.now() + 2 * 24 * 3600 * 1000);
      const proposed = await h.http
        .post(`${API}/pro/requests/${requestId}/appointments`)
        .set(auth(proA.token))
        .send({ startsAt: start.toISOString(), durationMinutes: 120 })
        .expect(200);
      const appointmentId = proposed.body.appointment.id;
      await h.http.post(`${API}/appointments/${appointmentId}/confirm`).set(auth(client.token)).expect(200);
      const agenda = await h.http
        .get(`${API}/pro/appointments`)
        .set(auth(proA.token))
        .query({ to: new Date(start.getTime() + 24 * 3600 * 1000).toISOString() })
        .expect(200);
      expect(agenda.body).toHaveLength(1);
      // La agenda no trae teléfono ni dirección: eso queda en el detalle autorizado.
      expect(JSON.stringify(agenda.body)).not.toContain('Calle Secreta 123');

      // El trabajo ya empezó (se corre la cita al pasado sin esperar dos días).
      await h.dataSource.query(
        `UPDATE appointments SET scheduled_start = now() - interval '2 hours', scheduled_end = now() WHERE id = $1`,
        [appointmentId],
      );
      await h.http.post(`${API}/requests/${requestId}/complete`).set(auth(proB.token)).expect(404);
      const done = await h.http
        .post(`${API}/requests/${requestId}/complete`)
        .set(auth(proA.token))
        .expect(200);
      expect(done.body.status).toBe('COMPLETED');
      expect(done.body.appointment.status).toBe('COMPLETED');

      const cancel = await h.http.post(`${API}/requests/${requestId}/cancel`).set(auth(client.token));
      expect(cancel.status).toBe(409);
    });

    it('reseña: solo el cliente real, una por trabajo, y recalcula el rating', async () => {
      const other = await register('otro-cliente');
      await h.http
        .post(`${API}/requests/${requestId}/review`)
        .set(auth(other.token))
        .send({ rating: 1 })
        .expect(404);

      const before = (await h.http.get(`${API}/professionals/${proA.proId}`).expect(200)).body;
      expect(before.reviewsCount).toBe(0);

      const review = await h.http
        .post(`${API}/requests/${requestId}/review`)
        .set(auth(client.token))
        .send({ rating: 4, comment: 'Prolijo' })
        .expect(201);
      expect(review.body).toMatchObject({ rating: 4 });

      const after = (await h.http.get(`${API}/professionals/${proA.proId}`).expect(200)).body;
      expect(after).toMatchObject({ reviewsCount: 1, averageRating: 4, completedJobsCount: 1 });
      expect(JSON.stringify(after)).not.toContain('@test.dev');

      const dup = await h.http
        .post(`${API}/requests/${requestId}/review`)
        .set(auth(client.token))
        .send({ rating: 5 });
      expect(dup.status).toBe(409);
      expect(dup.body.code).toBe('REVIEW_ALREADY_EXISTS');

      // La reseña no cambia el estado: el trabajo ya estaba COMPLETED.
      const done = await h.http.get(`${API}/requests/${requestId}`).set(auth(client.token)).expect(200);
      expect(done.body.status).toBe('COMPLETED');
      const b = await h.http.get(`${API}/pro/requests/${requestId}`).set(auth(proA.token)).expect(200);
      expect(b.body.contact).toBeNull(); // terminado: deja de compartirse
    });
  });

  it('aceptaciones concurrentes: solo una puede ganar', async () => {
    const client = await register('race');
    const [p1, p2] = await Promise.all([registerPro('r1'), registerPro('r2')]);
    const id = await createRequest(client.token);
    await h.http
      .post(`${API}/requests/${id}/invitations`)
      .set(auth(client.token))
      .send({ professionalIds: [p1.proId, p2.proId] })
      .expect(200);
    const q1 = (
      await h.http.post(`${API}/pro/requests/${id}/quote`).set(auth(p1.token)).send(quoteBody).expect(201)
    ).body.id;
    const q2 = (
      await h.http.post(`${API}/pro/requests/${id}/quote`).set(auth(p2.token)).send(quoteBody).expect(201)
    ).body.id;

    const results = await Promise.all(
      [q1, q2].map((q) => h.http.post(`${API}/quotes/${q}/accept`).set(auth(client.token))),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const accepted: { count: number }[] = await h.dataSource.query(
      `SELECT COUNT(*)::int AS count FROM quotes WHERE request_id = $1 AND status = 'ACCEPTED'`,
      [id],
    );
    expect(accepted[0].count).toBe(1);
  });

  // ---- Pro profile ---------------------------------------------------------
  describe('perfil profesional', () => {
    it('publica servicios, zonas y disponibilidad en una sola alta; /auth/me se actualiza', async () => {
      const u = await register('onboarding');
      const body = {
        headline: 'Plomería en Tandil',
        bio: 'Trabajo en Tandil.',
        yearsExperience: 3,
        serviceIds: [plomeriaId],
        zoneIds: [villaItaliaId],
        availableToday: true,
      };
      const before = await h.http.get(`${API}/auth/me`).set(auth(u.token)).expect(200);
      expect(before.body.professionalProfileId).toBeNull();

      const created = await h.http.post(`${API}/pro/profile`).set(auth(u.token)).send(body).expect(201);
      expect(created.body).toMatchObject({
        headline: body.headline,
        availableToday: true,
        services: [{ id: plomeriaId }],
        zones: [{ id: villaItaliaId }],
      });
      const me = await h.http.get(`${API}/auth/me`).set(auth(u.token)).expect(200);
      expect(me.body.professionalProfileId).toBe(created.body.id);
      const publicProfile = await h.http.get(`${API}/professionals/${created.body.id}`).expect(200);
      expect(publicProfile.body.availableToday).toBe(true);
      const listing = await h.http
        .get(`${API}/professionals`)
        .query({ service: plomeriaId, zone: villaItaliaId, availableToday: true, pageSize: 50 })
        .expect(200);
      expect(listing.body.items.some((p: { id: string }) => p.id === created.body.id)).toBe(true);

      const second = await h.http.post(`${API}/pro/profile`).set(auth(u.token)).send(body).expect(409);
      expect(second.body.code).toBe('PROFESSIONAL_PROFILE_EXISTS');
      expect((await h.http.get(`${API}/auth/me`).set(auth(u.token)).expect(200)).body.professionalProfileId).toBe(created.body.id);
    });

    it('revierte el alta si una zona no existe', async () => {
      const u = await register('onboarding-rollback');
      const res = await h.http.post(`${API}/pro/profile`).set(auth(u.token)).send({
        headline: 'Plomero',
        yearsExperience: 1,
        serviceIds: [plomeriaId],
        zoneIds: [randomUUID()],
        availableToday: true,
      });
      expect(res.status).toBe(422);
      expect((await h.http.get(`${API}/auth/me`).set(auth(u.token)).expect(200)).body.professionalProfileId).toBeNull();
    });

    it('dos altas simultáneas crean un solo perfil', async () => {
      const u = await register('onboarding-concurrente');
      const body = {
        headline: 'Plomero',
        yearsExperience: 1,
        serviceIds: [plomeriaId],
        zoneIds: [villaItaliaId],
      };
      const responses = await Promise.all(
        [1, 2].map(() => h.http.post(`${API}/pro/profile`).set(auth(u.token)).send(body)),
      );
      expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(responses.find((r) => r.status === 409)?.body.code).toBe('PROFESSIONAL_PROFILE_EXISTS');
    });

    it('no acepta métricas enviadas por el cliente', async () => {
      const pro = await registerPro('metrics');
      const res = await h.http
        .patch(`${API}/pro/profile`)
        .set(auth(pro.token))
        .send({ averageRating: 5, reviewsCount: 999 });
      expect(res.status).toBe(400);
    });

    it('no puede verificarse a sí mismo', async () => {
      const pro = await registerPro('verif');
      const forged = await h.http
        .post(`${API}/pro/verifications`)
        .set(auth(pro.token))
        .send({ type: 'IDENTITY', status: 'VERIFIED' });
      expect(forged.status).toBe(400);
      const ok = await h.http
        .post(`${API}/pro/verifications`)
        .set(auth(pro.token))
        .send({ type: 'IDENTITY' })
        .expect(201);
      expect(ok.body.verificationRequests[0].status).toBe('PENDING');
      expect(ok.body.verifications.identity).toBe(false);
    });

    it('/pro/* exige perfil profesional', async () => {
      const u = await register('sinperfil');
      const res = await h.http.get(`${API}/pro/me`).set(auth(u.token));
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('PROFESSIONAL_PROFILE_REQUIRED');
    });
  });

  // ---- Search ----------------------------------------------------------------
  it('búsqueda de profesionales con filtros y paginación', async () => {
    const res = await h.http
      .get(`${API}/professionals`)
      .query({ service: 'plomeria', zone: 'villa-italia', availableToday: true, minRating: 4.5, pageSize: 2 })
      .expect(200);
    expect(res.body.pageSize).toBe(2);
    expect(res.body.items.length).toBeLessThanOrEqual(2);
    for (const p of res.body.items) {
      expect(p.availableToday).toBe(true);
      expect(p.averageRating).toBeGreaterThanOrEqual(4.5);
      expect(p.services.some((s: { slug: string }) => s.slug === 'plomeria')).toBe(true);
      expect(p).not.toHaveProperty('email');
    }
    const byId = await h.http.get(`${API}/professionals`).query({ service: plomeriaId }).expect(200);
    expect(byId.body.total).toBeGreaterThan(0);
    expect(
      byId.body.items.every((p: { services: { id: string }[] }) =>
        p.services.some((s) => s.id === plomeriaId),
      ),
    ).toBe(true);
    const licensed = await h.http
      .get(`${API}/professionals`)
      .query({ service: 'gas', licenseVerified: true })
      .expect(200);
    expect(licensed.body.items.length).toBeGreaterThan(0);
    expect(
      licensed.body.items.every((p: { verifications: { license: boolean } }) => p.verifications.license),
    ).toBe(true);
  });

  // ---- Perfil público: contrato, privacidad y 404 ------------------------------
  describe('perfil público de profesionales', () => {
    it('sin reseñas: averageRating null (no 0) y reviewsCount 0', async () => {
      const pro = await registerPro('sinresenas');
      const res = await h.http.get(`${API}/professionals/${pro.proId}`).expect(200);
      expect(res.body.averageRating).toBeNull();
      expect(res.body.reviewsCount).toBe(0);
      expect(res.body.reviews).toEqual([]);
      expect(res.body.portfolio).toEqual([]);
      const list = await h.http
        .get(`${API}/professionals`)
        .query({ service: plomeriaId, pageSize: 50 })
        .expect(200);
      const inList = list.body.items.find((p: { id: string }) => p.id === pro.proId);
      expect(inList.averageRating).toBeNull();
    });

    it('no expone datos privados del profesional ni internos de verificación', async () => {
      const pro = await registerPro('privado');
      await h.http
        .post(`${API}/pro/verifications`)
        .set(auth(pro.token))
        .send({ type: 'LICENSE', serviceId: electricidadId, reference: 'Mat. interna' })
        .expect((r) => expect([201, 422]).toContain(r.status));
      const detail = (await h.http.get(`${API}/professionals/${pro.proId}`).expect(200)).body;
      const list = (await h.http.get(`${API}/professionals`).query({ pageSize: 50 }).expect(200)).body.items;
      for (const body of [detail, list.find((p: { id: string }) => p.id === pro.proId)]) {
        const json = JSON.stringify(body);
        expect(json).not.toContain(pro.email);
        expect(json).not.toContain('555 0000');
        expect(json).not.toContain('PENDING');
        expect(json).not.toContain('Mat. interna');
        for (const key of [
          'email',
          'phone',
          'userId',
          'planTier',
          'quoteUsage',
          'verificationRequests',
          'passwordHash',
        ])
          expect(body).not.toHaveProperty(key);
        expect(body.verifications).toEqual({ identity: false, phone: false, license: false, licenses: [] });
      }
    });

    it('404 para un id inexistente o inválido', async () => {
      const missing = await h.http.get(`${API}/professionals/${randomUUID()}`).expect(404);
      expect(missing.body.code).toBe('NOT_FOUND');
      await h.http.get(`${API}/professionals/no-es-un-uuid`).expect(400);
    });
  });
  // ---- Contrato que usa el frontend (solicitudes → invitaciones → presupuestos) ----
  describe('solicitudes desde el frontend', () => {
    it('sin reseñas: averageRating null en invitaciones y presupuestos', async () => {
      const client = await register('rating-null');
      const pro = await registerPro('rating-pro');
      const id = await createRequest(client.token);
      const invited = await h.http
        .post(`${API}/requests/${id}/invitations`)
        .set(auth(client.token))
        .send({ professionalIds: [pro.proId] })
        .expect(200);
      expect(invited.body.invitations[0].professional).toMatchObject({ averageRating: null, reviewsCount: 0 });
      await h.http.post(`${API}/pro/requests/${id}/quote`).set(auth(pro.token)).send(quoteBody).expect(201);
      const quotes = await h.http.get(`${API}/requests/${id}/quotes`).set(auth(client.token)).expect(200);
      expect(quotes.body[0].professional).toMatchObject({ averageRating: null, reviewsCount: 0 });
      expect(JSON.stringify(quotes.body)).not.toContain('@test.dev');
    });

    it('listado del profesional: solo lo invitado, filtra por estado y no expone datos privados', async () => {
      const client = await register('lista-privada');
      const pro = await registerPro('lista-pro');
      const other = await registerPro('lista-otro');
      const id = await createRequest(client.token);
      await createRequest(client.token); // no invitada: no debe aparecer
      await h.http
        .post(`${API}/requests/${id}/invitations`)
        .set(auth(client.token))
        .send({ professionalIds: [pro.proId] })
        .expect(200);

      const list = await h.http.get(`${API}/pro/requests`).set(auth(pro.token)).expect(200);
      expect(list.body.total).toBe(1);
      expect(list.body.items[0]).toMatchObject({
        id,
        invitationStatus: 'PENDING',
        contact: null,
        client: { firstName: 'lista-privada', lastInitial: 'T' },
      });
      const json = JSON.stringify(list.body);
      for (const secret of ['Calle Secreta 123', '555 0000', client.email, 'Test"']) expect(json).not.toContain(secret);

      const quoted = await h.http.get(`${API}/pro/requests?status=QUOTED`).set(auth(pro.token)).expect(200);
      expect(quoted.body.total).toBe(0);
      const none = await h.http.get(`${API}/pro/requests`).set(auth(other.token)).expect(200);
      expect(none.body.total).toBe(0);
    });

    it('"No disponible": rechaza la invitación una sola vez y ya no puede cotizar', async () => {
      const client = await register('decline');
      const pro = await registerPro('decline-pro');
      const id = await createRequest(client.token);
      await h.http
        .post(`${API}/requests/${id}/invitations`)
        .set(auth(client.token))
        .send({ professionalIds: [pro.proId] })
        .expect(200);

      const declined = await h.http.post(`${API}/pro/requests/${id}/decline`).set(auth(pro.token)).expect(200);
      expect(declined.body.invitationStatus).toBe('DECLINED');
      const again = await h.http.post(`${API}/pro/requests/${id}/decline`).set(auth(pro.token));
      expect(again.status).toBe(409);
      const quote = await h.http.post(`${API}/pro/requests/${id}/quote`).set(auth(pro.token)).send(quoteBody);
      expect(quote.status).toBe(409);
      expect(quote.body.code).toBe('INVALID_REQUEST_STATE');
      const seen = await h.http.get(`${API}/requests/${id}`).set(auth(client.token)).expect(200);
      expect(seen.body.invitations[0].status).toBe('DECLINED');
    });

    it('cancelar: solo el dueño, deja de recibir presupuestos y no se cancela dos veces', async () => {
      const client = await register('cancel');
      const intruder = await register('cancel-intruso');
      const pro = await registerPro('cancel-pro');
      const id = await createRequest(client.token);
      await h.http
        .post(`${API}/requests/${id}/invitations`)
        .set(auth(client.token))
        .send({ professionalIds: [pro.proId] })
        .expect(200);

      await h.http.post(`${API}/requests/${id}/cancel`).set(auth(intruder.token)).expect(404);
      await h.http.get(`${API}/requests/${id}/quotes`).set(auth(intruder.token)).expect(404);
      const cancelled = await h.http.post(`${API}/requests/${id}/cancel`).set(auth(client.token)).expect(200);
      expect(cancelled.body.status).toBe('CANCELLED');
      expect(cancelled.body.cancelledAt).toBeTruthy();

      const quote = await h.http.post(`${API}/pro/requests/${id}/quote`).set(auth(pro.token)).send(quoteBody);
      expect(quote.status).toBe(409);
      const twice = await h.http.post(`${API}/requests/${id}/cancel`).set(auth(client.token));
      expect(twice.status).toBe(409);
      expect(twice.body.code).toBe('INVALID_REQUEST_STATE');
    });

    it('una solicitud sin invitaciones queda en DRAFT y se completa invitando después', async () => {
      const client = await register('draft');
      const pro = await registerPro('draft-pro');
      const id = await createRequest(client.token);
      const draft = await h.http.get(`${API}/requests/${id}`).set(auth(client.token)).expect(200);
      expect(draft.body).toMatchObject({ status: 'DRAFT', invitations: [] });
      // Reintentar la invitación con el mismo profesional no duplica.
      for (let i = 0; i < 2; i++)
        await h.http
          .post(`${API}/requests/${id}/invitations`)
          .set(auth(client.token))
          .send({ professionalIds: [pro.proId] })
          .expect(200);
      const sent = await h.http.get(`${API}/requests/${id}`).set(auth(client.token)).expect(200);
      expect(sent.body.status).toBe('WAITING_QUOTES');
      expect(sent.body.invitations).toHaveLength(1);
    });
  });
});
