import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { describeE2E, Harness, startApp } from './app.harness';

const API = '/api/v1';
const PASSWORD = 'una-clave-bien-larga';
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

describeE2E('Free desde el primer presupuesto: tres oportunidades sin reinicio (e2e)', () => {
  let h: Harness;
  let serviceId: string;
  let zoneId: string;

  async function register(label: string) {
    const email = `${label}-${randomUUID().slice(0, 8)}@test.dev`;
    const pending = await h.http
      .post(`${API}/auth/register`)
      .send({ firstName: label, lastName: 'Fase Uno', email, password: PASSWORD })
      .expect(202);
    const verified = await h.http
      .post(`${API}/auth/register/verify`)
      .send({ verificationSessionId: pending.body.verificationSessionId, code: h.mail.lastCodeFor(email) })
      .expect(200);
    return { token: verified.body.accessToken as string };
  }

  async function request(clientToken: string, professionalId: string, targeted = false) {
    const created = await h.http
      .post(`${API}/requests`)
      .set(auth(clientToken))
      .send({
        serviceId,
        zoneId,
        title: 'Detalle privado de la pérdida',
        description: 'La dirección y esta descripción no deben salir en una oportunidad bloqueada.',
        exactAddress: 'Dirección privada 123',
        urgency: 'FLEXIBLE',
      })
      .expect(201);
    await h.http
      .post(`${API}/requests/${created.body.id}/invitations`)
      .set(auth(clientToken))
      .send({ professionalIds: [professionalId], targeted })
      .expect(200);
    return created.body.id as string;
  }

  const quote = (token: string, requestId: string) =>
    h.http
      .post(`${API}/pro/requests/${requestId}/quote`)
      .set(auth(token))
      .send({ description: 'Reparación completa y materiales', laborAmount: 15000 });

  beforeAll(async () => {
    h = await startApp({ firstSuccessTrial: true });
    h.app.get(ConfigService).set('FREE_QUOTE_LIMIT', 3);
    const services = (await h.http.get(`${API}/services`).expect(200)).body;
    const zones = (await h.http.get(`${API}/zones?city=tandil`).expect(200)).body;
    serviceId = services.find((s: { slug: string }) => s.slug === 'plomeria').id;
    zoneId = zones.find((z: { slug: string }) => z.slug === 'villa-italia').id;
  }, 60_000);

  afterAll(async () => h?.app.close());

  it('tres respuestas antes del primer aceptado agotan Free; aceptar y editar no reinician ni suman cupo', async () => {
    const professional = await register('Profesional');
    const client = await register('Cliente');
    const profile = await h.http
      .post(`${API}/pro/profile`)
      .set(auth(professional.token))
      .send({
        headline: 'Plomero en Tandil',
        yearsExperience: 4,
        serviceIds: [serviceId],
        zoneIds: [zoneId],
      })
      .expect(201);

    expect(profile.body.plan).toMatchObject({
      tier: 'FREE',
      entitlementSource: 'FIRST_SUCCESS_TRIAL',
      trialActive: true,
      entitlements: { canSendUnlimitedQuotes: false, canBeFeatured: false },
    });
    expect(profile.body.pro).toBe(false);
    expect(profile.body.quoteUsage).toMatchObject({ used: 0, limit: 3, remaining: 3 });

    // Los cuatro pedidos ya llegaron antes de consumir el cupo (no se invita a alguien agotado).
    const requests: string[] = [];
    for (let i = 0; i < 4; i++) requests.push(await request(client.token, profile.body.id));
    const sent = [];
    for (const id of requests.slice(0, 3)) sent.push(await quote(professional.token, id).expect(201));
    const beforeSuccess = (await h.http.get(`${API}/pro/me`).set(auth(professional.token)).expect(200)).body;
    expect(beforeSuccess.firstSuccessAt).toBeNull();
    expect(beforeSuccess.quoteUsage).toMatchObject({ used: 3, limit: 3, remaining: 0 });
    expect((await quote(professional.token, requests[3]).expect(403)).body.code).toBe('FREE_QUOTE_LIMIT_REACHED');
    const freshDraft = await h.http.post(`${API}/requests`).set(auth(client.token)).send({
      serviceId, zoneId, title: 'Otro pedido', description: 'Necesito reparar una pérdida.', urgency: 'FLEXIBLE',
    }).expect(201);
    const excluded = await h.http.post(`${API}/requests/${freshDraft.body.id}/invitations`).set(auth(client.token))
      .send({ professionalIds: [profile.body.id] }).expect(422);
    expect(excluded.body.code).toBe('PROFESSIONAL_NOT_ELIGIBLE');
    const firstQuote = sent[0];
    await h.http.post(`${API}/quotes/${firstQuote.body.id}/accept`).set(auth(client.token)).expect(200);

    const afterSuccess = (await h.http.get(`${API}/pro/me`).set(auth(professional.token)).expect(200)).body;
    expect(afterSuccess.plan).toMatchObject({
      entitlementSource: 'FREE',
      lifecycle: 'POST_FIRST_SUCCESS',
      trialActive: false,
    });
    expect(afterSuccess.firstSuccessAt).toBeTruthy();
    expect(afterSuccess.showFirstSuccessCelebration).toBe(true);
    expect(afterSuccess.quoteUsage).toMatchObject({ used: 3, limit: 3, remaining: 0 });

    const acknowledged = await h.http
      .post(`${API}/pro/first-success/acknowledge`)
      .set(auth(professional.token))
      .send({})
      .expect(200);
    expect(acknowledged.body.showFirstSuccessCelebration).toBe(false);

    // Las otras propuestas siguen vigentes y editarlas no exige PRO ni suma consumo.
    await h.http.patch(`${API}/pro/quotes/${sent[1].body.id}`).set(auth(professional.token))
      .send({ description: 'Reparación con precio actualizado', laborAmount: 17000 }).expect(200);
    expect((await h.http.get(`${API}/pro/me`).set(auth(professional.token)).expect(200)).body.quoteUsage)
      .toMatchObject({ used: 3, limit: 3, remaining: 0, blockedOpportunities: 1 });
    expect((await quote(professional.token, requests[3]).expect(403)).body.code).toBe('FREE_QUOTE_LIMIT_REACHED');

    const blocked = (await h.http
      .get(`${API}/pro/requests/${requests[3]}`)
      .set(auth(professional.token))
      .expect(200)).body;
    expect(blocked.opportunity).toMatchObject({ blocked: true, targeted: false, actionable: false });
    expect(blocked.description).toBe('');
    expect(blocked.client).toBeNull();
    expect(JSON.stringify(blocked)).not.toContain('Dirección privada 123');

    const directed = await request(client.token, profile.body.id, true);
    await quote(professional.token, directed).expect(201);
    expect((await h.http.get(`${API}/pro/me`).set(auth(professional.token)).expect(200)).body.quoteUsage.used)
      .toBe(3);
    // PRO permite responder la cuarta, sin consumir Free. Al vencer conserva 3/3.
    await h.dataSource.query(`UPDATE professional_profiles SET plan_tier='PRO' WHERE id=$1`, [profile.body.id]);
    await quote(professional.token, requests[3]).expect(201);
    await h.dataSource.query(`UPDATE professional_profiles SET plan_tier='FREE' WHERE id=$1`, [profile.body.id]);
    expect((await h.http.get(`${API}/pro/me`).set(auth(professional.token)).expect(200)).body.quoteUsage)
      .toMatchObject({ used: 3, limit: 3, remaining: 0 });
  });
});
