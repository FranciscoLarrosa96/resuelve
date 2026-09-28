import { createHmac, randomUUID } from 'crypto';
import { BillingReconciler } from '../src/billing/billing-reconciler.service';
import { describeE2E, Harness, startApp, TEST_MP_WEBHOOK_SECRET } from './app.harness';

const API = '/api/v1';
const PASSWORD = 'una-clave-bien-larga';
const OFFER = 'PRO_FIRST_MONTH_20';
const DAY = 86_400_000;

/**
 * Billing real de PRO con Mercado Pago (proveedor falso en memoria): el
 * checkout nunca activa nada, el webhook firmado solo avisa y la verdad sale
 * de una lectura fresca del proveedor. Promo, mora con gracia, cancelación
 * con acceso hasta fin de período y convivencia con el PRO manual.
 */
describeE2E('Billing PRO con Mercado Pago (e2e)', () => {
  let h: Harness;
  let reconciler: BillingReconciler;
  const svc: Record<string, string> = {};
  const zone: Record<string, string> = {};
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function pro(label: string) {
    const email = `${label}-${randomUUID().slice(0, 8)}@test.dev`;
    const reg = await h.http
      .post(`${API}/auth/register`)
      .send({ firstName: label, lastName: 'Billing', email, password: PASSWORD })
      .expect(201);
    const token = reg.body.accessToken as string;
    const res = await h.http
      .post(`${API}/pro/profile`)
      .set(auth(token))
      .send({ headline: `${label} en Tandil`, yearsExperience: 3, serviceIds: [svc.plomeria], zoneIds: [zone['villa-italia']] })
      .expect(201);
    return { email, token, proId: res.body.id as string };
  }
  type Pro = Awaited<ReturnType<typeof pro>>;

  const checkout = (p: Pro, body: object = {}) => h.http.post(`${API}/billing/pro/checkout`).set(auth(p.token)).send(body);
  const status = async (p: Pro) => (await h.http.get(`${API}/billing/pro/status`).set(auth(p.token)).expect(200)).body;
  const me = async (p: Pro) => (await h.http.get(`${API}/pro/me`).set(auth(p.token)).expect(200)).body;
  const providerIdOf = async (subscriptionId: string) =>
    (await h.dataSource.query(`SELECT provider_subscription_id FROM billing_subscriptions WHERE id = $1`, [subscriptionId]))[0]
      .provider_subscription_id as string;
  const row = async (subscriptionId: string) =>
    (await h.dataSource.query(`SELECT * FROM billing_subscriptions WHERE id = $1`, [subscriptionId]))[0];

  /** Aviso de Mercado Pago firmado como en producción (query `data.id` + `type`). */
  function webhook(
    topic: 'subscription_preapproval' | 'subscription_authorized_payment',
    id: string,
    opts: { requestId?: string; secret?: string } = {},
  ) {
    const requestId = opts.requestId ?? randomUUID();
    const ts = String(Math.floor(Date.now() / 1000));
    const hash = createHmac('sha256', opts.secret ?? TEST_MP_WEBHOOK_SECRET)
      .update(`id:${id.toLowerCase()};request-id:${requestId};ts:${ts};`)
      .digest('hex');
    return h.http
      .post(`${API}/webhooks/mercado-pago/subscriptions?data.id=${encodeURIComponent(id)}&type=${topic}`)
      .set('x-signature', `ts=${ts},v1=${hash}`)
      .set('x-request-id', requestId)
      .send({ action: 'updated', type: topic, data: { id } });
  }

  /** Checkout + autorización en MP + aviso: PRO activo por billing. */
  async function subscribe(p: Pro, charge: 'approved' | 'rejected' | null = 'approved') {
    const { subscriptionId } = (await checkout(p).expect(200)).body;
    const providerId = await providerIdOf(subscriptionId);
    h.billing.authorize(providerId);
    await webhook('subscription_preapproval', providerId).expect(200);
    let paymentId: string | null = null;
    if (charge) {
      paymentId = h.billing.charge(providerId, charge).id;
      await webhook('subscription_authorized_payment', paymentId).expect(200);
    }
    return { subscriptionId, providerId, paymentId };
  }

  beforeAll(async () => {
    h = await startApp({ emailVerification: false });
    reconciler = h.app.get(BillingReconciler);
    for (const s of (await h.http.get(`${API}/services`).expect(200)).body) svc[s.slug] = s.id;
    for (const z of (await h.http.get(`${API}/zones`).expect(200)).body) zone[z.slug] = z.id;
  }, 60_000);

  afterAll(async () => {
    await h?.app.close();
  });

  describe('checkout', () => {
    it('Free → checkout PENDING con el init_point del proveedor y precio normal (sin email verificado)', async () => {
      const p = await pro('free');
      const before = await status(p);
      expect(before).toMatchObject({ enabled: true, plan: 'FREE', subscription: null, canCheckout: true });
      expect(before.checkoutPrice).toMatchObject({ amount: 15000, offerCode: null, currency: 'ARS' });

      const res = await checkout(p).expect(200);
      expect(res.body.checkoutUrl).toMatch(/\/api\/v1\/billing\/fake-checkout\/fake-/);
      expect(res.body).not.toHaveProperty('accessToken');
      const s = await status(p);
      expect(s.plan).toBe('FREE');
      expect(s.subscription).toMatchObject({ status: 'PENDING', currentAmount: 15000, checkoutUrl: res.body.checkoutUrl });
      const r = await row(res.body.subscriptionId);
      expect(h.billing.byExternalReference(res.body.subscriptionId)?.id).toBe(r.provider_subscription_id);
    });

    it('volver del checkout NO activa PRO: sigue PENDING hasta que el proveedor autorice', async () => {
      const p = await pro('vuelve');
      await checkout(p).expect(200);
      expect((await status(p)).plan).toBe('FREE');
      expect((await me(p)).planTier).toBe('FREE');
    });

    it('doble click → una sola suscripción y un solo preapproval', async () => {
      const p = await pro('doble');
      const before = h.billing.calls.filter((c) => c.startsWith('create')).length;
      const [a, b] = await Promise.all([checkout(p), checkout(p)]);
      expect(a.status).toBe(200);
      expect(b.status).toBe(200);
      expect(a.body.subscriptionId).toBe(b.body.subscriptionId);
      expect(h.billing.calls.filter((c) => c.startsWith('create')).length).toBe(before + 1);
      const rows = await h.dataSource.query(`SELECT count(*)::int AS n FROM billing_subscriptions WHERE professional_id = $1`, [p.proId]);
      expect(rows[0].n).toBe(1);
    });

    it('PENDING existente → se reutiliza (y guarda solo un returnTo interno)', async () => {
      const p = await pro('reusa');
      const first = (await checkout(p).expect(200)).body;
      const again = (await checkout(p, { returnTo: '/pro/solicitudes/abc-123' }).expect(200)).body;
      expect(again).toEqual(first);
      expect((await status(p)).subscription.returnPath).toBe('/pro/solicitudes/abc-123');
      await checkout(p, { returnTo: 'https://evil.test' }).expect(200);
      expect((await status(p)).subscription.returnPath).toBe('/pro/solicitudes/abc-123');
    });

    it('timeout ambiguo al crear → se reconcilia por external_reference (sin reintentar el POST)', async () => {
      const p = await pro('timeout');
      h.billing.failNextCreate = 'ambiguous';
      const before = h.billing.calls.filter((c) => c.startsWith('create')).length;
      const res = await checkout(p).expect(200);
      expect(h.billing.calls.filter((c) => c.startsWith('create')).length).toBe(before + 1);
      expect(h.billing.calls).toContain(`search:${res.body.subscriptionId}`);
      expect(res.body.checkoutUrl).toMatch(/fake-checkout/);
    });

    it('error del proveedor → 502 con copy propio y sin suscripción a medias', async () => {
      const p = await pro('error');
      h.billing.failNextCreate = 'error';
      const res = await checkout(p).expect(502);
      expect(res.body.code).toBe('BILLING_PROVIDER_ERROR');
      expect(res.body.message).toBe('No pudimos iniciar la suscripción. Intentá nuevamente.');
      const rows = await h.dataSource.query(`SELECT 1 FROM billing_subscriptions WHERE professional_id = $1`, [p.proId]);
      expect(rows).toHaveLength(0);
    });

    it('el precio nunca viene del frontend', async () => {
      const p = await pro('precio');
      await checkout(p, { amount: 1 }).expect(400);
    });

    it('PRO manual vigente → no ofrece checkout (documentado: 409)', async () => {
      const p = await pro('manual');
      await h.dataSource.query(`UPDATE professional_profiles SET plan_tier = 'PRO' WHERE id = $1`, [p.proId]);
      const s = await status(p);
      expect(s).toMatchObject({ plan: 'PRO', source: 'MANUAL', canCheckout: false, checkoutPrice: null });
      expect((await checkout(p).expect(409)).body.code).toBe('BILLING_MANUAL_PRO_ACTIVE');
    });
  });

  describe('webhooks', () => {
    it('firma inválida → 401 y no procesa', async () => {
      const p = await pro('firma');
      const { subscriptionId } = (await checkout(p).expect(200)).body;
      const providerId = await providerIdOf(subscriptionId);
      h.billing.authorize(providerId);
      const res = await webhook('subscription_preapproval', providerId, { secret: 'otra-clave' }).expect(401);
      expect(res.body.code).toBe('BILLING_INVALID_SIGNATURE');
      await h.http
        .post(`${API}/webhooks/mercado-pago/subscriptions?data.id=${providerId}&type=subscription_preapproval`)
        .send({ data: { id: providerId } })
        .expect(401);
      expect((await row(subscriptionId)).status).toBe('PENDING');
    });

    it('pending → authorized → ACTIVE: PRO por billing sin relogin, sin límite y elegible para destacados', async () => {
      const p = await pro('activa');
      const { subscriptionId } = await subscribe(p);
      const s = await status(p);
      expect(s).toMatchObject({ plan: 'PRO', source: 'BILLING', canCheckout: false, checkoutPrice: null });
      expect(s.subscription).toMatchObject({ status: 'ACTIVE', currentAmount: 15000, checkoutUrl: null });
      expect(s.subscription.nextPaymentAt).toBeTruthy();
      const body = await me(p);
      expect(body.planTier).toBe('PRO');
      expect(body.plan).toMatchObject({ source: 'BILLING', expiresAt: null });
      expect(body.quoteUsage.limit).toBeNull();
      expect(body.featured.eligible).toBe(true);
      expect(body.pro).toBe(true);
      expect((await row(subscriptionId)).authorized_at).toBeTruthy();
    });

    it('webhook duplicado (misma entrega) → idempotente', async () => {
      const p = await pro('dup');
      const { providerId } = await subscribe(p, null);
      const requestId = randomUUID();
      expect((await webhook('subscription_preapproval', providerId, { requestId }).expect(200)).body.result).toBe('PROCESSED');
      expect((await webhook('subscription_preapproval', providerId, { requestId }).expect(200)).body.result).toBe('DUPLICATE');
      expect((await status(p)).subscription.status).toBe('ACTIVE');
    });

    it('lectura vieja después de una nueva → no degrada', async () => {
      const p = await pro('orden');
      const { subscriptionId, providerId } = await subscribe(p, null);
      const applied = (await row(subscriptionId)).provider_updated_at as Date;
      const fake = h.billing.subscriptions.get(providerId)!;
      Object.assign(fake, { status: 'pending', lastModified: new Date(applied.getTime() - 60_000) });
      await webhook('subscription_preapproval', providerId).expect(200);
      expect((await row(subscriptionId)).status).toBe('ACTIVE');
      expect((await status(p)).plan).toBe('PRO');
    });

    it('aviso de un recurso desconocido → 200 ignorado', async () => {
      expect((await webhook('subscription_preapproval', 'no-existe-123').expect(200)).body.result).toBe('IGNORED');
    });

    it('PRO ACTIVE → no crea otro checkout', async () => {
      const p = await pro('otra-vez');
      await subscribe(p);
      expect((await checkout(p).expect(409)).body.code).toBe('BILLING_ALREADY_SUBSCRIBED');
    });

    it('el webhook nunca baja un PRO manual', async () => {
      const p = await pro('convive');
      const { providerId } = await subscribe(p);
      await h.dataSource.query(`UPDATE professional_profiles SET plan_tier = 'PRO' WHERE id = $1`, [p.proId]);
      h.billing.setStatus(providerId, 'cancelled');
      await webhook('subscription_preapproval', providerId).expect(200);
      await h.dataSource.query(`UPDATE billing_subscriptions SET access_until = now() - interval '1 day' WHERE professional_id = $1`, [p.proId]);
      await reconciler.reconcileSubscription(providerId);
      expect(await status(p)).toMatchObject({ plan: 'PRO', source: 'MANUAL' });
    });
  });

  describe('promo PRO_FIRST_MONTH_20', () => {
    /** Free con la oferta elegible (reservada al pedir PRO: no hace falta llegar a 9/10). */
    async function eligible(label: string) {
      const p = await pro(label);
      await h.dataSource.query(`UPDATE professional_profiles SET pro_interest_offer_code = $2 WHERE id = $1`, [p.proId, OFFER]);
      return p;
    }
    const redemptions = async (p: Pro) =>
      (await h.dataSource.query(`SELECT count(*)::int AS n FROM pro_offer_redemptions WHERE professional_id = $1`, [p.proId]))[0].n;

    it('no elegible → 15000', async () => {
      const p = await pro('sin-oferta');
      const { subscriptionId } = (await checkout(p).expect(200)).body;
      expect((await row(subscriptionId)).current_amount).toBe(15000);
    });

    it('elegible → 12000; abandonar el checkout no la consume', async () => {
      const p = await eligible('abandona');
      expect((await status(p)).checkoutPrice).toMatchObject({ amount: 12000, baseAmount: 15000, offerCode: OFFER, discountPercent: 20 });
      const { subscriptionId } = (await checkout(p).expect(200)).body;
      expect(await row(subscriptionId)).toMatchObject({ current_amount: 12000, base_amount: 15000, offer_code: OFFER });
      expect(await redemptions(p)).toBe(0);
      expect((await me(p)).proIntroOffer.eligible).toBe(true);
    });

    it('primer cobro rechazado → sigue 12000, sin redimir; aprobado → redimida y pasa a 15000 una sola vez', async () => {
      const p = await eligible('promo');
      const { subscriptionId, providerId } = await subscribe(p, 'rejected');
      expect(await row(subscriptionId)).toMatchObject({ status: 'PAST_DUE', current_amount: 12000, offer_redeemed_at: null });
      expect(await redemptions(p)).toBe(0);
      expect(h.billing.calls.filter((c) => c === 'update-amount:15000')).toHaveLength(0);

      const updatesBefore = h.billing.calls.filter((c) => c === 'update-amount:15000').length;
      const paid = h.billing.charge(providerId, 'approved');
      await webhook('subscription_authorized_payment', paid.id).expect(200);
      const r = await row(subscriptionId);
      expect(r).toMatchObject({ status: 'ACTIVE', current_amount: 15000 });
      expect(r.offer_redeemed_at).toBeTruthy();
      expect(r.offer_regular_price_applied_at).toBeTruthy();
      expect(h.billing.subscriptions.get(providerId)!.amount).toBe(15000);
      expect(await redemptions(p)).toBe(1);

      // Avisos repetidos del mismo cobro (entregas nuevas): nada de un segundo PUT ni otra redención.
      await Promise.all([
        webhook('subscription_authorized_payment', paid.id).expect(200),
        webhook('subscription_authorized_payment', paid.id).expect(200),
      ]);
      expect(h.billing.calls.filter((c) => c === 'update-amount:15000').length).toBe(updatesBefore + 1);
      expect(await redemptions(p)).toBe(1);
      const own = await me(p);
      expect(own.proIntroOffer.eligible).toBe(false);
    });

    it('si falla el paso a 15000 queda pendiente (no se marca) y la reconciliación lo reintenta', async () => {
      const p = await eligible('reintento');
      h.billing.failAmountUpdates = 1;
      const { subscriptionId, providerId } = await subscribe(p);
      let r = await row(subscriptionId);
      expect(r.offer_redeemed_at).toBeTruthy();
      expect(r.offer_regular_price_applied_at).toBeNull();
      expect(h.billing.subscriptions.get(providerId)!.amount).toBe(12000);

      await reconciler.reconcileAll();
      r = await row(subscriptionId);
      expect(r.offer_regular_price_applied_at).toBeTruthy();
      expect(h.billing.subscriptions.get(providerId)!.amount).toBe(15000);
    });

    it('PENDING creado con el precio anterior (base 19000) no se reutiliza: se cancela y el nuevo sale a 15000', async () => {
      const p = await pro('precio-viejo');
      const old = (await checkout(p).expect(200)).body;
      await h.dataSource.query(`UPDATE billing_subscriptions SET base_amount = 19000, current_amount = 15000 WHERE id = $1`, [
        old.subscriptionId,
      ]);
      const fresh = (await checkout(p).expect(200)).body;
      expect(fresh.subscriptionId).not.toBe(old.subscriptionId);
      expect(await row(old.subscriptionId)).toMatchObject({ status: 'CANCELLED' });
      expect(await row(fresh.subscriptionId)).toMatchObject({ current_amount: 15000, base_amount: 15000 });
    });

    it('cancela y vuelve a suscribirse → 15000 (la promo fue una sola vez)', async () => {
      const p = await eligible('vuelve-pro');
      await subscribe(p);
      await h.http.post(`${API}/billing/pro/cancel`).set(auth(p.token)).expect(200);
      await h.dataSource.query(`UPDATE billing_subscriptions SET access_until = now() - interval '1 minute' WHERE professional_id = $1`, [p.proId]);
      await h.dataSource.transaction((m) => reconciler.syncProfileAccess(m, p.proId));
      const s = await status(p);
      expect(s).toMatchObject({ plan: 'FREE', hadSubscription: true, canCheckout: true });
      expect(s.checkoutPrice).toMatchObject({ amount: 15000, offerCode: null });
      const { subscriptionId } = (await checkout(p).expect(200)).body;
      expect((await row(subscriptionId)).current_amount).toBe(15000);
    });
  });

  describe('mora (PAST_DUE) y gracia', () => {
    it('rechazo → PAST_DUE con PRO en gracia; vencida la gracia → Free; pago tardío → ACTIVE y PRO de nuevo', async () => {
      const p = await pro('mora');
      const { subscriptionId, providerId } = await subscribe(p);
      const rejected = h.billing.charge(providerId, 'rejected');
      await webhook('subscription_authorized_payment', rejected.id).expect(200);
      let s = await status(p);
      expect(s).toMatchObject({ plan: 'PRO', source: 'BILLING' });
      expect(s.subscription.status).toBe('PAST_DUE');
      expect(s.subscription.graceUntil).toBeTruthy();

      await h.dataSource.query(`UPDATE billing_subscriptions SET past_due_since = now() - interval '11 days' WHERE id = $1`, [subscriptionId]);
      await webhook('subscription_preapproval', providerId).expect(200);
      s = await status(p);
      expect(s.plan).toBe('FREE');
      expect(s.subscription.status).toBe('PAST_DUE');
      expect((await me(p)).quoteUsage.limit).toBe(10);

      const late = h.billing.charge(providerId, 'approved');
      await webhook('subscription_authorized_payment', late.id).expect(200);
      s = await status(p);
      expect(s).toMatchObject({ plan: 'PRO', source: 'BILLING' });
      expect(s.subscription).toMatchObject({ status: 'ACTIVE', graceUntil: null });
    });

    it('pausada en el proveedor → Free sin borrar nada', async () => {
      const p = await pro('pausa');
      const { providerId } = await subscribe(p);
      h.billing.setStatus(providerId, 'paused');
      await webhook('subscription_preapproval', providerId).expect(200);
      const s = await status(p);
      expect(s.plan).toBe('FREE');
      expect(s.subscription.status).toBe('PAUSED');
    });
  });

  describe('cancelación', () => {
    it('ACTIVE → cancela en el proveedor y conserva PRO hasta fin del período; después Free', async () => {
      const p = await pro('cancela');
      const { providerId, subscriptionId } = await subscribe(p);
      const next = h.billing.subscriptions.get(providerId)!.nextPaymentDate!;
      // Embudo: checkout y cobro aprobado (uno solo); un segundo cobro es renovación.
      const second = h.billing.charge(providerId, 'approved').id;
      await webhook('subscription_authorized_payment', second).expect(200);
      await webhook('subscription_authorized_payment', second).expect(200);
      const res = await h.http.post(`${API}/billing/pro/cancel`).set(auth(p.token)).expect(200);
      const funnel = (
        await h.dataSource.query<{ type: string }[]>(
          `SELECT type FROM pro_funnel_events WHERE professional_id = $1 AND type::text LIKE 'PRO\\_%' ORDER BY id`,
          [p.proId],
        )
      ).map((r) => r.type);
      expect(funnel).toEqual(['PRO_CHECKOUT_STARTED', 'PRO_PAYMENT_APPROVED', 'PRO_PAYMENT_APPROVED', 'PRO_RENEWED', 'PRO_CANCELLED']);
      expect(h.billing.calls).toContain(`cancel:${providerId}`);
      expect(res.body).toMatchObject({ plan: 'PRO', source: 'BILLING' });
      expect(res.body.subscription.status).toBe('CANCELLED');
      expect(Math.abs(new Date(res.body.subscription.accessUntil).getTime() - next.getTime())).toBeLessThan(1000);
      expect(new Date(res.body.subscription.accessUntil).getTime()).toBeGreaterThan(Date.now() + 25 * DAY);

      // El aviso de la propia cancelación no cambia nada.
      await webhook('subscription_preapproval', providerId).expect(200);
      expect((await status(p)).plan).toBe('PRO');

      await h.dataSource.query(`UPDATE billing_subscriptions SET access_until = now() - interval '1 minute' WHERE id = $1`, [subscriptionId]);
      await h.dataSource.transaction((m) => reconciler.syncProfileAccess(m, p.proId));
      const after = await status(p);
      expect(after.plan).toBe('FREE');
      // No se borra nada: el perfil sigue igual.
      expect((await me(p)).headline).toBe('cancela en Tandil');
    });

    it('caso real: autorizada y cancelada el mismo día sin que llegue el aviso del cobro → PRO hasta el próximo cobro', async () => {
      const p = await pro('cancela-real');
      const { subscriptionId } = (await checkout(p).expect(200)).body;
      const providerId = await providerIdOf(subscriptionId);
      h.billing.authorize(providerId);
      // Mercado Pago cobró el primer mes, pero solo llegó el aviso del preapproval.
      h.billing.charge(providerId, 'approved');
      await webhook('subscription_preapproval', providerId).expect(200);
      expect((await row(subscriptionId)).last_payment_at).toBeNull();
      const next = h.billing.subscriptions.get(providerId)!.nextPaymentDate!;

      const res = await h.http.post(`${API}/billing/pro/cancel`).set(auth(p.token)).expect(200);
      expect(res.body).toMatchObject({ plan: 'PRO', source: 'BILLING', canCheckout: false });
      expect(res.body.subscription.status).toBe('CANCELLED');
      expect(Math.abs(new Date(res.body.subscription.accessUntil).getTime() - next.getTime())).toBeLessThan(1000);
      // La reconciliación previa trajo el cobro que no había avisado.
      expect((await row(subscriptionId)).last_payment_at).not.toBeNull();
      const m = await me(p);
      expect(m.plan.entitlements).toMatchObject({
        canSendUnlimitedQuotes: true,
        canBeFeatured: true,
        canUseAdvancedAnalytics: true,
        canSeeExposureAnalytics: true,
      });
      expect(m.quoteUsage.limit).toBeNull();

      // El aviso de cancelación y la reconciliación del job no lo bajan.
      await webhook('subscription_preapproval', providerId).expect(200);
      await reconciler.reconcileAll();
      await reconciler.reconcileById(subscriptionId);
      expect(await status(p)).toMatchObject({ plan: 'PRO', subscription: { status: 'CANCELLED' } });

      // Pasada la fecha: Free, vuelve el cupo y no se borra nada.
      await h.dataSource.query(`UPDATE billing_subscriptions SET access_until = now() - interval '1 second' WHERE id = $1`, [subscriptionId]);
      await h.dataSource.query(`UPDATE professional_profiles SET billing_pro_until = now() - interval '1 second' WHERE id = $1`, [p.proId]);
      const after = await me(p);
      expect(after.plan.tier).toBe('FREE');
      expect(after.plan.entitlements.canSendUnlimitedQuotes).toBe(false);
      expect(after.quoteUsage.limit).toBe(10);
      expect(after.headline).toBe('cancela-real en Tandil');
    });

    it('cancelada desde Mercado Pago (sin aviso del cobro) → conserva PRO hasta fin del período', async () => {
      const p = await pro('cancela-en-mp');
      const { subscriptionId } = (await checkout(p).expect(200)).body;
      const providerId = await providerIdOf(subscriptionId);
      h.billing.authorize(providerId);
      await webhook('subscription_preapproval', providerId).expect(200);
      h.billing.setStatus(providerId, 'cancelled');
      await webhook('subscription_preapproval', providerId).expect(200);
      const s = await status(p);
      expect(s).toMatchObject({ plan: 'PRO', source: 'BILLING', subscription: { status: 'CANCELLED' } });
      expect(new Date(s.subscription.accessUntil).getTime()).toBeGreaterThan(Date.now() + 25 * DAY);
    });

    it('cobro de antes de cancelar que llega tarde → no se pierde lo pagado', async () => {
      const p = await pro('cobro-tarde');
      const { subscriptionId, providerId } = await subscribe(p, null);
      await h.http.post(`${API}/billing/pro/cancel`).set(auth(p.token)).expect(200);
      await h.dataSource.query(`UPDATE billing_subscriptions SET access_until = NULL WHERE id = $1`, [subscriptionId]);
      const payment = h.billing.charge(providerId, 'approved');
      await h.dataSource.query(`UPDATE billing_subscriptions SET cancelled_at = now() + interval '1 minute' WHERE id = $1`, [subscriptionId]);
      await webhook('subscription_authorized_payment', payment.id).expect(200);
      expect((await row(subscriptionId)).access_until).not.toBeNull();
      expect((await status(p)).plan).toBe('PRO');
    });

    it('PENDING (sin cobro aprobado) → cancela sin inventar período pago', async () => {
      const p = await pro('cancela-pending');
      const { subscriptionId } = (await checkout(p).expect(200)).body;
      const res = await h.http.post(`${API}/billing/pro/cancel`).set(auth(p.token)).expect(200);
      expect(res.body.plan).toBe('FREE');
      const r = await row(subscriptionId);
      expect(r.status).toBe('CANCELLED');
      expect(r.access_until).toBeNull();
      expect((await me(p)).quoteUsage.limit).toBe(10);
    });

    it('en mora sin período pago vigente → Free al cancelar (no extiende la gracia)', async () => {
      const p = await pro('cancela-mora');
      const { subscriptionId, providerId, paymentId } = await subscribe(p);
      // El último cobro aprobado fue hace 40 días: ese ciclo ya terminó.
      const old = new Date(Date.now() - 40 * DAY);
      h.billing.payments.get(paymentId!)!.debitDate = old;
      await h.dataSource.query(`UPDATE billing_subscriptions SET last_payment_at = $2 WHERE id = $1`, [subscriptionId, old]);
      const rejected = h.billing.charge(providerId, 'rejected');
      await webhook('subscription_authorized_payment', rejected.id).expect(200);
      expect((await status(p)).subscription.status).toBe('PAST_DUE');
      const res = await h.http.post(`${API}/billing/pro/cancel`).set(auth(p.token)).expect(200);
      expect(res.body.plan).toBe('FREE');
      expect((await row(subscriptionId)).access_until).toBeNull();
    });

    it('PRO manual + cancelar la suscripción de MP → el PRO manual no se toca', async () => {
      const p = await pro('manual-cancela');
      await subscribe(p);
      await h.dataSource.query(`UPDATE professional_profiles SET plan_tier = 'PRO' WHERE id = $1`, [p.proId]);
      const res = await h.http.post(`${API}/billing/pro/cancel`).set(auth(p.token)).expect(200);
      expect(res.body).toMatchObject({ plan: 'PRO', source: 'MANUAL' });
      const [prof] = await h.dataSource.query(`SELECT plan_tier FROM professional_profiles WHERE id = $1`, [p.proId]);
      expect(prof.plan_tier).toBe('PRO');
    });

    it('si el proveedor no confirma la cancelación, no cambia nada', async () => {
      const p = await pro('cancela-falla');
      const { subscriptionId } = await subscribe(p);
      h.billing.failNextCancel = true;
      expect((await h.http.post(`${API}/billing/pro/cancel`).set(auth(p.token)).expect(502)).body.code).toBe('BILLING_PROVIDER_ERROR');
      expect((await row(subscriptionId)).status).toBe('ACTIVE');
    });

    it('sin suscripción → 409', async () => {
      const p = await pro('nada');
      expect((await h.http.post(`${API}/billing/pro/cancel`).set(auth(p.token)).expect(409)).body.code).toBe('BILLING_NO_SUBSCRIPTION');
    });
  });

  it('checkout falso (dev/Playwright): autorizar vuelve a back_url con PRO confirmado por el backend', async () => {
    const p = await pro('fake-ui');
    const { checkoutUrl } = (await checkout(p).expect(200)).body;
    const path = new URL(checkoutUrl).pathname;
    const page = await h.http.get(path).expect(200);
    expect(page.text).toContain('$15.000');
    const back = await h.http.get(`${path}/authorize`).expect(303);
    expect(back.headers.location).toMatch(/^http:\/\/localhost:4200\/pro\/plan\/resultado\?preapproval_id=/);
    expect(await status(p)).toMatchObject({ plan: 'PRO', source: 'BILLING' });
  });

  it('status con PENDING reconcilia contra el proveedor si el webhook tarda', async () => {
    const p = await pro('sin-aviso');
    const { subscriptionId } = (await checkout(p).expect(200)).body;
    h.billing.authorize(await providerIdOf(subscriptionId));
    await h.dataSource.query(`UPDATE billing_subscriptions SET last_provider_sync_at = now() - interval '1 minute' WHERE id = $1`, [subscriptionId]);
    const s = await status(p);
    expect(s).toMatchObject({ plan: 'PRO', source: 'BILLING' });
    expect(s.subscription.status).toBe('ACTIVE');
  });
});
