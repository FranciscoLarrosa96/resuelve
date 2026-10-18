import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { EmailNotificationDispatcher } from '../src/notifications/email/email-notification.dispatcher';
import { PushNotificationDispatcher } from '../src/notifications/push/push-notification.dispatcher';
import { describeE2E, Harness, startApp } from './app.harness';

const API = '/api/v1';
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const proposal = { description: 'Reparación privada del sifón', laborAmount: 23500 };
const keys = {
  p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
  auth: 'tBHItJI5svbpez7KI4CCXg',
};

describeE2E('Avisos y regreso al presupuesto (e2e)', () => {
  let h: Harness;
  let serviceId: string;
  let zoneId: string;
  let email: EmailNotificationDispatcher;
  let push: PushNotificationDispatcher;

  async function user(label: string) {
    const address = `${label.toLowerCase()}-${randomUUID()}@test.dev`;
    const registered = await h.http.post(`${API}/auth/register`).send({
      firstName: label, lastName: 'Avisos', email: address, password: 'una-clave-bien-larga',
    }).expect(201);
    const token = registered.body.accessToken as string;
    const me = await h.http.get(`${API}/auth/me`).set(auth(token)).expect(200);
    return { token, id: me.body.id as string, email: address };
  }

  async function fixture() {
    const client = await user('Cliente');
    const worker = await user('Profesional');
    const p = await h.http.post(`${API}/pro/profile`).set(auth(worker.token)).send({
      headline: 'Plomería de prueba', serviceIds: [serviceId], zoneIds: [zoneId],
    }).expect(201);
    const endpoint = `https://fcm.googleapis.com/fcm/send/${randomUUID()}`;
    await h.http.post(`${API}/me/push/subscriptions`).set(auth(client.token)).send({ endpoint, keys }).expect(204);
    async function createQuote() {
      const request = await h.http.post(`${API}/requests`).set(auth(client.token)).send({
        serviceId, zoneId, title: 'Título privado', description: 'Detalle privado de la pérdida de agua.',
        exactAddress: 'Dirección privada 987', urgency: 'FLEXIBLE',
      }).expect(201);
      const requestId = request.body.id as string;
      await h.http.post(`${API}/requests/${requestId}/invitations`).set(auth(client.token))
        .send({ professionalIds: [p.body.id], targeted: true }).expect(200);
      const q = await h.http.post(`${API}/pro/requests/${requestId}/quote`).set(auth(worker.token)).send(proposal).expect(201);
      return { requestId, quoteId: q.body.id as string };
    }
    return { client, worker, endpoint, createQuote, ...await createQuote() };
  }

  const dispatch = async () => { await email.dispatch(); await push.dispatch(); };
  const mails = (address: string) => h.mail.sent.filter((m) => m.to === address);
  const pushes = (endpoint: string) => h.push.sent.filter((p) => p.endpoint === endpoint);
  const statuses = (userId: string) => h.dataSource.query(
    `SELECT type, read_at, email_status, push_status FROM notifications WHERE user_id=$1 ORDER BY created_at`, [userId],
  );

  beforeAll(async () => {
    h = await startApp({ emailVerification: false });
    email = h.app.get(EmailNotificationDispatcher);
    push = h.app.get(PushNotificationDispatcher);
    const config = h.app.get(ConfigService);
    config.set('PUSH_QUIET_START_HOUR', 0);
    config.set('PUSH_QUIET_END_HOUR', 0);
    serviceId = (await h.http.get(`${API}/services`).expect(200)).body.find((s: { slug: string }) => s.slug === 'plomeria').id;
    zoneId = (await h.http.get(`${API}/zones?city=tandil`).expect(200)).body[0].id;
  }, 60_000);
  afterAll(async () => h?.app.close());

  it('nuevo: un email y un push, con el pedido correcto y sin datos privados ni reenvío', async () => {
    const f = await fixture();
    await dispatch();
    const notices = mails(f.client.email);
    expect(notices).toHaveLength(1);
    expect(notices[0].text).toContain(`http://localhost:4200/mis-solicitudes/${f.requestId}`);
    const messages = pushes(f.endpoint);
    expect(messages).toHaveLength(1);
    expect(messages[0].payload.notification.data.onActionClick.default).toEqual({
      operation: 'navigateLastFocusedOrOpen', url: `/mis-solicitudes/${f.requestId}`,
    });
    for (const value of [notices[0].text, notices[0].html, JSON.stringify(messages[0].payload)]) {
      expect(value).not.toMatch(/Título privado|Detalle privado|Dirección privada|Reparación privada/);
    }
    await dispatch();
    expect(mails(f.client.email)).toHaveLength(1);
    expect(pushes(f.endpoint)).toHaveLength(1);
  });

  it('edición: conserva el aviso push sin agregar emails y al volver se consulta el importe actual', async () => {
    const f = await fixture();
    await dispatch();
    for (const laborAmount of [25000, 27000]) {
      await h.http.patch(`${API}/pro/quotes/${f.quoteId}`).set(auth(f.worker.token)).send({ ...proposal, laborAmount }).expect(200);
    }
    await dispatch();
    expect(mails(f.client.email)).toHaveLength(1); // editar sigue siendo solo push + in-app
    expect(pushes(f.endpoint)).toHaveLength(2);
    const last = pushes(f.endpoint)[1].payload.notification;
    expect(last.title).toBe('Presupuesto actualizado');
    expect(last.data.onActionClick.default.url).toBe(`/mis-solicitudes/${f.requestId}`);
    const detail = await h.http.get(`${API}/requests/${f.requestId}/quotes`).set(auth(f.client.token)).expect(200);
    expect(detail.body).toEqual(expect.arrayContaining([expect.objectContaining({ id: f.quoteId, totalAmount: '27000.00' })]));
    await dispatch();
    expect(pushes(f.endpoint)).toHaveLength(2);
  });

  it('al elegir se leen también las actualizaciones; un aviso histórico pendiente tampoco se entrega', async () => {
    const f = await fixture();
    await h.http.patch(`${API}/pro/quotes/${f.quoteId}`).set(auth(f.worker.token)).send(proposal).expect(200);
    await h.http.post(`${API}/quotes/${f.quoteId}/accept`).set(auth(f.client.token)).expect(200);
    const rows = await statuses(f.client.id);
    expect(rows.map((r: { type: string }) => r.type).sort()).toEqual(['CLIENT_QUOTE_RECEIVED', 'CLIENT_QUOTE_UPDATED']);
    expect(rows.every((r: { read_at: Date | null }) => r.read_at !== null)).toBe(true);
    // Simula la novedad sin leer que dejaba el código anterior, solo en esta base de prueba.
    await h.dataSource.query(`UPDATE notifications SET read_at=NULL WHERE user_id=$1`, [f.client.id]);
    await dispatch();
    expect(mails(f.client.email)).toHaveLength(0);
    expect(pushes(f.endpoint)).toHaveLength(0);
    expect((await statuses(f.client.id)).every((r: { email_status: string; push_status: string }) =>
      r.email_status === 'SKIPPED' && r.push_status === 'SKIPPED')).toBe(true);
  });

  it('vencido antes del ciclo: se omite aunque todavía esté PENDING y se conserva la historia in-app', async () => {
    const f = await fixture();
    await h.dataSource.query(`UPDATE quotes SET valid_until=now()-interval '1 minute' WHERE id=$1`, [f.quoteId]);
    await dispatch();
    expect(mails(f.client.email)).toHaveLength(0);
    expect(pushes(f.endpoint)).toHaveLength(0);
    expect(await statuses(f.client.id)).toEqual([
      expect.objectContaining({ read_at: null, email_status: 'SKIPPED', push_status: 'SKIPPED' }),
    ]);
    const [q] = await h.dataSource.query(`SELECT status FROM quotes WHERE id=$1`, [f.quoteId]);
    expect(q.status).toBe('PENDING'); // la entrega no cambia el presupuesto
  });

  it('pedido cancelado: los avisos históricos no anuncian propuestas que ya no se pueden elegir', async () => {
    const f = await fixture();
    await h.http.post(`${API}/requests/${f.requestId}/cancel`).set(auth(f.client.token)).expect(200);
    await h.dataSource.query(`UPDATE notifications SET read_at=NULL WHERE user_id=$1`, [f.client.id]);
    await dispatch();
    expect(mails(f.client.email)).toHaveLength(0);
    expect(pushes(f.endpoint)).toHaveLength(0);
    expect((await statuses(f.client.id))[0]).toMatchObject({ email_status: 'SKIPPED', push_status: 'SKIPPED' });
  });

  it('dos pedidos del cliente: un resumen abre Mis solicitudes y el email conserva ambos enlaces', async () => {
    const f = await fixture();
    const other = await f.createQuote();
    await dispatch();
    expect(pushes(f.endpoint)).toHaveLength(1);
    expect(pushes(f.endpoint)[0].payload.notification).toMatchObject({
      body: 'Tenés 2 novedades para ver.', data: { onActionClick: { default: { url: '/mis-solicitudes' } } },
    });
    const [notice] = mails(f.client.email);
    for (const id of [f.requestId, other.requestId]) {
      expect(notice.text).toContain(`/mis-solicitudes/${id}`);
      expect(notice.html).toContain(`/mis-solicitudes/${id}`);
    }
  });
});
