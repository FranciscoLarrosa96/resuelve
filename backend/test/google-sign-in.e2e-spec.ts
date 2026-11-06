import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { GOOGLE_TOKEN_VERIFIER, GoogleIdentity, GoogleTokenVerifier, identityFromPayload } from '../src/auth/google-sign-in';
import { describeE2E, Harness, startApp } from './app.harness';

const API = '/api/v1';
const PASSWORD = 'una-clave-bien-larga';
const CLIENT_ID = 'test-client.apps.googleusercontent.com';

/**
 * Ingreso con Google: el token se verifica en el backend (acá, un verificador falso que
 * acepta "ok:<sub>:<email>"); entra, vincula por email o crea la cuenta. Sin
 * GOOGLE_CLIENT_ID no se ofrece.
 */
describeE2E('Ingreso con Google (e2e)', () => {
  let h: Harness;
  let config: ConfigService;
  const verifier = (): GoogleTokenVerifier => h.app.get(GOOGLE_TOKEN_VERIFIER);

  beforeAll(async () => {
    h = await startApp({ emailVerification: false });
    config = h.app.get(ConfigService);
    config.set('GOOGLE_CLIENT_ID', CLIENT_ID);
    jest.spyOn(verifier(), 'verify').mockImplementation(async (token, clientId): Promise<GoogleIdentity | null> => {
      const [ok, sub, email, first = 'Ana', last = 'Gómez'] = token.split(':');
      if (ok !== 'ok' || clientId !== CLIENT_ID) return null;
      return { sub, email, firstName: first, lastName: last };
    });
  }, 60_000);
  afterAll(async () => h?.app.close());

  const google = (credential: string, extra: Record<string, unknown> = {}) =>
    h.http.post(`${API}/auth/google`).send({ credential, ...extra });
  const me = async (token: string) =>
    (await h.http.get(`${API}/auth/me`).set({ Authorization: `Bearer ${token}` }).expect(200)).body;

  it('expone el ID de cliente (público) y nada más', async () => {
    expect((await h.http.get(`${API}/auth/providers`).expect(200)).body).toEqual({ googleClientId: CLIENT_ID });
  });

  it('crea la cuenta la primera vez y después entra a la misma', async () => {
    const email = `ana-${randomUUID().slice(0, 8)}@gmail.com`;
    const sub = randomUUID();
    const first = (await google(`ok:${sub}:${email}`, { professionalIntent: true }).expect(200)).body;
    expect(first).toMatchObject({ tokenType: 'Bearer' });
    const user = await me(first.accessToken);
    expect(user).toMatchObject({ email, firstName: 'Ana', lastName: 'Gómez' });
    const [row] = await h.dataSource.query(
      `SELECT google_sub, email_verified_at, terms_version, professional_intent_at FROM users WHERE id = $1`, [user.id],
    );
    expect(row.google_sub).toBe(sub);
    expect(row.email_verified_at).not.toBeNull();
    expect(row.terms_version).not.toBeNull();
    expect(row.professional_intent_at).not.toBeNull();
    const again = (await google(`ok:${sub}:${email}`).expect(200)).body;
    expect((await me(again.accessToken)).id).toBe(user.id);
    // Sin contraseña conocida: no entra con email y una clave cualquiera.
    await h.http.post(`${API}/auth/login`).send({ email, password: PASSWORD }).expect(401);
  });

  it('vincula una cuenta existente por email; si no estaba verificada, invalida la contraseña y las sesiones', async () => {
    const email = `ya-${randomUUID().slice(0, 8)}@gmail.com`;
    const reg = (await h.http.post(`${API}/auth/register`)
      .send({ firstName: 'Ya', lastName: 'Existe', email, password: PASSWORD }).expect(201)).body;
    const linked = (await google(`ok:${randomUUID()}:${email}`).expect(200)).body;
    expect((await me(linked.accessToken)).firstName).toBe('Ya');
    await h.http.post(`${API}/auth/login`).send({ email, password: PASSWORD }).expect(401);
    await h.http.post(`${API}/auth/refresh`).send({ refreshToken: reg.refreshToken }).expect(401);
  });

  it('con el email ya verificado, vincula sin tocar la contraseña', async () => {
    const email = `verif-${randomUUID().slice(0, 8)}@gmail.com`;
    await h.http.post(`${API}/auth/register`).send({ firstName: 'Vera', lastName: 'Ficada', email, password: PASSWORD }).expect(201);
    await h.dataSource.query(`UPDATE users SET email_verified_at = now() WHERE lower(email) = $1`, [email]);
    await google(`ok:${randomUUID()}:${email}`).expect(200);
    await h.http.post(`${API}/auth/login`).send({ email, password: PASSWORD }).expect(200);
    // Otra cuenta de Google con el mismo email: no se pisa la vinculación.
    expect((await google(`ok:${randomUUID()}:${email}`).expect(409)).body.code).toBe('GOOGLE_ACCOUNT_CONFLICT');
  });

  it('token inválido → 401; sin GOOGLE_CLIENT_ID → 404 y providers en null', async () => {
    expect((await google('falso').expect(401)).body.code).toBe('INVALID_GOOGLE_CREDENTIAL');
    config.set('GOOGLE_CLIENT_ID', '');
    try {
      await google(`ok:${randomUUID()}:x-${randomUUID().slice(0, 6)}@gmail.com`).expect(404);
      expect((await h.http.get(`${API}/auth/providers`).expect(200)).body).toEqual({ googleClientId: null });
    } finally {
      config.set('GOOGLE_CLIENT_ID', CLIENT_ID);
    }
  });

  it('la baja de la cuenta se confirma con la misma cuenta de Google y la desvincula', async () => {
    const email = `baja-${randomUUID().slice(0, 8)}@gmail.com`;
    const sub = randomUUID();
    const t = (await google(`ok:${sub}:${email}`).expect(200)).body;
    const del = (body: object) =>
      h.http.post(`${API}/account/delete`).set({ Authorization: `Bearer ${t.accessToken}` }).send(body);
    await del({}).expect(400);
    expect((await del({ googleCredential: `ok:${randomUUID()}:${email}` }).expect(403)).body.code).toBe('ACCOUNT_PASSWORD_INCORRECT');
    await del({ googleCredential: `ok:${sub}:${email}` }).expect(200);
    const [row] = await h.dataSource.query(`SELECT count(*)::int AS n FROM users WHERE google_sub = $1`, [sub]);
    expect(row.n).toBe(0);
    // Volver a entrar con Google crea una cuenta nueva, no recupera la anterior.
    const back = (await google(`ok:${sub}:${email}`).expect(200)).body;
    expect((await me(back.accessToken)).email).toBe(email);
  });
});

describe('identityFromPayload', () => {
  it('exige email verificado y arma el nombre', () => {
    expect(identityFromPayload({ sub: '1', email: 'A@B.com', email_verified: false })).toBeNull();
    expect(identityFromPayload({ sub: '1', email_verified: true })).toBeNull();
    expect(identityFromPayload({ sub: '1', email: ' A@B.com ', email_verified: true, given_name: 'Ana', family_name: 'Paz' }))
      .toEqual({ sub: '1', email: 'a@b.com', firstName: 'Ana', lastName: 'Paz' });
    expect(identityFromPayload({ sub: '1', email: 'juan@b.com', email_verified: true, name: 'Juan' }))
      .toMatchObject({ firstName: 'Juan', lastName: '' });
    expect(identityFromPayload({ sub: '1', email: 'juan@b.com', email_verified: true }))
      .toMatchObject({ firstName: 'juan' });
  });
});
