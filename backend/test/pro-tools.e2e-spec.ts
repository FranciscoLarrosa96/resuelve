import { randomUUID } from 'crypto';
import { describeE2E, Harness, startApp } from './app.harness';

const API = '/api/v1';
const PASSWORD = 'una-clave-bien-larga';

/**
 * Herramientas del profesional: plantillas de presupuesto (privadas, con tope),
 * respuesta pública a reseñas (sin contacto, solo el dueño) y consultas antes
 * de presupuestar (una a la vez, con tope, avisos a la otra parte y sin datos
 * de contacto).
 */
describeE2E('Herramientas del profesional (e2e)', () => {
  let h: Harness;
  const svc: Record<string, string> = {};
  const zone: Record<string, string> = {};

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function register(label: string) {
    const email = `${label}-${randomUUID().slice(0, 8)}@test.dev`;
    const res = await h.http
      .post(`${API}/auth/register`)
      .send({ firstName: label, lastName: 'Prueba', email, password: PASSWORD })
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
      .send({ headline: `${label} en Tandil`, yearsExperience: 3, serviceIds: [svc.plomeria], zoneIds: [zone.centro] })
      .expect(201);
    return { ...user, proId: res.body.id as string };
  }
  type Pro = Awaited<ReturnType<typeof pro>>;

  async function invitedRequest(client: { token: string }, invited: Pro[]) {
    const req = await h.http
      .post(`${API}/requests`)
      .set(auth(client.token))
      .send({
        serviceId: svc.plomeria,
        zoneId: zone.centro,
        title: 'Pérdida bajo la mesada',
        description: 'Gotea el sifón de la cocina desde ayer.',
        urgency: 'FLEXIBLE',
      })
      .expect(201);
    const id = req.body.id as string;
    await h.http
      .post(`${API}/requests/${id}/invitations`)
      .set(auth(client.token))
      .send({ professionalIds: invited.map((p) => p.proId) })
      .expect(200);
    return id;
  }

  const notifications = async (token: string, audience: 'CLIENT' | 'PROFESSIONAL') =>
    (await h.http.get(`${API}/me/notifications`).query({ audience }).set(auth(token)).expect(200)).body.items as {
      type: string;
      route: string;
      readAt: string | null;
    }[];

  beforeAll(async () => {
    h = await startApp();
    for (const s of (await h.http.get(`${API}/services`).expect(200)).body) svc[s.slug] = s.id;
    for (const z of (await h.http.get(`${API}/zones?city=tandil`).expect(200)).body) zone[z.slug] = z.id;
  }, 60_000);

  afterAll(async () => {
    await h?.app.close();
  });

  describe('plantillas de presupuesto', () => {
    const template = {
      name: 'Cambio de sifón',
      description: 'Cambio de sifón y flexibles de la bacha de la cocina.',
      note: 'Incluye retiro del sifón viejo.',
      estimatedDuration: '2 horas',
      laborAmount: 25000,
      materialsAmount: 9000,
    };

    it('crear, listar (la más nueva primero) y borrar; privadas del dueño', async () => {
      const a = await pro('plantillas');
      const other = await pro('ajeno');
      const empty = await h.http.get(`${API}/pro/quote-templates`).set(auth(a.token)).expect(200);
      expect(empty.body).toEqual({ items: [], max: 20 });

      await h.http.post(`${API}/pro/quote-templates`).set(auth(a.token)).send(template).expect(201);
      const res = await h.http
        .post(`${API}/pro/quote-templates`)
        .set(auth(a.token))
        .send({ ...template, name: 'Destapación', note: undefined, estimatedDuration: undefined })
        .expect(201);
      expect(res.body.items.map((t: { name: string }) => t.name)).toEqual(['Destapación', 'Cambio de sifón']);
      expect(res.body.items[1]).toMatchObject({ ...template });
      expect(res.body.items[0]).toMatchObject({ note: null, estimatedDuration: null });

      // Otro profesional no la ve ni la borra.
      expect((await h.http.get(`${API}/pro/quote-templates`).set(auth(other.token)).expect(200)).body.items).toEqual([]);
      const id = res.body.items[0].id;
      await h.http.delete(`${API}/pro/quote-templates/${id}`).set(auth(other.token)).expect(404);
      const after = await h.http.delete(`${API}/pro/quote-templates/${id}`).set(auth(a.token)).expect(200);
      expect(after.body.items).toHaveLength(1);
    });

    it('valida montos y textos, y respeta el tope', async () => {
      const a = await pro('tope');
      await h.http
        .post(`${API}/pro/quote-templates`)
        .set(auth(a.token))
        .send({ ...template, laborAmount: -1 })
        .expect(400);
      await h.http.post(`${API}/pro/quote-templates`).set(auth(a.token)).send({ ...template, name: 'x' }).expect(400);
      await h.dataSource.query(
        `INSERT INTO quote_templates (professional_id, name, description, labor_amount, materials_amount)
         SELECT $1, 'Plantilla ' || g, 'Descripción de prueba', 1000, 0 FROM generate_series(1, 20) g`,
        [a.proId],
      );
      const res = await h.http.post(`${API}/pro/quote-templates`).set(auth(a.token)).send(template).expect(409);
      expect(res.body.code).toBe('QUOTE_TEMPLATES_LIMIT_REACHED');
    });

    it('sin perfil profesional no hay plantillas', async () => {
      const client = await register('cliente-plantillas');
      await h.http.get(`${API}/pro/quote-templates`).set(auth(client.token)).expect(403);
    });
  });

  describe('respuesta pública a reseñas', () => {
    it('el profesional responde, edita y borra; se ve en el perfil público', async () => {
      const p = await pro('resenas');
      await h.http
        .post(`${API}/professionals/${p.proId}/guest-review`)
        .send({ rating: 5, comment: 'Muy prolijo.', name: 'Laura', email: `laura-${randomUUID().slice(0, 6)}@test.dev` })
        .expect(201);
      const own = await h.http.get(`${API}/pro/reviews`).set(auth(p.token)).expect(200);
      expect(own.body.total).toBe(1);
      const review = own.body.items[0];
      expect(review.reply).toBeNull();

      const replied = await h.http
        .put(`${API}/pro/reviews/${review.id}/reply`)
        .set(auth(p.token))
        .send({ text: '  ¡Gracias, Laura!   Fue un gusto.  ' })
        .expect(200);
      expect(replied.body.reply.text).toBe('¡Gracias, Laura! Fue un gusto.');

      const pub = await h.http.get(`${API}/professionals/${p.proId}`).expect(200);
      expect(pub.body.invitedReviews[0].reply.text).toBe('¡Gracias, Laura! Fue un gusto.');

      await h.http.put(`${API}/pro/reviews/${review.id}/reply`).set(auth(p.token)).send({ text: 'Editada.' }).expect(200);
      const removed = await h.http.delete(`${API}/pro/reviews/${review.id}/reply`).set(auth(p.token)).expect(200);
      expect(removed.body.reply).toBeNull();
    });

    it('sin teléfonos ni emails, no vacía, y solo sobre reseñas propias y visibles', async () => {
      const p = await pro('reglas-resena');
      const other = await pro('otro-resena');
      await h.http
        .post(`${API}/professionals/${p.proId}/guest-review`)
        .send({ rating: 4, name: 'Juan', email: `juan-${randomUUID().slice(0, 6)}@test.dev` })
        .expect(201);
      const id = (await h.http.get(`${API}/pro/reviews`).set(auth(p.token)).expect(200)).body.items[0].id;

      for (const text of ['  ', 'Llamame al 249 4123456', 'Escribime a yo@correo.com']) {
        const res = await h.http.put(`${API}/pro/reviews/${id}/reply`).set(auth(p.token)).send({ text }).expect(422);
        expect(res.body.code).toBe('INVALID_REVIEW_REPLY');
      }
      await h.http.put(`${API}/pro/reviews/${id}/reply`).set(auth(other.token)).send({ text: 'Gracias' }).expect(404);

      await h.dataSource.query(`UPDATE reviews SET hidden_at = now() WHERE id = $1`, [id]);
      await h.http.put(`${API}/pro/reviews/${id}/reply`).set(auth(p.token)).send({ text: 'Gracias' }).expect(404);
      expect((await h.http.get(`${API}/pro/reviews`).set(auth(p.token)).expect(200)).body.total).toBe(0);
    });
  });

  describe('consultas antes de presupuestar', () => {
    it('pregunta, el cliente responde y cada uno recibe su aviso', async () => {
      const p = await pro('consulta');
      const client = await register('cliente-consulta');
      const requestId = await invitedRequest(client, [p]);

      const initial = await h.http.get(`${API}/pro/requests/${requestId}/questions`).set(auth(p.token)).expect(200);
      expect(initial.body).toEqual({ items: [], canAsk: true, max: 3 });

      const asked = await h.http
        .post(`${API}/pro/requests/${requestId}/questions`)
        .set(auth(p.token))
        .send({ text: '¿Me mandás una foto del sifón?' })
        .expect(200);
      expect(asked.body.items).toHaveLength(1);
      expect(asked.body.canAsk).toBe(false);

      // Una a la vez.
      const again = await h.http
        .post(`${API}/pro/requests/${requestId}/questions`)
        .set(auth(p.token))
        .send({ text: '¿Y de qué material es?' })
        .expect(409);
      expect(again.body.code).toBe('QUESTION_PENDING');

      const clientNotes = await notifications(client.token, 'CLIENT');
      const note = clientNotes.find((n) => n.type === 'CLIENT_QUESTION_RECEIVED');
      expect(note?.route).toBe(`/mis-solicitudes/${requestId}#consultas`);

      const list = await h.http.get(`${API}/requests/${requestId}/questions`).set(auth(client.token)).expect(200);
      expect(list.body.canAnswer).toBe(true);
      expect(list.body.groups).toHaveLength(1);
      expect(list.body.groups[0].professional).toEqual({ id: p.proId, displayName: 'consulta Prueba' });
      const questionId = list.body.groups[0].items[0].id;

      const answered = await h.http
        .post(`${API}/requests/${requestId}/questions/${questionId}/answer`)
        .set(auth(client.token))
        .send({ text: 'Sí, es de plástico.' })
        .expect(200);
      expect(answered.body.groups[0].items[0].answer).toBe('Sí, es de plástico.');
      await h.http
        .post(`${API}/requests/${requestId}/questions/${questionId}/answer`)
        .set(auth(client.token))
        .send({ text: 'Otra vez' })
        .expect(409);

      // Responder marca leído el aviso de esa consulta.
      expect((await notifications(client.token, 'CLIENT')).find((n) => n.type === 'CLIENT_QUESTION_RECEIVED')?.readAt).not.toBeNull();
      const proNote = (await notifications(p.token, 'PROFESSIONAL')).find((n) => n.type === 'PRO_QUESTION_ANSWERED');
      expect(proNote?.route).toBe(`/pro/solicitudes/${requestId}#consultas`);

      const afterAnswer = await h.http.get(`${API}/pro/requests/${requestId}/questions`).set(auth(p.token)).expect(200);
      expect(afterAnswer.body.canAsk).toBe(true);
    });

    it('sin datos de contacto, con tope, solo invitados y solo mientras recibe presupuestos', async () => {
      const p = await pro('consulta-reglas');
      const outsider = await pro('no-invitado');
      const client = await register('cliente-reglas');
      const other = await register('otro-cliente');
      const requestId = await invitedRequest(client, [p]);
      const ask = (who: Pro, text: string) =>
        h.http.post(`${API}/pro/requests/${requestId}/questions`).set(auth(who.token)).send({ text });

      expect((await ask(p, 'Pasame tu whatsapp 249 4123456').expect(422)).body.code).toBe('INVALID_QUESTION');
      expect((await ask(p, 'x').expect(422)).body.code).toBe('INVALID_QUESTION');
      await ask(outsider, '¿Dónde queda?').expect(404);
      await h.http.get(`${API}/requests/${requestId}/questions`).set(auth(other.token)).expect(404);

      // Tope de 3: se responden y se vuelve a preguntar.
      for (let i = 0; i < 3; i++) {
        await ask(p, `Consulta número ${i + 1}`).expect(200);
        const q = (await h.http.get(`${API}/requests/${requestId}/questions`).set(auth(client.token)).expect(200)).body
          .groups[0].items[i];
        const bad = await h.http
          .post(`${API}/requests/${requestId}/questions/${q.id}/answer`)
          .set(auth(client.token))
          .send({ text: 'Escribime a yo@correo.com' })
          .expect(422);
        expect(bad.body.code).toBe('INVALID_QUESTION');
        await h.http
          .post(`${API}/requests/${requestId}/questions/${q.id}/answer`)
          .set(auth(client.token))
          .send({ text: `Respuesta ${i + 1}` })
          .expect(200);
      }
      expect((await ask(p, 'Una más').expect(409)).body.code).toBe('QUESTIONS_LIMIT_REACHED');

      // Cancelada: ya no se pregunta.
      const second = await invitedRequest(client, [p]);
      await h.http.post(`${API}/requests/${second}/cancel`).set(auth(client.token)).expect(200);
      const closed = await h.http
        .post(`${API}/pro/requests/${second}/questions`)
        .set(auth(p.token))
        .send({ text: '¿Sigue en pie?' })
        .expect(409);
      expect(closed.body.code).toBe('QUESTION_NOT_ALLOWED');
    });
  });
});
