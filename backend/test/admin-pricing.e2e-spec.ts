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
    for (const bad of [0, -5, 10_000_001, 15000.5, '20000', null]) {
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

  it('no admite precios que Mercado Pago rechaza: piso $15, y $19 con la oferta del 20%', async () => {
    const admin = await user('probador');
    await h.dataSource.getRepository(User).update({ email: admin.email }, { isAdmin: true });
    expect((await h.http.get(`${API}/admin/pricing`).set(auth(admin.token)).expect(200)).body.minPriceArs).toBe(19);
    await h.http.put(`${API}/admin/pricing`).set(auth(admin.token)).send({ monthlyPriceArs: 1 }).expect(400);
    const low = await h.http.put(`${API}/admin/pricing`).set(auth(admin.token)).send({ monthlyPriceArs: 18 }).expect(400);
    expect(low.body).toMatchObject({ code: 'PRO_PRICE_TOO_LOW', details: { minPriceArs: 19 } });

    const res = await h.http.put(`${API}/admin/pricing`).set(auth(admin.token)).send({ monthlyPriceArs: 19 }).expect(200);
    expect(res.body).toMatchObject({ monthlyPriceArs: 19, introOffer: { discountedPriceArs: 15 } });
    expect((await h.http.get(`${API}/plans`).expect(200)).body.pro.monthlyPriceArs).toBe(19);
    const pro = await user('prueba-minima', true);
    expect((await h.http.get(`${API}/billing/pro/status`).set(auth(pro.token)).expect(200)).body.checkoutPrice.amount).toBe(19);
    await h.http.post(`${API}/billing/pro/checkout`).set(auth(pro.token)).send({}).expect(200);
    // Vuelve al precio real para no afectar al resto de las pruebas.
    await h.http.put(`${API}/admin/pricing`).set(auth(admin.token)).send({ monthlyPriceArs: 15000 }).expect(200);
  });

  it('un precio viejo debajo del mínimo no llega a Mercado Pago: 502 sin crear la suscripción', async () => {
    await h.dataSource.query(
      `INSERT INTO pro_price_changes (price_ars, previous_price_ars, changed_by) VALUES (1, 15000, 'legacy')`,
    );
    try {
      const pro = await user('precio-viejo', true);
      const res = await h.http.post(`${API}/billing/pro/checkout`).set(auth(pro.token)).send({}).expect(502);
      expect(res.body.code).toBe('BILLING_PROVIDER_ERROR');
      const [{ n }] = await h.dataSource.query(
        `SELECT count(*)::int AS n FROM billing_subscriptions s
           JOIN professional_profiles p ON p.id = s.professional_id
           JOIN users u ON u.id = p.user_id WHERE u.email = $1`,
        [pro.email],
      );
      expect(n).toBe(0);
    } finally {
      await h.dataSource.query(`DELETE FROM pro_price_changes WHERE changed_by = 'legacy'`);
    }
  });
});
