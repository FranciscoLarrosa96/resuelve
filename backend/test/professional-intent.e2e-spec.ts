import { professionalOnboardingCounts } from '../src/funnel/funnel-report';
import { randomUUID } from 'crypto';
import { describeE2E, Harness, startApp } from './app.harness';
const API = '/api/v1';
describeE2E('Retomar el alta profesional', () => {
  let h: Harness;
  beforeAll(async () => { h = await startApp({ emailVerification: false }); }, 60000);
  afterAll(async () => { await h?.app.close(); });
  async function account(professionalIntent = false) {
    const email = `intencion-${randomUUID()}@test.dev`;
    const body = { firstName: 'Alta', lastName: 'Pendiente', email, password: 'clave-de-prueba-larga', professionalIntent };
    const registered = await h.http.post(`${API}/auth/register`).send(body).expect(201);
    return { token: registered.body.accessToken as string, email, password: body.password };
  }
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const me = async (token: string) => (await h.http.get(`${API}/auth/me`).set(auth(token)).expect(200)).body;
  it('persiste entre sesiones, sin conceder permisos profesionales ni alterar cuentas cliente', async () => {
    const p = await account(true);
    const before = await me(p.token);
    expect(before.professionalIntentAt).toBeTruthy(); expect(before.professionalProfileId).toBeNull();
    await h.http.get(`${API}/pro/me`).set(auth(p.token)).expect(403);
    const login = await h.http.post(`${API}/auth/login`).send({ email: p.email, password: p.password }).expect(200);
    expect((await me(login.body.accessToken)).professionalIntentAt).toBe(before.professionalIntentAt);
    const client = await account(); expect((await me(client.token)).professionalIntentAt).toBeNull();
  });
  it('el reporte ve el inicio antes de que exista perfil y lo distingue de terminar el alta', async () => {
    const p = await account(true);
    const started = new Date((await me(p.token)).professionalIntentAt);
    const from = new Date(started.getTime() - 1); const to = new Date(started.getTime() + 1);
    expect(await professionalOnboardingCounts(h.dataSource.manager, from, to)).toEqual({ started: 1, withProfile: 0, withoutProfile: 1 });
    const categories = (await h.http.get(`${API}/categories`).expect(200)).body;
    const zones = (await h.http.get(`${API}/zones?city=tandil`).expect(200)).body;
    await h.http.post(`${API}/pro/profile`).set(auth(p.token)).send({ headline: 'Ofrezco mi servicio', serviceIds: [categories[0].services[0].id], zoneIds: [zones[0].id] }).expect(201);
    expect(await professionalOnboardingCounts(h.dataSource.manager, from, to)).toEqual({ started: 1, withProfile: 1, withoutProfile: 0 });
  });
  it('empezar el alta con una cuenta existente es autenticado, idempotente y propio', async () => {
    await h.http.post(`${API}/pro/onboarding/start`).send({}).expect(401);
    const p = await account(); const other = await account();
    const first = await h.http.post(`${API}/pro/onboarding/start`).set(auth(p.token)).send({}).expect(201);
    const second = await h.http.post(`${API}/pro/onboarding/start`).set(auth(p.token)).send({}).expect(201);
    expect(second.body.professionalIntentAt).toBe(first.body.professionalIntentAt);
    expect((await me(other.token)).professionalIntentAt).toBeNull();
    expect((await me(p.token)).professionalProfileId).toBeNull();
  });
});
