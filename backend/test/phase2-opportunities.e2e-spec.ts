import { randomUUID } from 'crypto';
import { describeE2E, Harness, startApp } from './app.harness';

const API = '/api/v1';
const PASSWORD = 'una-clave-bien-larga';
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

describeE2E('PRO 2.0 Fase 2: early access, cupos y atribuciÃ³n (e2e)', () => {
  let h: Harness;
  let serviceId: string;
  let zoneId: string;

  async function register(label: string) {
    const email = `${label.toLowerCase().replace(/[^a-z0-9]/g, '')}-${randomUUID().slice(0, 8)}@test.dev`;
    const pending = await h.http
      .post(`${API}/auth/register`)
      .send({ firstName: label, lastName: 'Fase Dos', email, password: PASSWORD })
      .expect(202);
    const verified = await h.http
      .post(`${API}/auth/register/verify`)
      .send({ verificationSessionId: pending.body.verificationSessionId, code: h.mail.lastCodeFor(email) })
      .expect(200);
    return { token: verified.body.accessToken as string };
  }

  async function pro(label: string) {
    const user = await register(label);
    const profile = await h.http
      .post(`${API}/pro/profile`)
      .set(auth(user.token))
      .send({ headline: `${label} en Tandil`, yearsExperience: 4, serviceIds: [serviceId], zoneIds: [zoneId] })
      .expect(201);
    return { token: user.token, id: profile.body.id as string };
  }

  async function clientRequest(
    clientToken: string,
    professionalIds: string[],
    input: { targeted?: boolean; attributionSource?: string; attributionSessionKey?: string } = {},
  ) {
    const created = await h.http
      .post(`${API}/requests`)
      .set(auth(clientToken))
      .send({
        serviceId,
        zoneId,
        title: 'Revisar pérdida de agua',
        description: 'La canilla pierde agua debajo de la pileta de la cocina.',
        exactAddress: 'Dirección privada 123',
        urgency: 'FLEXIBLE',
      })
      .expect(201);
    await h.http
      .post(`${API}/requests/${created.body.id}/invitations`)
      .set(auth(clientToken))
      .send({ professionalIds, ...input })
      .expect(200);
    return created.body.id as string;
  }

  const sendQuote = (token: string, requestId: string) =>
    h.http
      .post(`${API}/pro/requests/${requestId}/quote`)
      .set(auth(token))
      .send({ description: 'Reparación con repuestos incluidos', laborAmount: 20000 });

  beforeAll(async () => {
    h = await startApp({ firstSuccessTrial: true, freeOpportunityDelayMinutes: 30, urgentFreeOpportunityDelayMinutes: 30 });
    const services = (await h.http.get(`${API}/services`).expect(200)).body;
    const zones = (await h.http.get(`${API}/zones?city=tandil`).expect(200)).body;
    serviceId = services.find((s: { slug: string }) => s.slug === 'plomeria').id;
    zoneId = zones.find((z: { slug: string }) => z.slug === 'villa-italia').id;
  }, 60_000);

  afterAll(async () => h?.app.close());

  it('Tu mes atribuye acceso anticipado solo a PRO discovery, sin contar targeted', async () => {
    const professional = await pro('Pro anticipado');
    await h.dataSource.query(`UPDATE professional_profiles SET plan_tier = 'PRO' WHERE id = $1`, [professional.id]);
    const client = await register('Cliente anticipado');
    await clientRequest(client.token, [professional.id], { targeted: false, attributionSource: 'MARKETPLACE_DISCOVERY' });
    await clientRequest(client.token, [professional.id], { targeted: true, attributionSource: 'DIRECT_TARGETED' });
    const body = (await h.http.get(`${API}/pro/analytics/month`).set(auth(professional.token)).expect(200)).body;
    expect(body.advanced.attribution.earlyAccessOpportunities).toBe(1);
    expect(body.advanced.response.opportunities).toBe(2);
    expect(body.advanced.response.answered).toBe(0);
    expect(body.advanced.response.rate).toBe(0);
  });

  it('una solicitud cancelada antes de estar disponible no reduce la tasa de respuesta', async () => {
    const professional = await pro('Cancelada antes');
    await h.dataSource.query(`UPDATE professional_profiles SET plan_tier = 'PRO' WHERE id = $1`, [professional.id]);
    const client = await register('Cliente cancelada');
    const id = await clientRequest(client.token, [professional.id]);
    await h.dataSource.query(
      `UPDATE request_invitations SET sent_at = now() - interval '40 minutes',
         available_at = now() - interval '10 minutes' WHERE request_id = $1`, [id],
    );
    await h.dataSource.query(
      `UPDATE service_requests SET status = 'CANCELLED', cancelled_at = now() - interval '20 minutes' WHERE id = $1`, [id],
    );
    const body = (await h.http.get(`${API}/pro/analytics/month`).set(auth(professional.token)).expect(200)).body;
    expect(body.advanced.response).toMatchObject({ opportunities: 0, answered: 0, rate: null });
  });

  it('una solicitud elegida antes del desbloqueo Free no cuenta como no respondida', async () => {
    const delayed = await pro('Demora elegida');
    await h.dataSource.query(`UPDATE professional_profiles SET first_success_at = now() WHERE id = $1`, [delayed.id]);
    const winner = await pro('Ganador temprano');
    await h.dataSource.query(`UPDATE professional_profiles SET plan_tier = 'PRO' WHERE id = $1`, [winner.id]);
    const client = await register('Cliente resuelto');
    const id = await clientRequest(client.token, [delayed.id, winner.id]);
    const quote = await sendQuote(winner.token, id).expect(201);
    await h.http.post(`${API}/quotes/${quote.body.id}/accept`).set(auth(client.token)).expect(200);
    await h.dataSource.query(`UPDATE professional_profiles SET plan_tier = 'PRO' WHERE id = $1`, [delayed.id]);
    const body = (await h.http.get(`${API}/pro/analytics/month`).set(auth(delayed.token)).expect(200)).body;
    expect(body.advanced.response).toMatchObject({ opportunities: 0, answered: 0, rate: null });
  });

  it('benchmark entrega solo agregados cuando hay suficientes profesionales, respuestas y oportunidades', async () => {
    const owner = await pro('Referencia propia');
    await h.dataSource.query(`UPDATE professional_profiles SET plan_tier = 'PRO' WHERE id = $1`, [owner.id]);
    const client = await register('Cliente referencia');
    await clientRequest(client.token, [owner.id]);
    const peerIds: string[] = [];
    for (let index = 0; index < 8; index++) {
      const peer = await pro(`Referencia par ${index}`);
      peerIds.push(peer.id);
      for (let requestIndex = 0; requestIndex < 3; requestIndex++) {
        const id = await clientRequest(client.token, [peer.id]);
        if (requestIndex === 0) await sendQuote(peer.token, id).expect(201);
      }
    }
    const body = (await h.http.get(`${API}/pro/analytics/month`).set(auth(owner.token)).expect(200)).body;
    expect(body.advanced.benchmark).toMatchObject({
      available: true, serviceName: 'Plomería', cohortSize: expect.any(Number), periodDays: 90,
      medianResponseMinutes: expect.any(Number), responseRate: expect.any(Number),
    });
    expect(body.advanced.benchmark.cohortSize).toBeGreaterThanOrEqual(8);
    for (const id of peerIds) expect(JSON.stringify(body.advanced.benchmark)).not.toContain(id);
  }, 60_000);

  it('Free discovery espera el delay, el dashboard API cuenta solo accionables y targeted conserva entrega inmediata', async () => {
    const free = await pro('Free demora');
    await h.dataSource.query(`UPDATE professional_profiles SET first_success_at = now() WHERE id = $1`, [free.id]);
    const client = await register('Cliente demora');
    const discoveryId = await clientRequest(client.token, [free.id], {
      targeted: false,
      attributionSource: 'MARKETPLACE_DISCOVERY',
    });
    const [invitation] = await h.dataSource.query(
      `SELECT targeted, attribution_source, sent_at, available_at FROM request_invitations WHERE request_id = $1`,
      [discoveryId],
    );
    expect(invitation.targeted).toBe(false);
    expect(invitation.attribution_source).toBe('MARKETPLACE_DISCOVERY');
    expect(new Date(invitation.available_at).getTime() - new Date(invitation.sent_at).getTime()).toBe(30 * 60_000);

    const listed = await h.http.get(`${API}/pro/requests?status=PENDING`).set(auth(free.token)).expect(200);
    expect(listed.body.actionableCount).toBe(0);
    expect(listed.body.items.find((item: { id: string }) => item.id === discoveryId).opportunity).toMatchObject({
      delayed: true,
      actionable: false,
      availableToProfessionalAt: expect.any(String),
    });
    expect(listed.body.items.find((item: { id: string }) => item.id === discoveryId).description).toBe('');
    const hidden = await h.http.get(`${API}/pro/requests/${discoveryId}`).set(auth(free.token)).expect(200);
    expect(hidden.body).toMatchObject({ description: '', client: null, contact: null });
    expect(JSON.stringify(hidden.body)).not.toContain('Dirección privada 123');
    expect((await sendQuote(free.token, discoveryId).expect(409)).body.code).toBe('OPPORTUNITY_NOT_AVAILABLE');

    await h.dataSource.query(
      `UPDATE request_invitations SET sent_at = now() - interval '31 minutes', available_at = now() - interval '1 second' WHERE request_id = $1`,
      [discoveryId],
    );
    const unlocked = await h.http.get(`${API}/pro/requests?status=PENDING`).set(auth(free.token)).expect(200);
    expect(unlocked.body.actionableCount).toBe(1);
    expect(unlocked.body.items.find((item: { id: string }) => item.id === discoveryId).opportunity).toMatchObject({
      delayed: false,
      actionable: true,
    });
    const unlockEvents = await h.dataSource.query(
      `SELECT count(*)::int AS n FROM pro_funnel_events WHERE type = 'DELAYED_OPPORTUNITY_UNLOCKED' AND ref = $1`,
      [discoveryId],
    );
    expect(unlockEvents[0].n).toBe(1);

    const quote = await sendQuote(free.token, discoveryId).expect(201);
    const originalCreatedAt = quote.body.createdAt as string;
    expect((await h.http.get(`${API}/pro/me`).set(auth(free.token)).expect(200)).body.quoteUsage)
      .toMatchObject({ used: 1, limit: 5, remaining: 4 });
    const edit1 = await h.http.patch(`${API}/pro/quotes/${quote.body.id}`).set(auth(free.token))
      .send({
        description: 'Materiales y reparación actualizados', laborAmount: 22000,
        items: [{ description: 'Caños de repuesto', quantity: 2, unitPrice: 1500 }],
        note: 'Incluye retiro de los materiales viejos.', estimatedDuration: '1 día',
      }).expect(200);
    const edit2 = await h.http.patch(`${API}/pro/quotes/${quote.body.id}`).set(auth(free.token))
      .send({
        description: 'Reparación final con garantía', laborAmount: 24000,
        items: [{ description: 'Válvula y flexible', quantity: 1, unitPrice: 3000 }],
        note: 'Incluye limpieza del sector.', estimatedDuration: '2 horas',
      }).expect(200);
    expect(edit1.body.id).toBe(quote.body.id);
    expect(edit2.body.id).toBe(quote.body.id);
    expect(edit2.body.createdAt).toBe(originalCreatedAt);
    expect(edit2.body.updatedAt).not.toBe(quote.body.updatedAt);
    expect(edit2.body).toMatchObject({
      materialsAmount: '3000.00', totalAmount: '27000.00',
      note: 'Incluye limpieza del sector.', estimatedDuration: '2 horas',
    });
    expect((await h.http.get(`${API}/pro/me`).set(auth(free.token)).expect(200)).body.quoteUsage.used).toBe(1);
    const clientQuotes = await h.http.get(`${API}/requests/${discoveryId}/quotes`).set(auth(client.token)).expect(200);
    expect(clientQuotes.body).toHaveLength(1);
    expect(clientQuotes.body[0]).toMatchObject({
      id: quote.body.id, description: 'Reparación final con garantía', laborAmount: '24000.00',
      materialsAmount: '3000.00', totalAmount: '27000.00', note: 'Incluye limpieza del sector.',
      estimatedDuration: '2 horas', items: [{ description: 'Válvula y flexible', quantity: '1.00', unitPrice: '3000.00', subtotal: '3000.00', sortOrder: 0 }],
    });
    expect((await h.http.get(`${API}/requests/${discoveryId}`).set(auth(client.token)).expect(200)).body.quoteCapacity)
      .toMatchObject({ activeQuoteCount: 1, maxActiveQuotes: 5, remainingQuoteSlots: 4, slotsFull: false });

    const targetedId = await clientRequest(client.token, [free.id], {
      targeted: true,
      attributionSource: 'DIRECT_PUBLIC_PROFILE',
    });
    const [direct] = await h.dataSource.query(
      `SELECT targeted, sent_at, available_at FROM request_invitations WHERE request_id = $1`,
      [targetedId],
    );
    expect(direct.targeted).toBe(true);
    expect(new Date(direct.available_at).getTime()).toBe(new Date(direct.sent_at).getTime());
    await sendQuote(free.token, targetedId).expect(201);
    expect((await h.http.get(`${API}/pro/me`).set(auth(free.token)).expect(200)).body.quoteUsage.used).toBe(1);

    await h.http.post(`${API}/quotes/${quote.body.id}/accept`).set(auth(client.token)).expect(200);
    const acceptedEdit = await h.http.patch(`${API}/pro/quotes/${quote.body.id}`).set(auth(free.token))
      .send({ description: 'Intento después de aceptar', laborAmount: 30000 });
    expect(acceptedEdit.status).toBe(409);
    expect(acceptedEdit.body.code).toBe('INVALID_QUOTE_STATE');
  });

  it('FIRST_SUCCESS_TRIAL recibe discovery en T=0; cancelar baja actionableCount de 1 a 0', async () => {
    const trial = await pro('Trial inmediato');
    const client = await register('Cliente trial');
    const trialRequest = await clientRequest(client.token, [trial.id], {
      targeted: false,
      attributionSource: 'MARKETPLACE_DISCOVERY',
    });
    const [trialInvitation] = await h.dataSource.query(
      `SELECT sent_at, available_at FROM request_invitations WHERE request_id = $1`,
      [trialRequest],
    );
    expect(new Date(trialInvitation.available_at).getTime()).toBe(new Date(trialInvitation.sent_at).getTime());
    await sendQuote(trial.token, trialRequest).expect(201);

    const free = await pro('Free cancelable');
    await h.dataSource.query(`UPDATE professional_profiles SET first_success_at = now() WHERE id = $1`, [free.id]);
    const otherClient = await register('Cliente cancelación');
    const cancelRequest = await clientRequest(otherClient.token, [free.id], {
      targeted: false,
      attributionSource: 'MARKETPLACE_DISCOVERY',
    });
    await h.dataSource.query(
      `UPDATE request_invitations SET available_at = now() - interval '1 second' WHERE request_id = $1`,
      [cancelRequest],
    );
    const actionable = await h.http.get(`${API}/pro/requests?status=PENDING`).set(auth(free.token)).expect(200);
    expect(actionable.body.actionableCount).toBe(1);
    await h.http.post(`${API}/requests/${cancelRequest}/cancel`).set(auth(otherClient.token)).expect(200);
    const canceled = await h.http.get(`${API}/pro/requests?status=PENDING`).set(auth(free.token)).expect(200);
    expect(canceled.body.actionableCount).toBe(0);
  });

  it('serializa cinco lugares y cierra el sexto destinatario Free cuando vence su delay', async () => {
    const pros = await Promise.all(Array.from({ length: 6 }, (_, i) => pro(`Cupo ${i + 1}`)));
    await h.dataSource.query(`UPDATE professional_profiles SET plan_tier = 'PRO' WHERE id = ANY($1::uuid[])`, [pros.map((p) => p.id)]);
    const client = await register('Cliente cupo');
    const requestId = await clientRequest(client.token, pros.map((p) => p.id), {
      targeted: false,
      attributionSource: 'MULTI_SELECT',
    });
    for (const p of pros.slice(0, 4)) await sendQuote(p.token, requestId).expect(201);
    const raced = await Promise.all([sendQuote(pros[4].token, requestId), sendQuote(pros[5].token, requestId)]);
    expect(raced.map((r) => r.status).sort()).toEqual([201, 409]);
    const rejected = raced.find((r) => r.status === 409)!;
    expect(rejected.body.code).toBe('REQUEST_QUOTE_LIMIT_REACHED');

    const delayedFree = await pro('Free con delay');
    await h.dataSource.query(`UPDATE professional_profiles SET first_success_at = now() WHERE id = $1`, [delayedFree.id]);
    const delayedRequestId = await clientRequest(client.token, [...pros.slice(0, 5).map((p) => p.id), delayedFree.id], {
      targeted: false,
      attributionSource: 'MULTI_SELECT',
    });
    const invitations: { professional_id: string; sent_at: Date; available_at: Date }[] = await h.dataSource.query(
      `SELECT professional_id, sent_at, available_at FROM request_invitations WHERE request_id = $1`,
      [delayedRequestId],
    );
    const freeInvitation = invitations.find((i) => i.professional_id === delayedFree.id)!;
    expect(new Date(freeInvitation.available_at).getTime() - new Date(freeInvitation.sent_at).getTime()).toBe(30 * 60_000);
    for (const p of pros.slice(0, 5)) {
      const invitation = invitations.find((i) => i.professional_id === p.id)!;
      expect(new Date(invitation.available_at).getTime()).toBe(new Date(invitation.sent_at).getTime());
      await sendQuote(p.token, delayedRequestId).expect(201);
    }

    const delayedFreeView = await h.http.get(`${API}/pro/requests/${delayedRequestId}`).set(auth(delayedFree.token)).expect(200);
    expect(delayedFreeView.body).toMatchObject({
      description: '',
      opportunity: { delayed: true, slotsFull: true, actionable: false, activeQuoteCount: 5 },
    });
    expect(JSON.stringify(delayedFreeView.body)).not.toContain('Dirección privada 123');
    await h.dataSource.query(
      `UPDATE request_invitations SET available_at = now() - interval '1 second' WHERE request_id = $1 AND professional_id = $2`,
      [delayedRequestId, delayedFree.id],
    );
    const unlockedFull = await h.http.get(`${API}/pro/requests/${delayedRequestId}`).set(auth(delayedFree.token)).expect(200);
    expect(unlockedFull.body.opportunity).toMatchObject({ delayed: false, slotsFull: true, actionable: false });
    const fullQuote = await sendQuote(delayedFree.token, delayedRequestId).expect(409);
    expect(fullQuote.body.code).toBe('REQUEST_QUOTE_LIMIT_REACHED');

    const full = await h.http.get(`${API}/pro/requests/${requestId}`).set(auth(pros[5].token)).expect(200);
    expect(full.body.opportunity).toMatchObject({ activeQuoteCount: 5, maxActiveQuotes: 5, slotsFull: true, actionable: false });
    const events = await h.dataSource.query(
      `SELECT type FROM pro_funnel_events WHERE ref = $1 AND type IN ('REQUEST_SLOT_FILLED', 'REQUEST_SLOTS_FULL')`,
      [requestId],
    );
    const eventTypes = events.map((e: { type: string }) => e.type);
    expect(eventTypes).toHaveLength(2);
    expect(eventTypes).toContain('REQUEST_SLOT_FILLED');
    expect(eventTypes).toContain('REQUEST_SLOTS_FULL');
  });

  it('atribuye PRO_FEATURED solo con impresiÃ³n destacada seguida de visita y pedido dirigido', async () => {
    const featured = await pro('Destacado');
    await h.dataSource.query(`UPDATE professional_profiles SET plan_tier = 'PRO' WHERE id = $1`, [featured.id]);
    const client = await register('Cliente destacado');
    const sessionKey = `ses_${randomUUID().replace(/-/g, '')}`;
    await h.http.post(`${API}/analytics/events`).send({
      sessionKey,
      events: [
        { type: 'SEARCH_IMPRESSION', professionalId: featured.id, serviceId, zoneId, page: 1, isUrgent: false, isFeaturedPlacement: true },
        { type: 'PROFILE_VIEW', professionalId: featured.id },
      ],
    }).expect(200);
    const featuredRequest = await clientRequest(client.token, [featured.id], {
      targeted: true,
      attributionSource: 'DIRECT_PUBLIC_PROFILE',
      attributionSessionKey: sessionKey,
    });
    const [source] = await h.dataSource.query(
      `SELECT targeted, attribution_source FROM request_invitations WHERE request_id = $1`,
      [featuredRequest],
    );
    expect(source).toEqual({ targeted: true, attribution_source: 'PRO_FEATURED' });

    const noProfileSession = `ses_${randomUUID().replace(/-/g, '')}`;
    await h.http.post(`${API}/analytics/events`).send({
      sessionKey: noProfileSession,
      events: [{ type: 'SEARCH_IMPRESSION', professionalId: featured.id, serviceId, zoneId, page: 1, isUrgent: false, isFeaturedPlacement: true }],
    }).expect(200);
    const organicRequest = await clientRequest(client.token, [featured.id], {
      targeted: true,
      attributionSource: 'ORGANIC_SEARCH',
      attributionSessionKey: noProfileSession,
    });
    const [organic] = await h.dataSource.query(
      `SELECT attribution_source FROM request_invitations WHERE request_id = $1`,
      [organicRequest],
    );
    expect(organic.attribution_source).toBe('ORGANIC_SEARCH');
    const attributed = await h.dataSource.query(
      `SELECT count(*)::int AS n FROM pro_funnel_events WHERE type = 'FEATURED_ATTRIBUTED_REQUEST' AND ref = $1`,
      [organicRequest],
    );
    expect(attributed[0].n).toBe(0);
  });
});
