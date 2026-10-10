import { randomUUID } from 'crypto';
import { describeE2E, Harness, startApp } from './app.harness';

const API = '/api/v1';
const PASSWORD = 'una-clave-bien-larga';
const PHONE = '+54 249 555 8888';
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/**
 * Fase 8 (hardening): ownership/IDOR de trabajos, privacidad de notas, perfil público sin datos
 * privados, sitemap indexable, contrato de errores, healthchecks y request id.
 */
describeE2E('Fase 8: hardening (e2e)', () => {
  let h: Harness;
  let serviceId: string;
  let zoneId: string;

  async function user(label: string) {
    const email = `${label.toLowerCase()}-${randomUUID().slice(0, 8)}@test.dev`;
    const res = await h.http
      .post(`${API}/auth/register`)
      .send({ firstName: label, lastName: 'Hardening', email, password: PASSWORD, phone: PHONE })
      .expect(201);
    return { token: res.body.accessToken as string, email };
  }

  async function pro(label: string) {
    const u = await user(label);
    const res = await h.http
      .post(`${API}/pro/profile`)
      .set(auth(u.token))
      .send({ headline: `${label} en Tandil`, yearsExperience: 4, serviceIds: [serviceId], zoneIds: [zoneId] })
      .expect(201);
    await h.dataSource.query(`UPDATE professional_profiles SET first_success_at = now() WHERE id = $1`, [res.body.id]);
    return { ...u, id: res.body.id as string, slug: res.body.slug as string };
  }

  /** Trabajo por coordinar entre un cliente y un profesional, con notas privadas del profesional. */
  async function jobWithNotes() {
    const client = await user('Cliente');
    const worker = await pro('Dueno');
    const request = await h.http
      .post(`${API}/requests`)
      .set(auth(client.token))
      .send({
        serviceId,
        zoneId,
        title: 'Pérdida en la cocina',
        description: 'Pierde agua debajo de la mesada.',
        exactAddress: 'Calle Privada 742',
        urgency: 'FLEXIBLE',
      })
      .expect(201);
    await h.http
      .post(`${API}/requests/${request.body.id}/invitations`)
      .set(auth(client.token))
      .send({ professionalIds: [worker.id], targeted: true })
      .expect(200);
    const quote = await h.http
      .post(`${API}/pro/requests/${request.body.id}/quote`)
      .set(auth(worker.token))
      .send({ description: 'Cambio de sifón', laborAmount: 30000 })
      .expect(201);
    await h.http.post(`${API}/quotes/${quote.body.id}/accept`).set(auth(client.token)).expect(200);
    const jobs = (await h.http.get(`${API}/pro/jobs`).set(auth(worker.token)).expect(200)).body.items as {
      id: string;
      requestId: string;
    }[];
    const jobId = jobs.find((j) => j.requestId === request.body.id)!.id;
    await h.http
      .patch(`${API}/pro/jobs/${jobId}/notes`)
      .set(auth(worker.token))
      .send({ privateNotes: 'NOTA-PRIVADA-DEL-PROFESIONAL' })
      .expect(200);
    return { client, worker, jobId, requestId: request.body.id as string };
  }

  beforeAll(async () => {
    h = await startApp({ emailVerification: false, firstSuccessTrial: false });
    serviceId = (await h.http.get(`${API}/services`)).body.find((s: { slug: string }) => s.slug === 'plomeria').id;
    zoneId = (await h.http.get(`${API}/zones?city=tandil`)).body[0].id;
  }, 60_000);
  afterAll(async () => h?.app.close());

  describe('ownership de trabajos (IDOR)', () => {
    it('otro profesional recibe 404 en cada acción sobre un trabajo ajeno; un cliente, 403', async () => {
      const { jobId } = await jobWithNotes();
      const intruder = await pro('Intruso');
      const client = await user('Curioso');
      const target = `${API}/pro/jobs/${jobId}`;
      const as = (token: string) => ({
        read: () => h.http.get(target).set(auth(token)),
        notes: () => h.http.patch(`${target}/notes`).set(auth(token)).send({ privateNotes: 'pisada' }),
        checklist: () => h.http.patch(`${target}/checklist`).set(auth(token)).send({ items: [] }),
        schedule: () =>
          h.http.post(`${target}/schedule`).set(auth(token)).send({ scheduledDate: '2030-01-01', scheduledTime: '09:00', durationMinutes: 60 }),
        start: () => h.http.post(`${target}/start`).set(auth(token)),
        complete: () => h.http.post(`${target}/complete`).set(auth(token)),
        cancel: () => h.http.post(`${target}/cancel`).set(auth(token)),
      });
      for (const call of Object.values(as(intruder.token))) expect((await call()).status).toBe(404);
      for (const call of Object.values(as(client.token))) expect((await call()).status).toBe(403);
      // Sin sesión: 401.
      await h.http.get(target).expect(401);
    });

    it('las notas privadas no se pisan ni se filtran al cliente ni a otros', async () => {
      const { jobId, client, requestId, worker } = await jobWithNotes();
      const own = (await h.http.get(`${API}/pro/jobs/${jobId}`).set(auth(worker.token)).expect(200)).body;
      expect(JSON.stringify(own)).toContain('NOTA-PRIVADA-DEL-PROFESIONAL');
      const clientView = await h.http.get(`${API}/requests/${requestId}`).set(auth(client.token)).expect(200);
      const clientQuotes = await h.http.get(`${API}/requests/${requestId}/quotes`).set(auth(client.token)).expect(200);
      for (const body of [clientView.body, clientQuotes.body]) {
        expect(JSON.stringify(body)).not.toContain('NOTA-PRIVADA-DEL-PROFESIONAL');
      }
    });

    it('un cliente ajeno no lee la solicitud, sus presupuestos ni la cancela (404)', async () => {
      const { requestId } = await jobWithNotes();
      const other = await user('Ajeno');
      await h.http.get(`${API}/requests/${requestId}`).set(auth(other.token)).expect(404);
      await h.http.get(`${API}/requests/${requestId}/quotes`).set(auth(other.token)).expect(404);
      await h.http.post(`${API}/requests/${requestId}/cancel`).set(auth(other.token)).expect(404);
    });
  });

  describe('perfil público', () => {
    it('no expone contacto, referidos, plan interno ni facturación (por slug ni por id)', async () => {
      const p = await pro('Publico');
      await h.dataSource.query(`UPDATE professional_profiles SET bonus_pro_until = now() + interval '5 days' WHERE id = $1`, [p.id]);
      const bySlug = (await h.http.get(`${API}/professionals/public/${p.slug}`).expect(200)).body;
      const byId = (await h.http.get(`${API}/professionals/${p.id}`).expect(200)).body;
      for (const body of [bySlug, byId]) {
        const text = JSON.stringify(body);
        expect(text).not.toContain(p.email);
        expect(text).not.toContain(PHONE);
        expect(text).not.toContain('555 8888');
        for (const key of [
          'email',
          'referralCode',
          'bonusProUntil',
          'billingProUntil',
          'planExpiresAt',
          'accessUntil',
          'passwordHash',
          'latitude',
          'longitude',
          'exactAddress',
        ]) {
          expect(Object.keys(body)).not.toContain(key);
          expect(text).not.toContain(`"${key}"`);
        }
        // `phone` aparece solo como bandera de verificación (booleano), nunca como número.
        expect(Object.keys(body)).not.toContain('phone');
      }
    });
  });

  describe('sitemap indexable', () => {
    it('lista solo activos con servicio publicable y cobertura; nada privado', async () => {
      const active = await pro('Indexable');
      const paused = await pro('Pausado');
      await h.http.patch(`${API}/pro/status`).set(auth(paused.token)).send({ status: 'PAUSED' }).expect(200);
      const noCoverage = await pro('SinZona');
      await h.dataSource.query(`DELETE FROM professional_service_areas WHERE professional_id = $1`, [noCoverage.id]);
      await h.dataSource.query(`UPDATE professional_profiles SET covers_entire_city = false WHERE id = $1`, [noCoverage.id]);

      const res = await h.http.get(`${API}/professionals/sitemap`).expect(200);
      const items = res.body as { slug: string; updatedAt: string }[];
      const slugs = items.map((i) => i.slug);
      expect(slugs).toContain(active.slug);
      expect(slugs).not.toContain(paused.slug);
      expect(slugs).not.toContain(noCoverage.slug);
      for (const item of items) {
        expect(Object.keys(item).sort()).toEqual(['slug', 'updatedAt']);
        expect(Number.isNaN(Date.parse(item.updatedAt))).toBe(false);
      }
    });
  });

  describe('errores, healthchecks y request id', () => {
    it('errores con formato estable: código, mensaje, requestId; sin SQL ni stack', async () => {
      const notFound = await h.http.get(`${API}/professionals/${randomUUID()}`).expect(404);
      expect(notFound.body).toMatchObject({ statusCode: 404, code: 'NOT_FOUND', path: expect.any(String) });
      const badId = await h.http.get(`${API}/professionals/no-es-uuid`).expect(400);
      expect(typeof badId.body.code).toBe('string');
      const unauth = await h.http.get(`${API}/pro/me`).expect(401);
      expect(unauth.body.code).toBe('UNAUTHORIZED');
      for (const res of [notFound, badId, unauth]) {
        const text = JSON.stringify(res.body);
        expect(text).not.toMatch(/QueryFailedError|SELECT |INSERT |at .*\.ts|node_modules/);
        expect(res.body.requestId).toBe(res.headers['x-request-id']);
      }
    });

    it('respeta un X-Request-Id seguro del cliente y descarta uno inseguro', async () => {
      const mine = 'soporte-abc-12345';
      const ok = await h.http.get(`${API}/professionals/${randomUUID()}`).set('X-Request-Id', mine).expect(404);
      expect(ok.headers['x-request-id']).toBe(mine);
      expect(ok.body.requestId).toBe(mine);
      const bad = await h.http.get(`${API}/professionals/${randomUUID()}`).set('X-Request-Id', 'x y<script>').expect(404);
      expect(bad.headers['x-request-id']).not.toContain('<');
      expect(bad.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('liveness no toca la base; readiness la verifica', async () => {
      const live = await h.http.get(`${API}/health/live`).expect(200);
      expect(live.body.status).toBe('ok');
      expect(live.body).not.toHaveProperty('database');
      const ready = await h.http.get(`${API}/health`).expect(200);
      expect(ready.body).toMatchObject({ status: 'ok', database: 'up' });
    });

    it('cabeceras de seguridad de la API y CORS sin comodín', async () => {
      const res = await h.http.get(`${API}/health/live`).set('Origin', 'http://localhost:4200').expect(200);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-powered-by']).toBeUndefined();
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:4200');
      const foreign = await h.http.get(`${API}/health/live`).set('Origin', 'https://malo.example').expect(200);
      expect(foreign.headers['access-control-allow-origin']).toBeUndefined();
    });
  });
});
