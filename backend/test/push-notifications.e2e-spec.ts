import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { PushNotificationDispatcher } from '../src/notifications/push/push-notification.dispatcher';
import { describeE2E, Harness, startApp } from './app.harness';

const API = '/api/v1';
const PASSWORD = 'una-clave-bien-larga';
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const endpoint = (label: string) => `https://fcm.googleapis.com/fcm/send/${label}-${randomUUID()}`;
const keys = { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' };
const arHour = (d = new Date()) =>
  Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: 'America/Argentina/Buenos_Aires' }).format(d));

/**
 * Avisos push: suscripción por dispositivo, envío sobre las mismas
 * notificaciones in-app (nunca a quien actúa), horario de silencio y limpieza
 * de dispositivos que ya no existen. El servicio de push es un doble.
 */
describeE2E('Avisos push (e2e)', () => {
  let h: Harness;
  let serviceId: string;
  let zoneId: string;
  let dispatcher: PushNotificationDispatcher;
  let config: ConfigService;

  async function user(label: string) {
    const email = `${label.toLowerCase().replace(/[^a-z]+/g, '-')}-${randomUUID().slice(0, 8)}@test.dev`;
    const res = await h.http
      .post(`${API}/auth/register`)
      .send({ firstName: label, lastName: 'Push', email, password: PASSWORD })
      .expect(201);
    const me = await h.http.get(`${API}/auth/me`).set(auth(res.body.accessToken)).expect(200);
    return { email, token: res.body.accessToken as string, userId: me.body.id as string };
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
  const subscribe = (token: string, ep: string, body: object = { endpoint: ep, keys }) =>
    h.http.post(`${API}/me/push/subscriptions`).set(auth(token)).send(body);
  const status = async (token: string, ep: string) =>
    (await h.http.post(`${API}/me/push/subscriptions/status`).set(auth(token)).send({ endpoint: ep }).expect(200)).body
      .subscribed as boolean;
  /** El cliente le pide presupuesto a ese profesional: PRO_TARGETED_REQUEST_RECEIVED para él. */
  async function targetedRequest(client: { token: string }, worker: { id: string }) {
    const req = await h.http
      .post(`${API}/requests`)
      .set(auth(client.token))
      .send({ serviceId, zoneId, title: 'Pierde agua', description: 'Pierde la canilla de la cocina.', urgency: 'FLEXIBLE' })
      .expect(201);
    await h.http
      .post(`${API}/requests/${req.body.id}/invitations`)
      .set(auth(client.token))
      .send({ professionalIds: [worker.id], targeted: true })
      .expect(200);
    return req.body.id as string;
  }
  const sentTo = (ep: string) => h.push.sent.filter((s) => s.endpoint === ep);
  const pushStatus = async (userId: string) =>
    (await h.dataSource.query(`SELECT type, push_status FROM notifications WHERE user_id = $1 ORDER BY created_at`, [userId])) as {
      type: string;
      push_status: string | null;
    }[];

  beforeAll(async () => {
    h = await startApp({ emailVerification: false });
    serviceId = (await h.http.get(`${API}/services`)).body.find((s: { slug: string }) => s.slug === 'plomeria').id;
    zoneId = (await h.http.get(`${API}/zones`)).body[0].id;
    dispatcher = h.app.get(PushNotificationDispatcher);
    config = h.app.get(ConfigService);
    // Sin silencio salvo en el test que lo prueba (el reloj del test puede caer de noche).
    config.set('PUSH_QUIET_START_HOUR', 0);
    config.set('PUSH_QUIET_END_HOUR', 0);
  }, 60_000);
  afterAll(async () => h?.app.close());

  it('config: clave pública con push prendido; apagado no se ofrece ni deja suscribirse', async () => {
    const u = await user('Config');
    const on = (await h.http.get(`${API}/me/push/config`).set(auth(u.token)).expect(200)).body;
    expect(on).toEqual({ enabled: true, publicKey: h.push.publicKey });
    config.set('PUSH_NOTIFICATIONS_ENABLED', false);
    try {
      expect((await h.http.get(`${API}/me/push/config`).set(auth(u.token)).expect(200)).body).toEqual({ enabled: false, publicKey: null });
      expect((await subscribe(u.token, endpoint('off')).expect(409)).body.code).toBe('PUSH_DISABLED');
    } finally {
      config.set('PUSH_NOTIFICATIONS_ENABLED', true);
    }
    await h.http.get(`${API}/me/push/config`).expect(401);
  });

  it('suscripción: valida el servicio de push, es por dispositivo y solo se borra la propia', async () => {
    const a = await user('Dispositivo');
    const b = await user('Otra');
    // Solo servicios de push reales por https (el backend les hace un POST).
    expect((await subscribe(a.token, 'https://evil.example.com/hook').expect(422)).body.code).toBe('VALIDATION_ERROR');
    await subscribe(a.token, 'http://fcm.googleapis.com/fcm/send/x').expect(400);
    await subscribe(a.token, 'https://169.254.169.254/latest').expect(422);
    await subscribe(a.token, endpoint('mal'), { endpoint: endpoint('mal'), keys: { p256dh: 'no base64!', auth: 'x' } }).expect(400);

    const ep = endpoint('tel');
    await subscribe(a.token, ep).expect(204);
    await subscribe(a.token, ep).expect(204); // idempotente
    expect(await status(a.token, ep)).toBe(true);
    // Otra cuenta en el mismo navegador: la suscripción pasa a esa cuenta.
    await subscribe(b.token, ep).expect(204);
    expect(await status(a.token, ep)).toBe(false);
    expect(await status(b.token, ep)).toBe(true);
    // Con el endpoint de otra cuenta, borrar no hace nada.
    await h.http.post(`${API}/me/push/subscriptions/remove`).set(auth(a.token)).send({ endpoint: ep }).expect(204);
    expect(await status(b.token, ep)).toBe(true);
    await h.http.post(`${API}/me/push/subscriptions/remove`).set(auth(b.token)).send({ endpoint: ep }).expect(204);
    expect(await status(b.token, ep)).toBe(false);
  });

  it('tope de 10 dispositivos por persona: se descartan los más viejos', async () => {
    const u = await user('Muchos');
    const eps = Array.from({ length: 12 }, (_, i) => endpoint(`d${i}`));
    for (const ep of eps) await subscribe(u.token, ep).expect(204);
    const [{ n }] = await h.dataSource.query(`SELECT count(*)::int AS n FROM push_subscriptions WHERE user_id = $1`, [u.userId]);
    expect(n).toBe(10);
    expect(await status(u.token, eps[0])).toBe(false);
    expect(await status(u.token, eps[11])).toBe(true);
  });

  it('nueva solicitud dirigida: push al profesional con su pantalla, nunca a quien actúa ni dos veces', async () => {
    const client = await user('Cliente');
    const worker = await pro('Plomero');
    const proDevice = endpoint('pro');
    const clientDevice = endpoint('cliente');
    await subscribe(worker.token, proDevice).expect(204);
    await subscribe(client.token, clientDevice).expect(204);
    const requestId = await targetedRequest(client, worker);

    const r = await dispatcher.dispatch();
    expect(r.sent).toBeGreaterThanOrEqual(1);
    const [msg] = sentTo(proDevice);
    expect(msg.payload.notification).toMatchObject({
      title: 'Te pidieron presupuesto',
      body: 'Un cliente te eligió a vos para pedirte presupuesto.',
      tag: requestId,
      data: { onActionClick: { default: { operation: 'navigateLastFocusedOrOpen', url: `/pro/solicitudes/${requestId}` } } },
    });
    // Sin datos del pedido en lo que pasa por el servicio de push.
    expect(JSON.stringify(msg.payload)).not.toMatch(/canilla|Pierde|Cliente/);
    expect(sentTo(clientDevice)).toHaveLength(0);
    expect(await pushStatus(worker.userId)).toEqual([{ type: 'PRO_TARGETED_REQUEST_RECEIVED', push_status: 'SENT' }]);

    await dispatcher.dispatch();
    expect(sentTo(proDevice)).toHaveLength(1);
  });

  it('sin dispositivos, ya leída o fuera de los tipos con push: queda solo en la app', async () => {
    const client = await user('Sin');
    const worker = await pro('Sin dispositivo');
    await targetedRequest(client, worker);
    await dispatcher.dispatch();
    expect((await pushStatus(worker.userId))[0].push_status).toBe('SKIPPED');

    const reader = await pro('Lector');
    const device = endpoint('lector');
    await subscribe(reader.token, device).expect(204);
    await targetedRequest(client, reader);
    await h.http.patch(`${API}/me/notifications/read-all`).query({ audience: 'PROFESSIONAL' }).set(auth(reader.token)).expect(200);
    await dispatcher.dispatch();
    expect(sentTo(device)).toHaveLength(0);
    expect((await pushStatus(reader.userId))[0].push_status).toBe('SKIPPED');
  });

  it('varias novedades en un ciclo: un solo aviso que resume', async () => {
    const worker = await pro('Ocupado');
    const device = endpoint('resumen');
    await subscribe(worker.token, device).expect(204);
    await targetedRequest(await user('Uno'), worker);
    await targetedRequest(await user('Dos'), worker);
    await dispatcher.dispatch();
    const msgs = sentTo(device);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].payload.notification).toMatchObject({ title: 'Resuelve', body: 'Tenés 2 novedades para ver.', tag: 'resuelve-novedades' });
    expect(msgs[0].payload.notification.data.onActionClick.default.url).toMatch(/^\/pro\/solicitudes\//);
  });

  it('horario de silencio: no se manda nada y sale todo junto al terminar', async () => {
    const worker = await pro('Noche');
    const device = endpoint('noche');
    await subscribe(worker.token, device).expect(204);
    await targetedRequest(await user('Nocturno'), worker);
    const hour = arHour();
    try {
      config.set('PUSH_QUIET_START_HOUR', hour);
      config.set('PUSH_QUIET_END_HOUR', (hour + 1) % 24);
      expect((await dispatcher.dispatch()).quiet).toBe(true);
      expect(sentTo(device)).toHaveLength(0);
      expect((await pushStatus(worker.userId))[0].push_status).toBeNull();
      config.set('PUSH_QUIET_START_HOUR', (hour + 2) % 24);
      config.set('PUSH_QUIET_END_HOUR', (hour + 3) % 24);
      await dispatcher.dispatch();
      expect(sentTo(device)).toHaveLength(1);
    } finally {
      config.set('PUSH_QUIET_START_HOUR', 0);
      config.set('PUSH_QUIET_END_HOUR', 0);
    }
  });

  it('dispositivo que ya no existe (410) se borra; un error se reintenta y después queda solo en la app', async () => {
    const worker = await pro('Celular viejo');
    const gone = endpoint('gone');
    const ok = endpoint('ok');
    await subscribe(worker.token, gone).expect(204);
    await subscribe(worker.token, ok).expect(204);
    h.push.fail.set(gone, 'gone');
    await targetedRequest(await user('Uno'), worker);
    await dispatcher.dispatch();
    expect(sentTo(ok)).toHaveLength(1);
    expect(await status(worker.token, gone)).toBe(false);

    const flaky = await pro('Sin señal');
    const bad = endpoint('error');
    await subscribe(flaky.token, bad).expect(204);
    h.push.fail.set(bad, 'error');
    await targetedRequest(await user('Dos'), flaky);
    await dispatcher.dispatch();
    expect((await pushStatus(flaky.userId))[0].push_status).toBeNull(); // se reintenta
    await dispatcher.dispatch();
    await dispatcher.dispatch();
    expect((await pushStatus(flaky.userId))[0].push_status).toBe('FAILED');
    expect(await status(flaky.token, bad)).toBe(true); // 3 errores no alcanzan para descartarlo
  });

  it('la baja de cuenta borra sus dispositivos', async () => {
    const u = await user('Baja');
    const device = endpoint('baja');
    await subscribe(u.token, device).expect(204);
    await h.http.post(`${API}/account/delete`).set(auth(u.token)).send({ password: PASSWORD }).expect(200);
    const rows = await h.dataSource.query(`SELECT 1 FROM push_subscriptions WHERE endpoint = $1`, [device]);
    expect(rows).toHaveLength(0);
  });
});
