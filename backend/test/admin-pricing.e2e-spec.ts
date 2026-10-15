import { BillingReconciler } from '../src/billing/billing-reconciler.service';
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
    for (const z of (await h.http.get(`${API}/zones?city=tandil`).expect(200)).body) zone[z.slug] = z.id;
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

  it('admite $1 (pruebas con cobro real): /plans y el checkout lo toman', async () => {
    const admin = await user('probador');
    await h.dataSource.getRepository(User).update({ email: admin.email }, { isAdmin: true });
    const res = await h.http.put(`${API}/admin/pricing`).set(auth(admin.token)).send({ monthlyPriceArs: 1 }).expect(200);
    expect(res.body.monthlyPriceArs).toBe(1);
    expect((await h.http.get(`${API}/plans`).expect(200)).body.pro.monthlyPriceArs).toBe(1);
    const pro = await user('prueba-uno', true);
    expect((await h.http.get(`${API}/billing/pro/status`).set(auth(pro.token)).expect(200)).body.checkoutPrice.amount).toBe(1);
    // Vuelve al precio real para no afectar al resto de las pruebas.
    await h.http.put(`${API}/admin/pricing`).set(auth(admin.token)).send({ monthlyPriceArs: 15000 }).expect(200);
  });

  it('Plus tiene precio, historial y cobros separados; lo vigente no cambia', async () => {
    const admin = await user('adminplus');
    await h.dataSource.getRepository(User).update({ email: admin.email }, { isAdmin: true });
    const request = () => h.http.get(`${API}/admin/pricing?plan=PRO_PLUS`).set(auth(admin.token));
    const change = (amount: number) => h.http.put(`${API}/admin/pricing`).set(auth(admin.token)).send({ plan: 'PRO_PLUS', monthlyPriceArs: amount });
    const initial = (await request().expect(200)).body;
    expect(initial).toMatchObject({ plan: 'PRO_PLUS', monthlyPriceArs: 24900, source: 'CONFIG', history: [], introOffer: null });
    const proBefore = (await h.http.get(`${API}/admin/pricing`).set(auth(admin.token)).expect(200)).body;
    const existing = await user('plusvigente', true);
    const checkout = (await h.http.post(`${API}/billing/pro/checkout`).set(auth(existing.token)).send({ plan: 'PRO_PLUS' }).expect(200)).body;
    const [row] = await h.dataSource.query(`SELECT * FROM billing_subscriptions WHERE id = $1`, [checkout.subscriptionId]);
    h.billing.authorize(row.provider_subscription_id);
    h.billing.charge(row.provider_subscription_id, 'approved');
    await h.app.get(BillingReconciler).reconcileById(row.id);
    try {
      const changed = (await change(27000).expect(200)).body;
      expect(changed).toMatchObject({ plan: 'PRO_PLUS', monthlyPriceArs: 27000, introOffer: null, inUse: [{ amountArs: 24900, subscriptions: 1 }] });
      expect(changed.history[0]).toMatchObject({ priceArs: 27000, previousPriceArs: 24900 });
      const plans = (await h.http.get(`${API}/plans`).expect(200)).body;
      expect(plans.pro.monthlyPriceArs).toBe(proBefore.monthlyPriceArs);
      expect(plans.proPlus.monthlyPriceArs).toBe(27000);
      const proAfter = (await h.http.get(`${API}/admin/pricing`).set(auth(admin.token)).expect(200)).body;
      expect(proAfter.history).toEqual(proBefore.history);
      const current = (await h.http.get(`${API}/billing/pro/status`).set(auth(existing.token)).expect(200)).body.subscription;
      expect(current).toMatchObject({ currentAmount: 24900, baseAmount: 24900, planTier: 'PRO_PLUS' });
      expect(h.billing.byExternalReference(row.id)?.amount).toBe(24900);
      const fresh = await user('plusnuevo', true);
      await h.http.post(`${API}/billing/pro/checkout`).set(auth(fresh.token)).send({ plan: 'PRO_PLUS' }).expect(200);
      expect((await h.http.get(`${API}/billing/pro/status`).set(auth(fresh.token)).expect(200)).body.subscription).toMatchObject({ currentAmount: 27000, offerCode: null });
      await h.http.put(`${API}/admin/transfer-account`).set(auth(admin.token)).send({ enabled: true, holder: 'Cuenta de Resuelve', alias: 'resuelve.pro' }).expect(200);
      const transfers = (await h.http.get(`${API}/billing/transfer`).set(auth(fresh.token)).expect(200)).body;
      expect(transfers.plusOptions[0]).toMatchObject({ amountArs: 27000, basePriceArs: 27000, offerCode: null });
      await change(27000).expect(409);
      await h.http.get(`${API}/admin/pricing?plan=FREE`).set(auth(admin.token)).expect(400);
      await h.http.put(`${API}/admin/pricing`).set(auth(admin.token)).send({ plan: 'FREE', monthlyPriceArs: 10 }).expect(400);
      await h.http.put(`${API}/admin/pricing`).set(auth(admin.token)).send({ plan: null, monthlyPriceArs: 10 }).expect(400);
    } finally {
      await change(24900).expect(200);
    }
  });

});
