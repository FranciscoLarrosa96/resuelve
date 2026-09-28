import { randomUUID } from 'crypto';
import { CURRENT_TERMS_VERSION } from '../src/legal/terms';
import { describeE2E, Harness, startApp } from './app.harness';

const API = '/api/v1';
const PASSWORD = 'una-clave-bien-larga';

/**
 * `EMAIL_VERIFICATION_ENABLED=false` (default de producción): el registro
 * crea la cuenta y devuelve tokens, sin código ni email, y nada exige
 * email verificado.
 */
describeE2E('Registro sin verificación de email (e2e)', () => {
  let h: Harness;
  let serviceId: string;
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const newEmail = (label: string) => `${label}-${randomUUID().slice(0, 8)}@test.dev`;

  beforeAll(async () => {
    h = await startApp({ emailVerification: false });
    serviceId = (await h.http.get(`${API}/services`).expect(200)).body[0].id;
  });
  afterAll(async () => h.app.close());

  it('register crea la cuenta, devuelve tokens y no manda ningún email', async () => {
    const email = newEmail('simple');
    const res = await h.http
      .post(`${API}/auth/register`)
      .send({ firstName: 'Ana', lastName: 'Simple', email, password: PASSWORD })
      .expect(201);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.refreshToken).toEqual(expect.any(String));
    expect(res.body.verificationSessionId).toBeUndefined();
    expect(h.mail.sent.filter((m) => m.to === email)).toHaveLength(0);

    const me = await h.http.get(`${API}/auth/me`).set(auth(res.body.accessToken)).expect(200);
    expect(me.body.email).toBe(email);
    expect(me.body.emailVerified).toBe(false);
    expect(me.body.passwordHash).toBeUndefined();

    const [{ count }] = await h.dataSource.query('SELECT count(*)::int FROM pending_registrations WHERE email = $1', [
      email,
    ]);
    expect(count).toBe(0);
  });

  it('crear la cuenta registra la versión vigente de los Términos de Uso y cuándo', async () => {
    const email = newEmail('terms');
    const before = Date.now();
    await h.http
      .post(`${API}/auth/register`)
      .send({ firstName: 'Ana', lastName: 'Terms', email, password: PASSWORD })
      .expect(201);
    const [row] = await h.dataSource.query('SELECT terms_version, terms_accepted_at FROM users WHERE email = $1', [email]);
    expect(row.terms_version).toBe(CURRENT_TERMS_VERSION);
    expect(new Date(row.terms_accepted_at).getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  it('email duplicado (sin importar mayúsculas) → 409 EMAIL_ALREADY_REGISTERED', async () => {
    const email = newEmail('dup');
    await h.http.post(`${API}/auth/register`).send({ firstName: 'A', lastName: 'B', email, password: PASSWORD }).expect(201);
    const dup = await h.http
      .post(`${API}/auth/register`)
      .send({ firstName: 'A', lastName: 'B', email: email.toUpperCase(), password: PASSWORD });
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe('EMAIL_ALREADY_REGISTERED');
  });

  it('dos altas simultáneas con el mismo email: una cuenta y un 409', async () => {
    const email = newEmail('race');
    const body = { firstName: 'A', lastName: 'B', email, password: PASSWORD };
    const results = await Promise.all([
      h.http.post(`${API}/auth/register`).send(body),
      h.http.post(`${API}/auth/register`).send(body),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    const [{ count }] = await h.dataSource.query('SELECT count(*)::int FROM users WHERE lower(email) = lower($1)', [email]);
    expect(count).toBe(1);
  });

  it('puede crear su perfil profesional sin verificar el email', async () => {
    const email = newEmail('pro');
    const reg = await h.http
      .post(`${API}/auth/register`)
      .send({ firstName: 'Pro', lastName: 'Simple', email, password: PASSWORD })
      .expect(201);
    await h.http
      .post(`${API}/pro/profile`)
      .set(auth(reg.body.accessToken))
      .send({ headline: 'Test', yearsExperience: 1, serviceIds: [serviceId], coversEntireCity: true })
      .expect(201);
  });
});
