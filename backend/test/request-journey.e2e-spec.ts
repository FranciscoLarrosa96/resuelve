import { randomUUID } from 'crypto';
import { describeE2E, Harness, startApp } from './app.harness';
import { formatReport, requestJourneyReport } from '../src/analytics/journey/request-journey-report';

const API = '/api/v1';
const PASSWORD = 'una-clave-bien-larga';
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const HOUR = 3600 * 1000;

/**
 * Medición del recorrido del pedido: ingesta anónima del navegador, envío confirmado registrado por
 * el backend en la transacción real de las invitaciones, y reporte de solo lectura.
 */
describeE2E('Recorrido del pedido (e2e)', () => {
  let h: Harness;
  let serviceId: string;
  let zoneId: string;

  async function user(label: string) {
    const email = `${label.toLowerCase()}-${randomUUID().slice(0, 8)}@test.dev`;
    const res = await h.http.post(`${API}/auth/register`).send({ firstName: label, lastName: 'Recorrido', email, password: PASSWORD }).expect(201);
    return { token: res.body.accessToken as string };
  }
  async function pro(label: string) {
    const u = await user(label);
    const res = await h.http
      .post(`${API}/pro/profile`)
      .set(auth(u.token))
      .send({ headline: `${label} en Tandil`, yearsExperience: 4, serviceIds: [serviceId], zoneIds: [zoneId] })
      .expect(201);
    return { ...u, id: res.body.id as string };
  }
  const draft = (token: string) =>
    h.http
      .post(`${API}/requests`)
      .set(auth(token))
      .send({ serviceId, zoneId, title: 'Pierde agua', description: 'Pierde la canilla de la cocina.' })
      .expect(201)
      .then((r) => r.body.id as string);
  const events = (attemptId: string, journey: string, evts: unknown[]) =>
    h.http.post(`${API}/analytics/request-journey`).send({ attemptId, journey, events: evts });
  const rowsOf = (attemptId: string) =>
    h.dataSource.query<{ type: string; step: number | null; journey: string | null; request_id: string | null }[]>(
      `SELECT type, step, journey, request_id FROM request_journey_events WHERE attempt_id = $1 ORDER BY id`,
      [attemptId],
    );

  beforeAll(async () => {
    h = await startApp({ emailVerification: false, firstSuccessTrial: true });
    const services = (await h.http.get(`${API}/services`)).body as { slug: string; id: string }[];
    serviceId = services.find((s) => s.slug === 'plomeria')!.id;
    zoneId = (await h.http.get(`${API}/zones?city=tandil`)).body[0].id;
  }, 120_000);
  afterAll(async () => h?.app.close());

  it('ingesta pública: acepta pasos, no suma duplicados y no guarda contenido del pedido', async () => {
    const attempt = randomUUID();
    const batch = [
      { type: 'STARTED', entry: 'MARKETPLACE_DISCOVERY' },
      { type: 'STEP_VIEWED', step: 0 },
      { type: 'STEP_VIEWED', step: 1 },
      { type: 'STEP_VIEWED', step: 1 },
    ];
    const first = await events(attempt, 'REQUEST', batch).expect(200);
    expect(first.body).toEqual({ accepted: 3 });
    // Recarga / vuelta atrás: los mismos pasos no suman.
    expect((await events(attempt, 'REQUEST', batch).expect(200)).body).toEqual({ accepted: 0 });
    expect((await events(attempt, 'REQUEST', [{ type: 'STEP_VIEWED', step: 2 }]).expect(200)).body).toEqual({ accepted: 1 });
    expect((await rowsOf(attempt)).map((r) => `${r.type}${r.step ?? ''}`)).toEqual(['STARTED', 'STEP_VIEWED0', 'STEP_VIEWED1', 'STEP_VIEWED2']);
    const cols = await h.dataSource.query<{ column_name: string }[]>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'request_journey_events'`,
    );
    expect(cols.map((c) => c.column_name).sort()).toEqual(
      ['attempt_id', 'dedupe_key', 'entry', 'id', 'journey', 'occurred_at', 'request_id', 'step', 'type'],
    );
  });

  it('rechaza lo que no corresponde: SENT del navegador, pasos inválidos y campos de contenido', async () => {
    const attempt = randomUUID();
    await events(attempt, 'REQUEST', [{ type: 'SENT' }]).expect(400);
    await events(attempt, 'REQUEST', [{ type: 'STEP_VIEWED', step: 9 }]).expect(400);
    await events(attempt, 'NOPE', [{ type: 'STARTED' }]).expect(400);
    await events('no-es-uuid', 'REQUEST', [{ type: 'STARTED' }]).expect(400);
    await events(attempt, 'REQUEST', [{ type: 'STARTED', description: 'Mi dirección es Calle 123' }]).expect(400);
    await events(attempt, 'REQUEST', []).expect(400);
    await h.http.post(`${API}/analytics/request-journey`).send({ attemptId: attempt, journey: 'REQUEST', events: [{ type: 'STARTED' }], phone: '2494123456' }).expect(400);
    expect(await rowsOf(attempt)).toEqual([]);
    // STEP_VIEWED sin paso se descarta.
    expect((await events(attempt, 'REQUEST', [{ type: 'STEP_VIEWED' }]).expect(200)).body).toEqual({ accepted: 0 });
  });

  it('el envío confirmado lo registra el backend una sola vez; el borrador no cuenta', async () => {
    const client = await user('Cliente');
    const p = await pro('Pro');
    const attempt = randomUUID();
    await events(attempt, 'DIRECT', [{ type: 'STARTED', entry: 'DIRECT_PUBLIC_PROFILE' }, { type: 'QUOTE_VIEWED' }]).expect(200);

    const requestId = await draft(client.token);
    expect((await rowsOf(attempt)).some((r) => r.type === 'SENT')).toBe(false); // crear el borrador no es enviar

    const send = () =>
      h.http.post(`${API}/requests/${requestId}/invitations`).set(auth(client.token)).send({ professionalIds: [p.id], journeyAttemptId: attempt });
    await send().expect(200);
    const sent = (await rowsOf(attempt)).filter((r) => r.type === 'SENT');
    expect(sent).toHaveLength(1);
    expect(sent[0].request_id).toBe(requestId);

    // Reintento / recarga del mismo envío: sigue siendo uno.
    await send().expect(200);
    expect((await rowsOf(attempt)).filter((r) => r.type === 'SENT')).toHaveLength(1);
  });

  it('no cuenta si el envío falla, si no trae intento, ni al sumar profesionales después', async () => {
    const client = await user('Cliente');
    const p1 = await pro('Uno');
    const p2 = await pro('Dos');
    const stranger = await user('Otro'); // sin perfil profesional: no es elegible

    // Falla: un id que no es profesional → la transacción se revierte, sin SENT.
    const failing = randomUUID();
    const r1 = await draft(client.token);
    const bad = await h.http.post(`${API}/requests/${r1}/invitations`).set(auth(client.token)).send({ professionalIds: [randomUUID()], journeyAttemptId: failing });
    expect(bad.status).toBeGreaterThanOrEqual(400);
    expect(await rowsOf(failing)).toEqual([]);
    void stranger;

    // Sin intento (cliente viejo o sin medición): se envía igual, sin evento.
    await h.http.post(`${API}/requests/${r1}/invitations`).set(auth(client.token)).send({ professionalIds: [p1.id] }).expect(200);
    expect(await h.dataSource.query(`SELECT 1 FROM request_journey_events WHERE request_id = $1`, [r1])).toEqual([]);

    // Sumar un profesional a un pedido ya enviado no es otro envío, aunque traiga un intento.
    const late = randomUUID();
    await h.http.post(`${API}/requests/${r1}/invitations`).set(auth(client.token)).send({ professionalIds: [p2.id], journeyAttemptId: late }).expect(200);
    expect(await rowsOf(late)).toEqual([]);
  });

  it('reporte: separa recorridos, aparta los intentos recientes y no mezcla envíos sin eventos', async () => {
    const now = new Date();
    const old = new Date(now.getTime() - 30 * HOUR);
    const recent = new Date(now.getTime() - 1 * HOUR);
    const insert = async (attempt: string, journey: string | null, type: string, at: Date, step: number | null = null, entry: string | null = null) =>
      h.dataSource.query(
        `INSERT INTO request_journey_events (attempt_id, type, journey, step, entry, dedupe_key, occurred_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [attempt, type, journey, step, entry, `${attempt}:${type}${step ?? ''}`, at],
      );
    await h.dataSource.query(`DELETE FROM request_journey_events`);

    // REQUEST: A llega a la revisión y no envía; B envía tras pasar por ingreso; C es reciente.
    const [a, b, c, d, e, orphan] = Array.from({ length: 6 }, () => randomUUID());
    await insert(a, 'REQUEST', 'STARTED', old, null, 'MARKETPLACE_DISCOVERY');
    for (const s of [0, 1, 2]) await insert(a, 'REQUEST', 'STEP_VIEWED', old, s);
    await insert(b, 'REQUEST', 'STARTED', old, null, 'MARKETPLACE_DISCOVERY');
    for (const s of [0, 1, 2, 3, 4]) await insert(b, 'REQUEST', 'STEP_VIEWED', old, s);
    await insert(b, 'REQUEST', 'QUOTE_VIEWED', old);
    await insert(b, 'REQUEST', 'AUTH_REQUIRED', old);
    await insert(b, 'REQUEST', 'AUTH_RETURNED', old);
    await insert(b, null, 'SENT', old);
    await insert(c, 'REQUEST', 'STARTED', recent, null, 'MARKETPLACE_DISCOVERY');
    await insert(c, 'REQUEST', 'STEP_VIEWED', recent, 0);
    // DIRECT: D pide ingresar y no vuelve; E llega a la pantalla de envío y envía.
    await insert(d, 'DIRECT', 'STARTED', old, null, 'DIRECT_PUBLIC_PROFILE');
    await insert(d, 'DIRECT', 'AUTH_REQUIRED', old);
    await insert(e, 'DIRECT', 'STARTED', old, null, 'DIRECT_PUBLIC_PROFILE');
    await insert(e, 'DIRECT', 'QUOTE_VIEWED', old);
    await insert(e, null, 'SENT', old);
    // Envío confirmado sin ningún evento del navegador.
    await insert(orphan, null, 'SENT', old);

    const report = await requestJourneyReport(h.dataSource.manager, { from: new Date(now.getTime() - 3 * 24 * HOUR), to: new Date(now.getTime() + HOUR), now });
    const req = report.journeys.find((j) => j.journey === 'REQUEST')!;
    const dir = report.journeys.find((j) => j.journey === 'DIRECT')!;
    expect(report.journeys.find((j) => j.journey === 'COMPARE')!.attempts).toBe(0);

    expect(req.attempts).toBe(2); // C es reciente: fuera de los porcentajes
    expect(req.recent).toEqual({ attempts: 1, sent: 0 });
    const reached = Object.fromEntries(req.stages.map((s) => [s.key, s.reached]));
    expect(reached).toMatchObject({ started: 2, step0: 2, step1: 2, step2: 2, step3: 1, step4: 1, quote: 1, sent: 1 });
    expect(req.stages.find((s) => s.key === 'step3')).toMatchObject({ ofPrevious: 50, ofStarted: 50 });
    expect(req.auth).toMatchObject({ required: 1, returned: 1, sentAfterReturn: 1, returnedOfRequired: 100, sentOfReturned: 100 });
    expect(req.outcome).toEqual({ sent: 1, noSendAfterWindow: 1, stillActive: 0 });
    expect(req.editedRequest).toBeNull();
    expect(req.entries).toEqual([{ entry: 'MARKETPLACE_DISCOVERY', attempts: 2 }]);

    // El recorrido DIRECT no mezcla los pasos de /solicitud.
    expect(dir.stages.map((s) => s.key)).toEqual(['started', 'quote', 'sent']);
    expect(dir.attempts).toBe(2);
    expect(dir.auth).toMatchObject({ required: 1, returned: 0, returnedOfRequired: 0, sentOfReturned: null });
    expect(dir.stages.map((s) => s.reached)).toEqual([2, 1, 1]);

    expect(report.totalSent).toBe(3);
    expect(report.sentWithoutBrowserEvents).toBe(1);
    const text = formatReport(report);
    expect(text).toContain('NO es un abandono confirmado');
    expect(text).not.toMatch(/abandonaron/i);
    await h.dataSource.query(`DELETE FROM request_journey_events`);
  });
});
