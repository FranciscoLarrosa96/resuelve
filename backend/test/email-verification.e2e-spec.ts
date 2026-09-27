import { randomUUID } from 'crypto';
import { describeE2E, Harness, startApp } from './app.harness';

const API = '/api/v1';
const PASSWORD = 'una-clave-bien-larga';

/**
 * Verificación real de email: nadie puede crear/publicar perfil profesional
 * usando un correo inventado sin demostrar que lo controla (código de 6
 * dígitos, CSPRNG, hash guardado, nunca el código en la respuesta).
 */
describeE2E('Verificación de email (e2e)', () => {
  let h: Harness;
  let serviceId: string;
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function register(label: string) {
    const email = `${label}-${randomUUID().slice(0, 8)}@test.dev`;
    const res = await h.http
      .post(`${API}/auth/register`)
      .send({ firstName: label, lastName: 'Verif', email, password: PASSWORD })
      .expect(201);
    return { email, token: res.body.accessToken as string };
  }

  beforeAll(async () => {
    h = await startApp();
    serviceId = (await h.http.get(`${API}/services`).expect(200)).body[0].id;
  });
  afterAll(async () => h.app.close());

  it('registro deja la cuenta sin verificar y manda un código (nunca en la respuesta)', async () => {
    const u = await register('nueva');
    const res = await h.http.post(`${API}/auth/register`).send({
      firstName: 'x',
      lastName: 'y',
      email: `otra-${randomUUID().slice(0, 8)}@test.dev`,
      password: PASSWORD,
    });
    expect(res.body.code).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toMatch(/expectedCode|codeHash/i);

    const me = await h.http.get(`${API}/auth/me`).set(auth(u.token)).expect(200);
    expect(me.body.emailVerified).toBe(false);
    expect(me.body.emailVerifiedAt).toBeNull();
    expect(() => h.mail.lastCodeFor(u.email)).not.toThrow();
  });

  it('código correcto verifica la cuenta', async () => {
    const u = await register('correcto');
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
    const u = await register('incorrecto');
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
    const u = await register('vencido');
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
    const u = await register('intentos');
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
    const u = await register('reenvio');
    const oldCode = h.mail.lastCodeFor(u.email);
    // Sin esperar el cooldown: se rechaza.
    const early = await h.http.post(`${API}/auth/email-verification/send`).set(auth(u.token));
    expect(early.status).toBe(429);
    expect(early.body.code).toBe('EMAIL_VERIFICATION_COOLDOWN');

    // Simula que pasó el cooldown.
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
    const u = await register('cupo');
    await h.dataSource.query(
      `UPDATE email_verification_codes SET sent_at = now() - interval '2 minutes', created_at = now() - interval '2 minutes'
         WHERE user_id = (SELECT id FROM users WHERE email = $1)`,
      [u.email],
    );
    // Ya van 1 (registro) + 4 reenvíos = 5 (el tope default). El 6.º cae en rate limit.
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
    const u = await register('yaverif');
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
    const u = await register('protegido');
    const blocked = await h.http
      .post(`${API}/pro/profile`)
      .set(auth(u.token))
      .send({ headline: 'Test', yearsExperience: 1, serviceIds: [serviceId], coversEntireCity: true });
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('EMAIL_NOT_VERIFIED');

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

  it('email duplicado sigue rechazado (case-insensitive)', async () => {
    const u = await register('dupe');
    const res = await h.http
      .post(`${API}/auth/register`)
      .send({ firstName: 'x', lastName: 'y', email: u.email.toUpperCase(), password: PASSWORD });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('EMAIL_ALREADY_REGISTERED');
  });

  it('PATCH /auth/email cambia el email antes de verificar y manda un código nuevo', async () => {
    const u = await register('typo');
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
    const u = await register('protegido2');
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
});
