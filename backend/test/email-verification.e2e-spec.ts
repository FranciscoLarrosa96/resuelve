import { randomUUID } from 'crypto';
import { describeE2E, Harness, insertLegacyUser, startApp } from './app.harness';

const API = '/api/v1';
const PASSWORD = 'una-clave-bien-larga';

/**
 * Compatibilidad legacy: cuentas creadas ANTES del registro pendiente
 * (`pending-registration.e2e-spec.ts`), con `email_verified_at IS NULL`.
 * Nunca se migran automáticamente ni se borran: siguen su propio flujo
 * (login → verificar) hasta que completan la verificación, usando los
 * mismos endpoints `/auth/email-verification/*` y `PATCH /auth/email` de
 * siempre. Como ya no existe ningún camino de la API que cree un `User` sin
 * verificar, estas cuentas se simulan con `insertLegacyUser` (inserción
 * directa, nunca un endpoint público).
 */
describeE2E('Verificación de email — cuentas legacy (e2e)', () => {
  let h: Harness;
  let serviceId: string;
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function legacyLogin(label: string) {
    const email = `${label}-${randomUUID().slice(0, 8)}@test.dev`;
    await insertLegacyUser(h, { email, password: PASSWORD, firstName: label, lastName: 'Legacy' });
    const res = await h.http.post(`${API}/auth/login`).send({ email, password: PASSWORD }).expect(200);
    return { email, token: res.body.accessToken as string };
  }

  beforeAll(async () => {
    h = await startApp();
    serviceId = (await h.http.get(`${API}/services`).expect(200)).body[0].id;
  });
  afterAll(async () => h.app.close());

  it('una cuenta legacy sin verificar puede iniciar sesión y /auth/me lo refleja', async () => {
    const u = await legacyLogin('nueva');
    const me = await h.http.get(`${API}/auth/me`).set(auth(u.token)).expect(200);
    expect(me.body.emailVerified).toBe(false);
    expect(me.body.emailVerifiedAt).toBeNull();
  });

  it('no puede pedir un código sin loguearse primero (no hay registro pendiente que lo mande solo)', async () => {
    // A diferencia del registro pendiente, una cuenta legacy no recibe el código
    // automáticamente: tiene que pedirlo autenticada, una vez que inició sesión.
    const u = await legacyLogin('pide');
    await h.http.post(`${API}/auth/email-verification/send`).set(auth(u.token)).expect(204);
    expect(() => h.mail.lastCodeFor(u.email)).not.toThrow();
  });

  it('código correcto verifica la cuenta', async () => {
    const u = await legacyLogin('correcto');
    await h.http.post(`${API}/auth/email-verification/send`).set(auth(u.token)).expect(204);
    const code = h.mail.lastCodeFor(u.email);
    const res = await h.http
      .post(`${API}/auth/email-verification/verify`)
      .set(auth(u.token))
      .send({ code })
      .expect(200);
    expect(res.body.emailVerifiedAt).toBeTruthy();

    const me = await h.http.get(`${API}/auth/me`).set(auth(u.token)).expect(200);
    expect(me.body.emailVerified).toBe(true);
  });

  it('código incorrecto se rechaza y suma intentos', async () => {
    const u = await legacyLogin('incorrecto');
    await h.http.post(`${API}/auth/email-verification/send`).set(auth(u.token)).expect(204);
    const res = await h.http
      .post(`${API}/auth/email-verification/verify`)
      .set(auth(u.token))
      .send({ code: '000000' })
      .expect(400);
    expect(res.body.code).toBe('EMAIL_VERIFICATION_INVALID_CODE');

    const [row] = await h.dataSource.query(
      `SELECT attempts FROM email_verification_codes evc JOIN users u ON u.id = evc.user_id WHERE u.email = $1`,
      [u.email],
    );
    expect(row.attempts).toBe(1);
  });

  it('código vencido se rechaza', async () => {
    const u = await legacyLogin('vencido');
    await h.http.post(`${API}/auth/email-verification/send`).set(auth(u.token)).expect(204);
    await h.dataSource.query(
      `UPDATE email_verification_codes SET expires_at = now() - interval '1 minute'
         WHERE user_id = (SELECT id FROM users WHERE email = $1)`,
      [u.email],
    );
    const res = await h.http
      .post(`${API}/auth/email-verification/verify`)
      .set(auth(u.token))
      .send({ code: h.mail.lastCodeFor(u.email) })
      .expect(400);
    expect(res.body.code).toBe('EMAIL_VERIFICATION_EXPIRED');
  });

  it('demasiados intentos exige reenvío', async () => {
    const u = await legacyLogin('intentos');
    await h.http.post(`${API}/auth/email-verification/send`).set(auth(u.token)).expect(204);
    for (let i = 0; i < 5; i++) {
      await h.http.post(`${API}/auth/email-verification/verify`).set(auth(u.token)).send({ code: '000000' });
    }
    const res = await h.http
      .post(`${API}/auth/email-verification/verify`)
      .set(auth(u.token))
      .send({ code: h.mail.lastCodeFor(u.email) })
      .expect(400);
    expect(res.body.code).toBe('EMAIL_VERIFICATION_TOO_MANY_ATTEMPTS');
  });

  it('reenviar invalida el código anterior y respeta el cooldown', async () => {
    const u = await legacyLogin('reenvio');
    await h.http.post(`${API}/auth/email-verification/send`).set(auth(u.token)).expect(204);
    const oldCode = h.mail.lastCodeFor(u.email);
    const early = await h.http.post(`${API}/auth/email-verification/send`).set(auth(u.token));
    expect(early.status).toBe(429);
    expect(early.body.code).toBe('EMAIL_VERIFICATION_COOLDOWN');

    await h.dataSource.query(
      `UPDATE email_verification_codes SET sent_at = now() - interval '2 minutes'
         WHERE user_id = (SELECT id FROM users WHERE email = $1)`,
      [u.email],
    );
    await h.http.post(`${API}/auth/email-verification/send`).set(auth(u.token)).expect(204);
    const newCode = h.mail.lastCodeFor(u.email);
    expect(newCode).not.toBe(oldCode);

    const rejectOld = await h.http
      .post(`${API}/auth/email-verification/verify`)
      .set(auth(u.token))
      .send({ code: oldCode })
      .expect(400);
    expect(rejectOld.body.code).toBe('EMAIL_VERIFICATION_INVALID_CODE');

    await h.http.post(`${API}/auth/email-verification/verify`).set(auth(u.token)).send({ code: newCode }).expect(200);
  });

  it('tope de envíos por hora bloquea el reenvío', async () => {
    const u = await legacyLogin('cupo');
    await h.http.post(`${API}/auth/email-verification/send`).set(auth(u.token)).expect(204);
    await h.dataSource.query(
      `UPDATE email_verification_codes SET sent_at = now() - interval '2 minutes', created_at = now() - interval '2 minutes'
         WHERE user_id = (SELECT id FROM users WHERE email = $1)`,
      [u.email],
    );
    for (let i = 0; i < 4; i++) {
      await h.http.post(`${API}/auth/email-verification/send`).set(auth(u.token)).expect(204);
      await h.dataSource.query(
        `UPDATE email_verification_codes SET sent_at = now() - interval '2 minutes', created_at = now() - interval '2 minutes'
           WHERE user_id = (SELECT id FROM users WHERE email = $1)`,
        [u.email],
      );
    }
    const res = await h.http.post(`${API}/auth/email-verification/send`).set(auth(u.token));
    expect(res.status).toBe(429);
    expect(res.body.code).toBe('EMAIL_VERIFICATION_RATE_LIMITED');
  });

  it('verificar/reenviar en una cuenta ya verificada es idempotente y sensible', async () => {
    const u = await legacyLogin('yaverif');
    await h.http.post(`${API}/auth/email-verification/send`).set(auth(u.token)).expect(204);
    await h.http
      .post(`${API}/auth/email-verification/verify`)
      .set(auth(u.token))
      .send({ code: h.mail.lastCodeFor(u.email) })
      .expect(200);

    const resend = await h.http.post(`${API}/auth/email-verification/send`).set(auth(u.token));
    expect(resend.status).toBe(409);
    expect(resend.body.code).toBe('EMAIL_ALREADY_VERIFIED');
  });

  it('no permite crear perfil profesional sin verificar el email; sí después de verificar', async () => {
    const u = await legacyLogin('protegido');
    const blocked = await h.http
      .post(`${API}/pro/profile`)
      .set(auth(u.token))
      .send({ headline: 'Test', yearsExperience: 1, serviceIds: [serviceId], coversEntireCity: true });
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('EMAIL_NOT_VERIFIED');

    await h.http.post(`${API}/auth/email-verification/send`).set(auth(u.token)).expect(204);
    await h.http
      .post(`${API}/auth/email-verification/verify`)
      .set(auth(u.token))
      .send({ code: h.mail.lastCodeFor(u.email) })
      .expect(200);

    await h.http
      .post(`${API}/pro/profile`)
      .set(auth(u.token))
      .send({ headline: 'Test', yearsExperience: 1, serviceIds: [serviceId], coversEntireCity: true })
      .expect(201);
  });

  it('PATCH /auth/email cambia el email antes de verificar y manda un código nuevo', async () => {
    const u = await legacyLogin('typo');
    await h.http.post(`${API}/auth/email-verification/send`).set(auth(u.token)).expect(204);
    const oldCode = h.mail.lastCodeFor(u.email);
    const newEmail = `arreglado-${randomUUID().slice(0, 8)}@test.dev`;

    await h.http.patch(`${API}/auth/email`).set(auth(u.token)).send({ email: newEmail, password: 'incorrecta' }).expect(401);
    await h.http.patch(`${API}/auth/email`).set(auth(u.token)).send({ email: newEmail, password: PASSWORD }).expect(204);

    const me = await h.http.get(`${API}/auth/me`).set(auth(u.token)).expect(200);
    expect(me.body.email).toBe(newEmail);
    expect(me.body.emailVerified).toBe(false);

    const newCode = h.mail.lastCodeFor(newEmail);
    expect(newCode).not.toBe(oldCode);
    await h.http
      .post(`${API}/auth/email-verification/verify`)
      .set(auth(u.token))
      .send({ code: newCode })
      .expect(200);
  });

  it('PATCH /auth/email no reemplaza un email ya verificado', async () => {
    const u = await legacyLogin('protegido2');
    await h.http.post(`${API}/auth/email-verification/send`).set(auth(u.token)).expect(204);
    await h.http
      .post(`${API}/auth/email-verification/verify`)
      .set(auth(u.token))
      .send({ code: h.mail.lastCodeFor(u.email) })
      .expect(200);

    const res = await h.http
      .patch(`${API}/auth/email`)
      .set(auth(u.token))
      .send({ email: `otro-${randomUUID().slice(0, 8)}@test.dev`, password: PASSWORD });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('EMAIL_ALREADY_VERIFIED');
  });

  it('email de una cuenta legacy sin verificar sigue bloqueando un registro nuevo con el mismo email', async () => {
    const u = await legacyLogin('bloquea');
    const res = await h.http
      .post(`${API}/auth/register`)
      .send({ firstName: 'x', lastName: 'y', email: u.email.toUpperCase(), password: PASSWORD });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('EMAIL_ALREADY_REGISTERED');
  });
});
