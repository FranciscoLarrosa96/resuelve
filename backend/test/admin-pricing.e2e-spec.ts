import { randomUUID } from 'crypto';
import { describeE2E, Harness, startApp } from './app.harness';
import { User } from '../src/users/user.entity';

const API = '/api/v1';
const PASSWORD = 'una-clave-bien-larga';

/**
 * Precio de PRO administrable: solo `is_admin`, historial, y rige para
 * suscripciones nuevas (la existente conserva su monto).
 */
describeE2E('Panel admin: precio de PRO (e2e)', () => {
  let h: Harness;
  const svc: Record<string, string> = {};
  const zone: Record<string, string> = {};
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function user(label: string, asPro = false) {
    const email = `${label}-${randomUUID().slice(0, 8)}@test.dev`;
    const reg = await h.http
      .post(`${API}/auth/register`)
      .send({ firstName: label, lastName: 'Precio', email, password: PASSWORD })
      .expect(201);
    const token = reg.body.accessToken as string;
    if (asPro) {
      await h.http
        .post(`${API}/pro/profile`)
        .set(auth(token))
        .send({ headline: `${label} en Tandil`, yearsExperience: 3, serviceIds: [svc.plomeria], zoneIds: [zone['villa-italia']] })
        .expect(201);
    }
    return { email, token };
  }

  beforeAll(async () => {
    h = await startApp({ emailVerification: false });
    for (const s of (await h.http.get(`${API}/services`).expect(200)).body) svc[s.slug] = s.id;
    for (const z of (await h.http.get(`${API}/zones`).expect(200)).body) zone[z.slug] = z.id;
  }, 60_000);

  afterAll(async () => {
    await h?.app.close();
  });

  it('solo un admin: el resto recibe el 404 de una ruta inexistente', async () => {
    const common = await user('comun');
    await h.http.get(`${API}/admin/pricing`).set(auth(common.token)).expect(404);
    await h.http.put(`${API}/admin/pricing`).set(auth(common.token)).send({ monthlyPriceArs: 1 }).expect(404);
    await h.http.get(`${API}/admin/pricing`).expect(401);
  });

  it('cambia el precio: lo ve /plans, el checkout nuevo y la promo; un pendiente con el precio viejo se rehace', async () => {
    const admin = await user('operador');
    await h.dataSource.getRepository(User).update({ email: admin.email }, { isAdmin: true });

    const first = await h.http.get(`${API}/admin/pricing`).set(auth(admin.token)).expect(200);
    expect(first.body).toMatchObject({ monthlyPriceArs: 15000, source: 'CONFIG', history: [] });

    const before = await user('antes', true);
    const old = (await h.http.post(`${API}/billing/pro/checkout`).set(auth(before.token)).send({}).expect(200)).body;

    // Validaciones: entero, rango, sin cambios.
    for (const bad of [0, 999, 10_000_001, 15000.5, '20000', null]) {
      await h.http.put(`${API}/admin/pricing`).set(auth(admin.token)).send({ monthlyPriceArs: bad }).expect(400);
    }
    const same = await h.http.put(`${API}/admin/pricing`).set(auth(admin.token)).send({ monthlyPriceArs: 15000 }).expect(409);
    expect(same.body.code).toBe('PRO_PRICE_UNCHANGED');

    const res = await h.http.put(`${API}/admin/pricing`).set(auth(admin.token)).send({ monthlyPriceArs: 20000 }).expect(200);
    expect(res.body).toMatchObject({
      monthlyPriceArs: 20000,
      source: 'ADMIN',
      introOffer: { discountedPriceArs: 16000 },
    });
    expect(res.body.history[0]).toMatchObject({ priceArs: 20000, previousPriceArs: 15000, changedBy: admin.email });

    const plans = (await h.http.get(`${API}/plans`).expect(200)).body;
    expect(plans.pro.monthlyPriceArs).toBe(20000);
    expect(plans.introOffer.discountedPriceArs).toBe(16000);

    // Pendiente creado con el precio anterior: no se reutiliza, se crea otro al precio nuevo.
    const again = (await h.http.post(`${API}/billing/pro/checkout`).set(auth(before.token)).send({}).expect(200)).body;
    expect(again.subscriptionId).not.toBe(old.subscriptionId);
    const status = (await h.http.get(`${API}/billing/pro/status`).set(auth(before.token)).expect(200)).body;
    expect(status.subscription.currentAmount).toBe(20000);

    // Un profesional nuevo ve el precio nuevo.
    const fresh = await user('despues', true);
    const s = (await h.http.get(`${API}/billing/pro/status`).set(auth(fresh.token)).expect(200)).body;
    expect(s.checkoutPrice.amount).toBe(20000);
  });
});
