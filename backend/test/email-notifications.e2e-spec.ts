import { randomUUID } from 'crypto';
import { EmailNotificationDispatcher } from '../src/notifications/email/email-notification.dispatcher';
import { createUnsubscribeToken } from '../src/notifications/email/unsubscribe-token';
import { describeE2E, Harness, startApp } from './app.harness';

const API = '/api/v1';
const PASSWORD = 'una-clave-bien-larga';

/**
 * Avisos por email: salen de las notificaciones in-app, un mensaje por
 * persona, sin datos del pedido, sin repetir, y con baja.
 */
describeE2E('Avisos por email (e2e)', () => {
  let h: Harness;
  let dispatcher: EmailNotificationDispatcher;
  const svc: Record<string, string> = {};
  const zone: Record<string, string> = {};
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function register(label: string) {
    const email = `${label}-${randomUUID().slice(0, 8)}@test.dev`;
    const res = await h.http
      .post(`${API}/auth/register`)
      .send({ firstName: label, lastName: 'Mail', email, password: PASSWORD, phone: '+54 249 555 7777' })
      .expect(202);
    const verify = await h.http
      .post(`${API}/auth/register/verify`)
      .send({ verificationSessionId: res.body.verificationSessionId, code: h.mail.lastCodeFor(email) })
      .expect(200);
    const me = await h.http.get(`${API}/auth/me`).set(auth(verify.body.accessToken)).expect(200);
    return { email, token: verify.body.accessToken as string, userId: me.body.id as string };
  }

  async function pro(label: string) {
    const user = await register(label);
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

  async function createRequest(token: string, title = 'Problema de plomería') {
    const res = await h.http
      .post(`${API}/requests`)
      .set(auth(token))
      .send({
        serviceId: svc.plomeria,
        zoneId: zone['villa-italia'],
        title,
        description: 'Pierde agua la canilla de la cocina.',
        exactAddress: 'Calle Privada 742',
        urgency: 'FLEXIBLE',
      })
      .expect(201);
    return res.body.id as string;
  }

  const invite = (token: string, requestId: string, proIds: string[]) =>
    h.http
      .post(`${API}/requests/${requestId}/invitations`)
      .set(auth(token))
      .send({ professionalIds: proIds })
      .expect(200);

  const status = async (userId: string) =>
    (await h.dataSource.query(
      `SELECT type, email_status AS s, email_attempts AS a FROM notifications WHERE user_id = $1 ORDER BY created_at`,
      [userId],
    )) as { type: string; s: string | null; a: number }[];

  /** Avisos de actividad a esa casilla (sin el código de verificación del registro). */
  const mailsTo = (email: string) =>
    h.mail.sent.filter((m) => m.to === email && !m.subject.startsWith('Tu código de verificación'));

  beforeAll(async () => {
    h = await startApp();
    dispatcher = h.app.get(EmailNotificationDispatcher);
    for (const s of (await h.http.get(`${API}/services`).expect(200)).body) svc[s.slug] = s.id;
    for (const z of (await h.http.get(`${API}/zones`).expect(200)).body) zone[z.slug] = z.id;
  }, 60_000);

  afterAll(async () => {
    await h?.app.close();
  });

  it('manda un aviso al profesional invitado, sin datos del pedido, y no lo repite', async () => {
    const client = await register('cliente');
    const p = await pro('prof');
    const requestId = await createRequest(client.token);
    await invite(client.token, requestId, [p.proId]);
    await dispatcher.dispatch();

    const mails = mailsTo(p.email);
    expect(mails).toHaveLength(1);
    expect(mails[0].subject).toBe('Tenés una nueva solicitud para presupuestar');
    expect(mails[0].text).toContain(`/pro/solicitudes/${requestId}`);
    expect(mails[0].text).toContain('/avisos/baja?t=');
    for (const secret of ['Calle Privada', 'canilla', '555 7777', 'Problema de plomería']) {
      expect(mails[0].text).not.toContain(secret);
    }
    expect(mailsTo(client.email)).toHaveLength(0);
    expect((await status(p.userId)).map((n) => n.s)).toEqual(['SENT']);

    await dispatcher.dispatch();
    expect(mailsTo(p.email)).toHaveLength(1);
  });

  it('varias novedades de la misma persona salen en un solo mensaje', async () => {
    const client = await register('cli-resumen');
    const p = await pro('prof-resumen');
    const before = mailsTo(p.email).length;
    await invite(client.token, await createRequest(client.token, 'Uno'), [p.proId]);
    await invite(client.token, await createRequest(client.token, 'Dos'), [p.proId]);
    await dispatcher.dispatch();
    const mails = mailsTo(p.email).slice(before);
    expect(mails).toHaveLength(1);
    expect(mails[0].subject).toBe('Tenés 2 novedades en Resuelve');
  });

  it('el cliente recibe el aviso del presupuesto, y el profesional (que actúa) no', async () => {
    const client = await register('cli-quote');
    const p = await pro('prof-quote');
    const requestId = await createRequest(client.token);
    await invite(client.token, requestId, [p.proId]);
    await dispatcher.dispatch();
    await h.http
      .post(`${API}/pro/requests/${requestId}/quote`)
      .set(auth(p.token))
      .send({ description: 'Cambio de sellador y canilla', laborAmount: 30000 })
      .expect(201);
    const proMails = mailsTo(p.email).length;
    await dispatcher.dispatch();
    expect(mailsTo(p.email)).toHaveLength(proMails);
    const mails = mailsTo(client.email).filter((m) => m.subject === 'Recibiste un presupuesto nuevo');
    expect(mails).toHaveLength(1);
    expect(mails[0].text).toContain(`http://localhost:4200/mis-solicitudes/${requestId}`);
    expect(mails[0].html).toContain(`href="http://localhost:4200/mis-solicitudes/${requestId}"`);
  });

  it('lo que ya se leyó en la app no se manda por email', async () => {
    const client = await register('cli-leido');
    const p = await pro('prof-leido');
    await invite(client.token, await createRequest(client.token), [p.proId]);
    await h.http.patch(`${API}/me/notifications/read-all`).query({ audience: 'PROFESSIONAL' }).set(auth(p.token)).expect(200);
    await dispatcher.dispatch();
    expect(mailsTo(p.email)).toHaveLength(0);
    expect((await status(p.userId)).map((n) => n.s)).toEqual(['SKIPPED']);
  });

  it('un aviso viejo no se manda tarde', async () => {
    const client = await register('cli-viejo');
    const p = await pro('prof-viejo');
    await invite(client.token, await createRequest(client.token), [p.proId]);
    await h.dataSource.query(`UPDATE notifications SET created_at = now() - interval '2 days' WHERE user_id = $1`, [
      p.userId,
    ]);
    await dispatcher.dispatch();
    expect(mailsTo(p.email)).toHaveLength(0);
    expect((await status(p.userId)).map((n) => n.s)).toEqual(['SKIPPED']);
  });

  it('un aviso demorado (oportunidad Free) espera a su hora', async () => {
    const client = await register('cli-demora');
    const p = await pro('prof-demora');
    await invite(client.token, await createRequest(client.token), [p.proId]);
    await h.dataSource.query(
      `UPDATE notifications SET available_at = now() + interval '1 hour' WHERE user_id = $1`,
      [p.userId],
    );
    await dispatcher.dispatch();
    expect(mailsTo(p.email)).toHaveLength(0);
    expect((await status(p.userId)).map((n) => n.s)).toEqual([null]);
    await h.dataSource.query(`UPDATE notifications SET available_at = now() - interval '1 minute' WHERE user_id = $1`, [
      p.userId,
    ]);
    await dispatcher.dispatch();
    expect(mailsTo(p.email)).toHaveLength(1);
  });

  it('quien apagó los avisos en su perfil no recibe nada, y los avisos siguen en la app', async () => {
    const client = await register('cli-off');
    const p = await pro('prof-off');
    await h.http
      .patch(`${API}/me/notifications/email-preference`)
      .set(auth(p.token))
      .send({ enabled: false })
      .expect(200);
    expect((await h.http.get(`${API}/auth/me`).set(auth(p.token)).expect(200)).body.emailNotifications).toBe(false);
    await h.http.patch(`${API}/me/notifications/email-preference`).set(auth(p.token)).send({ enabled: 'si' }).expect(400);
    await invite(client.token, await createRequest(client.token), [p.proId]);
    await dispatcher.dispatch();
    expect(mailsTo(p.email)).toHaveLength(0);
    const summary = await h.http.get(`${API}/me/notifications/summary`).set(auth(p.token)).expect(200);
    expect(summary.body.professional.unread).toBe(1);
  });

  describe('baja desde el enlace del email', () => {
    const secret = () => process.env.JWT_ACCESS_SECRET as string;

    it('el token firmado apaga los avisos (sin sesión) y es idempotente', async () => {
      const p = await pro('prof-baja');
      const token = createUnsubscribeToken(secret(), p.userId);
      await h.http.post(`${API}/notifications/email-unsubscribe`).send({ token }).expect(204);
      await h.http.post(`${API}/notifications/email-unsubscribe`).send({ token }).expect(204);
      expect((await h.http.get(`${API}/auth/me`).set(auth(p.token)).expect(200)).body.emailNotifications).toBe(false);
    });

    it('un token alterado, de otra cuenta o sin firma no sirve', async () => {
      const p = await pro('prof-token');
      const good = createUnsubscribeToken(secret(), p.userId);
      for (const token of [
        `${good}x`,
        `${p.userId}.firmafalsa${'a'.repeat(40)}`,
        createUnsubscribeToken('otro-secreto-distinto-de-treinta-y-dos-caracteres', p.userId),
        `${randomUUID()}.${good.split('.')[1]}`,
        'a'.repeat(50),
      ]) {
        const res = await h.http.post(`${API}/notifications/email-unsubscribe`).send({ token }).expect(400);
        expect(res.body.code ?? res.body.error?.code).toBe('INVALID_UNSUBSCRIBE_TOKEN');
      }
      expect((await h.http.get(`${API}/auth/me`).set(auth(p.token)).expect(200)).body.emailNotifications).toBe(true);
    });
  });

  it('si el envío falla se reintenta en el próximo ciclo y, tras 3 intentos, queda FAILED', async () => {
    const client = await register('cli-falla');
    const p = await pro('prof-falla');
    await invite(client.token, await createRequest(client.token), [p.proId]);
    const original = h.mail.send.bind(h.mail);
    h.mail.send = async () => {
      throw new Error('SMTP caído');
    };
    try {
      await dispatcher.dispatch();
      expect(await status(p.userId)).toEqual([{ type: 'PRO_REQUEST_RECEIVED', s: null, a: 1 }]);
      await dispatcher.dispatch();
      await dispatcher.dispatch();
      expect(await status(p.userId)).toEqual([{ type: 'PRO_REQUEST_RECEIVED', s: 'FAILED', a: 3 }]);
    } finally {
      h.mail.send = original;
    }
    expect(mailsTo(p.email)).toHaveLength(0);
  });

  it('si el SMTP vuelve a tiempo, el aviso sale', async () => {
    const client = await register('cli-recupera');
    const p = await pro('prof-recupera');
    await invite(client.token, await createRequest(client.token), [p.proId]);
    const original = h.mail.send.bind(h.mail);
    h.mail.send = async () => {
      throw new Error('SMTP caído');
    };
    await dispatcher.dispatch();
    h.mail.send = original;
    await dispatcher.dispatch();
    expect(mailsTo(p.email)).toHaveLength(1);
    expect((await status(p.userId)).map((n) => n.s)).toEqual(['SENT']);
  });
});
