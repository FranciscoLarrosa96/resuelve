import { randomUUID } from 'crypto';
import { CURRENT_TERMS_VERSION } from '../src/legal/terms';
import { describeE2E, Harness, startApp } from './app.harness';

const API = '/api/v1';
const PASSWORD = 'una-clave-bien-larga';

/**
 * Registro pendiente: `POST /auth/register` NO crea ningún `User` ni emite
 * tokens. Recién `POST /auth/register/verify` (código correcto) crea la
 * cuenta real, con `email_verified_at` ya seteado, y emite tokens. Es
 * imposible que un usuario nuevo llegue a tener sesión sin haber demostrado
 * que controla el email.
 */
describeE2E('Registro pendiente (e2e)', () => {
  let h: Harness;
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  function newEmail(label: string) {
    return `${label}-${randomUUID().slice(0, 8)}@test.dev`;
  }

  async function startRegistration(label: string, extra: Record<string, unknown> = {}) {
    const email = newEmail(label);
    const res = await h.http
      .post(`${API}/auth/register`)
      .send({ firstName: label, lastName: 'Pending', email, password: PASSWORD, ...extra })
      .expect(202);
    return { email, sessionId: res.body.verificationSessionId as string, maskedEmail: res.body.maskedEmail as string };
  }

  async function registerAndVerify(label: string) {
    const p = await startRegistration(label);
    const code = h.mail.lastCodeFor(p.email);
    const res = await h.http
      .post(`${API}/auth/register/verify`)
      .send({ verificationSessionId: p.sessionId, code })
      .expect(200);
    return { email: p.email, token: res.body.accessToken as string };
  }

  const countUsersByEmail = async (email: string) => {
    const [{ count }] = await h.dataSource.query('SELECT count(*)::int FROM users WHERE lower(email) = lower($1)', [
      email,
    ]);
    return count as number;
  };
  const countPending = async (id: string) => {
    const [{ count }] = await h.dataSource.query(
      'SELECT count(*)::int FROM pending_registrations WHERE id = $1',
      [id],
    );
    return count as number;
  };

  beforeAll(async () => {
    h = await startApp();
  });
  afterAll(async () => h.app.close());

  it('CRITERIO DE ÉXITO: register no crea User; solo un pending. Verify correcto crea el User y borra el pending', async () => {
    const p = await startRegistration('criterio');
    expect(await countUsersByEmail(p.email)).toBe(0);
    expect(await countPending(p.sessionId)).toBe(1);

    const code = h.mail.lastCodeFor(p.email);
    const res = await h.http
      .post(`${API}/auth/register/verify`)
      .send({ verificationSessionId: p.sessionId, code })
      .expect(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();

    expect(await countUsersByEmail(p.email)).toBe(1);
    expect(await countPending(p.sessionId)).toBe(0);
    const [user] = await h.dataSource.query(
      'SELECT email_verified_at, terms_version, terms_accepted_at FROM users WHERE lower(email) = lower($1)',
      [p.email],
    );
    expect(user.email_verified_at).toBeTruthy();
    expect(user.terms_version).toBe(CURRENT_TERMS_VERSION);
    expect(user.terms_accepted_at).toBeTruthy();
  });

  it('la respuesta de /auth/register nunca trae tokens ni datos sensibles', async () => {
    const email = newEmail('sinTokens');
    const res = await h.http
      .post(`${API}/auth/register`)
      .send({ firstName: 'x', lastName: 'y', email, password: PASSWORD })
      .expect(202);
    expect(res.body.verificationRequired).toBe(true);
    expect(res.body.verificationSessionId).toBeTruthy();
    expect(res.body.maskedEmail).toMatch(/••••@/);
    expect(res.body.accessToken).toBeUndefined();
    expect(res.body.refreshToken).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toMatch(/expectedCode|codeHash|password/i);
  });

  it('email inventado / sin acceso: si nunca se verifica, el User nunca existe', async () => {
    const p = await startRegistration('sinacceso');
    expect(await countUsersByEmail(p.email)).toBe(0);
    // Ni siquiera intentando (sin el código real) se crea la cuenta.
    await h.http
      .post(`${API}/auth/register/verify`)
      .send({ verificationSessionId: p.sessionId, code: '000000' })
      .expect(400);
    expect(await countUsersByEmail(p.email)).toBe(0);
  });

  it('código incorrecto: no crea User y suma intentos', async () => {
    const p = await startRegistration('incorrecto');
    const res = await h.http
      .post(`${API}/auth/register/verify`)
      .send({ verificationSessionId: p.sessionId, code: '000000' })
      .expect(400);
    expect(res.body.code).toBe('EMAIL_VERIFICATION_INVALID_CODE');
    expect(await countUsersByEmail(p.email)).toBe(0);

    const [row] = await h.dataSource.query(
      'SELECT verification_attempts FROM pending_registrations WHERE id = $1',
      [p.sessionId],
    );
    expect(row.verification_attempts).toBe(1);
  });

  it('código vencido: rechaza y no crea User (el pending sigue vivo, se puede reenviar)', async () => {
    const p = await startRegistration('vencido');
    await h.dataSource.query(
      `UPDATE pending_registrations SET verification_expires_at = now() - interval '1 minute' WHERE id = $1`,
      [p.sessionId],
    );
    const res = await h.http
      .post(`${API}/auth/register/verify`)
      .send({ verificationSessionId: p.sessionId, code: h.mail.lastCodeFor(p.email) })
      .expect(400);
    expect(res.body.code).toBe('EMAIL_VERIFICATION_EXPIRED');
    expect(await countUsersByEmail(p.email)).toBe(0);
    expect(await countPending(p.sessionId)).toBe(1); // sigue vivo: se puede resend
  });

  it('registro pendiente vencido (24 h): rechaza verify y no crea User; hay que volver a registrarse', async () => {
    const p = await startRegistration('pendvencido');
    await h.dataSource.query(`UPDATE pending_registrations SET expires_at = now() - interval '1 minute' WHERE id = $1`, [
      p.sessionId,
    ]);
    const res = await h.http
      .post(`${API}/auth/register/verify`)
      .send({ verificationSessionId: p.sessionId, code: h.mail.lastCodeFor(p.email) })
      .expect(410);
    expect(res.body.code).toBe('PENDING_REGISTRATION_EXPIRED');
    expect(await countUsersByEmail(p.email)).toBe(0);
  });

  it('sessionId inexistente (o ya consumido): PENDING_REGISTRATION_EXPIRED', async () => {
    const res = await h.http
      .post(`${API}/auth/register/verify`)
      .send({ verificationSessionId: randomUUID(), code: '123456' })
      .expect(410);
    expect(res.body.code).toBe('PENDING_REGISTRATION_EXPIRED');
  });

  it('demasiados intentos exige reenvío (sin crear User)', async () => {
    const p = await startRegistration('intentos');
    for (let i = 0; i < 5; i++) {
      await h.http.post(`${API}/auth/register/verify`).send({ verificationSessionId: p.sessionId, code: '000000' });
    }
    const res = await h.http
      .post(`${API}/auth/register/verify`)
      .send({ verificationSessionId: p.sessionId, code: h.mail.lastCodeFor(p.email) })
      .expect(400);
    expect(res.body.code).toBe('EMAIL_VERIFICATION_TOO_MANY_ATTEMPTS');
    expect(await countUsersByEmail(p.email)).toBe(0);
  });

  it('reenvío: código A queda inválido, código B funciona; respeta el cooldown', async () => {
    const p = await startRegistration('reenvio');
    const codeA = h.mail.lastCodeFor(p.email);

    const early = await h.http.post(`${API}/auth/register/resend-code`).send({ verificationSessionId: p.sessionId });
    expect(early.status).toBe(429);
    expect(early.body.code).toBe('EMAIL_VERIFICATION_COOLDOWN');

    await h.dataSource.query(`UPDATE pending_registrations SET last_code_sent_at = now() - interval '2 minutes' WHERE id = $1`, [
      p.sessionId,
    ]);
    await h.http.post(`${API}/auth/register/resend-code`).send({ verificationSessionId: p.sessionId }).expect(204);
    const codeB = h.mail.lastCodeFor(p.email);
    expect(codeB).not.toBe(codeA);

    const rejectA = await h.http
      .post(`${API}/auth/register/verify`)
      .send({ verificationSessionId: p.sessionId, code: codeA })
      .expect(400);
    expect(rejectA.body.code).toBe('EMAIL_VERIFICATION_INVALID_CODE');

    await h.http.post(`${API}/auth/register/verify`).send({ verificationSessionId: p.sessionId, code: codeB }).expect(200);
  });

  it('reenvío con sessionId vencido/inexistente: PENDING_REGISTRATION_EXPIRED', async () => {
    const res = await h.http
      .post(`${API}/auth/register/resend-code`)
      .send({ verificationSessionId: randomUUID() })
      .expect(410);
    expect(res.body.code).toBe('PENDING_REGISTRATION_EXPIRED');
  });

  it('pending duplicado: registrar de nuevo el mismo email reemplaza el código anterior (case-insensitive)', async () => {
    const email = newEmail('duplicado');
    const first = await h.http
      .post(`${API}/auth/register`)
      .send({ firstName: 'Primero', lastName: 'Pending', email, password: PASSWORD })
      .expect(202);
    const oldCode = h.mail.lastCodeFor(email);

    // Cooldown respetado también acá para no permitir spam vía re-registro.
    await h.dataSource.query(`UPDATE pending_registrations SET last_code_sent_at = now() - interval '2 minutes' WHERE id = $1`, [
      first.body.verificationSessionId,
    ]);
    const second = await h.http
      .post(`${API}/auth/register`)
      .send({ firstName: 'Segundo', lastName: 'Pending', email: email.toUpperCase(), password: PASSWORD })
      .expect(202);
    expect(second.body.verificationSessionId).toBe(first.body.verificationSessionId); // misma fila, reemplazada

    const [{ count }] = await h.dataSource.query('SELECT count(*)::int FROM pending_registrations WHERE lower(email) = lower($1)', [
      email,
    ]);
    expect(count).toBe(1); // nunca dos filas para el mismo email

    const newCode = h.mail.lastCodeFor(email);
    expect(newCode).not.toBe(oldCode);
    await h.http
      .post(`${API}/auth/register/verify`)
      .send({ verificationSessionId: first.body.verificationSessionId, code: oldCode })
      .expect(400);

    const verified = await h.http
      .post(`${API}/auth/register/verify`)
      .send({ verificationSessionId: first.body.verificationSessionId, code: newCode })
      .expect(200);
    // El User usa los datos del registro más reciente ("Segundo"), no el primero.
    const me = await h.http.get(`${API}/auth/me`).set(auth(verified.body.accessToken)).expect(200);
    expect(me.body.firstName).toBe('Segundo');
  });

  it('re-registrar el mismo email dentro del cooldown no reenvía ni pisa el código vigente', async () => {
    const email = newEmail('recooldown');
    const first = await h.http
      .post(`${API}/auth/register`)
      .send({ firstName: 'Primero', lastName: 'Pending', email, password: PASSWORD })
      .expect(202);
    const code = h.mail.lastCodeFor(email);
    const sentCount = h.mail.sent.filter((m) => m.to === email).length;

    const second = await h.http
      .post(`${API}/auth/register`)
      .send({ firstName: 'Segundo', lastName: 'Pending', email, password: PASSWORD })
      .expect(202);
    expect(second.body.verificationSessionId).toBe(first.body.verificationSessionId);
    expect(h.mail.sent.filter((m) => m.to === email).length).toBe(sentCount); // no mandó otro email

    // El código original sigue sirviendo (no se pisó).
    await h.http
      .post(`${API}/auth/register/verify`)
      .send({ verificationSessionId: first.body.verificationSessionId, code })
      .expect(200);
  });

  it('verificaciones concurrentes del mismo pending: solo una crea el User', async () => {
    const p = await startRegistration('concurrente');
    const code = h.mail.lastCodeFor(p.email);
    const [a, b] = await Promise.all([
      h.http.post(`${API}/auth/register/verify`).send({ verificationSessionId: p.sessionId, code }),
      h.http.post(`${API}/auth/register/verify`).send({ verificationSessionId: p.sessionId, code }),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses[0]).toBe(200); // una gana
    expect(statuses[1]).not.toBe(200); // la otra no duplica la cuenta
    expect(await countUsersByEmail(p.email)).toBe(1);
  });

  it('email ya registrado (cuenta activa): register rechaza antes de crear un pending', async () => {
    const u = await registerAndVerify('activo');
    const res = await h.http
      .post(`${API}/auth/register`)
      .send({ firstName: 'x', lastName: 'y', email: u.email.toUpperCase(), password: PASSWORD })
      .expect(409);
    expect(res.body.code).toBe('EMAIL_ALREADY_REGISTERED');
  });

  it('login automático: el código correcto entrega tokens usables sin volver a pedir credenciales', async () => {
    const u = await registerAndVerify('autologin');
    const me = await h.http.get(`${API}/auth/me`).set(auth(u.token)).expect(200);
    expect(me.body.email).toBe(u.email);
    expect(me.body.emailVerified).toBe(true);
  });

  it('teléfono y barrio por defecto se copian del pending al User verificado', async () => {
    const zones = (await h.http.get(`${API}/zones?city=tandil`).expect(200)).body as { id: string }[];
    const p = await startRegistration('conzona', { phone: '+54 249 555 9999', defaultZoneId: zones[0].id });
    const res = await h.http
      .post(`${API}/auth/register/verify`)
      .send({ verificationSessionId: p.sessionId, code: h.mail.lastCodeFor(p.email) })
      .expect(200);
    const me = await h.http.get(`${API}/auth/me`).set(auth(res.body.accessToken)).expect(200);
    expect(me.body.phone).toBe('+54 249 555 9999');
    expect(me.body.defaultZoneId).toBe(zones[0].id);
  });
});
