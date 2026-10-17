import { createHmac, randomUUID } from 'crypto';
import { BillingReconciler } from '../src/billing/billing-reconciler.service';
import { TransferService } from '../src/billing/transfer/transfer.service';
import { describeE2E, Harness, startApp, TEST_MP_WEBHOOK_SECRET } from './app.harness';

const API = '/api/v1';
const PASSWORD = 'una-clave-bien-larga';
const DAY = 86_400_000;
const HOUR = 3_600_000;
const PLUS_TYPES = ['PRO_PLAN_CHANGE_SCHEDULED', 'PRO_PLAN_CHANGE_ACTIVATED'];

/**
 * Cambio programado PRO → PRO Plus (funciones de cobro nuevas, apagadas por defecto: acá se encienden):
 *  - transferencia: Plus con inicio al terminar el PRO pagado, sin descontar días si la confirmación demora;
 *  - Mercado Pago (doble en memoria): solicitado → confirmado por el proveedor → activo SOLO con el cobro de
 *    Plus aprobado; fallos, reintentos, cobro con monto anterior, descarte y cancelación de la renovación.
 */
describeE2E('Cambio programado PRO → PRO Plus (e2e)', () => {
  let h: Harness;
  let reconciler: BillingReconciler;
  let transfers: TransferService;
  let operator: { userId: string };
  const svc: Record<string, string> = {};
  const zone: Record<string, string> = {};
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function pro(label: string) {
    const email = `${label}-${randomUUID().slice(0, 8)}@test.dev`;
    const reg = await h.http
      .post(`${API}/auth/register`)
      .send({ firstName: label, lastName: 'Cambio', email, password: PASSWORD })
      .expect(201);
    const token = reg.body.accessToken as string;
    const res = await h.http
      .post(`${API}/pro/profile`)
      .set(auth(token))
      .send({ headline: `${label} en Tandil`, yearsExperience: 3, serviceIds: [svc.plomeria], zoneIds: [zone['villa-italia']] })
      .expect(201);
    const [{ id: userId }] = await h.dataSource.query(`SELECT id FROM users WHERE email = $1`, [email]);
    return { email, token, proId: res.body.id as string, userId: userId as string };
  }
  type Pro = Awaited<ReturnType<typeof pro>>;

  const me = async (p: Pro) => (await h.http.get(`${API}/pro/me`).set(auth(p.token)).expect(200)).body;
  const status = async (p: Pro) => (await h.http.get(`${API}/billing/pro/status`).set(auth(p.token)).expect(200)).body;
  const noticeTypes = async (p: Pro): Promise<string[]> =>
    (await h.dataSource.query(`SELECT type FROM notifications WHERE user_id = $1 ORDER BY created_at, id`, [p.userId])).map(
      (r: { type: string }) => r.type,
    );
  const profileRow = async (p: Pro) =>
    (await h.dataSource.query(`SELECT * FROM professional_profiles WHERE id = $1`, [p.proId]))[0];

  beforeAll(async () => {
    process.env.PLAN_CHANGE_TRANSFER_ENABLED = 'true';
    process.env.PLAN_CHANGE_MP_ENABLED = 'true';
    h = await startApp({ emailVerification: false });
    reconciler = h.app.get(BillingReconciler);
    transfers = h.app.get(TransferService);
    for (const s of (await h.http.get(`${API}/services`).expect(200)).body) svc[s.slug] = s.id;
    for (const z of (await h.http.get(`${API}/zones?city=tandil`).expect(200)).body) zone[z.slug] = z.id;
    const op = await pro('operador');
    operator = { userId: op.userId };
    await transfers.setAccount(
      { enabled: true, holder: 'Cuenta Resuelve', alias: 'resuelve.pro', cbu: null, bank: null, cuit: null },
      operator.userId,
    );
  }, 60_000);

  afterAll(async () => {
    delete process.env.PLAN_CHANGE_TRANSFER_ENABLED;
    delete process.env.PLAN_CHANGE_MP_ENABLED;
    await h?.app.close();
  });

  // ---------------------------------------------------------------------------
  describe('transferencia', () => {
    const overview = async (p: Pro) => (await h.http.get(`${API}/billing/transfer`).set(auth(p.token)).expect(200)).body;
    const request = (p: Pro, months: number, plan?: string) =>
      h.http.post(`${API}/billing/transfer`).set(auth(p.token)).send({ months, plan });
    /** Pide, avisa y el operador confirma. */
    async function pay(p: Pro, months: number, plan: 'PRO' | 'PRO_PLUS') {
      const pending = (await request(p, months, plan).expect(200)).body.pending;
      await h.http.post(`${API}/billing/transfer/submit`).set(auth(p.token)).send({}).expect(200);
      await transfers.approve(pending.id, operator.userId);
      return pending.id as string;
    }

    it('con PRO por transferencia vigente, Plus se ofrece con inicio al terminar el PRO (fecha prevista) y no cambia el plan hoy', async () => {
      const p = await pro('prevista');
      await pay(p, 1, 'PRO');
      const until = (await profileRow(p)).transfer_pro_until as Date;
      const o = await overview(p);
      expect(o.currentTier).toBe('PRO');
      expect(o.scheduledPlus).toBe(true);
      expect(o.plusOptions).toHaveLength(3);
      for (const opt of o.plusOptions) {
        expect(new Date(opt.startsAt).getTime()).toBe(until.getTime());
        expect(opt.startsNow).toBe(false);
        expect(new Date(opt.endsAt).getTime() - new Date(opt.startsAt).getTime()).toBe(opt.months * 30 * DAY);
      }
      // Precios de la fuente actual, sin descuentos ni prorrateo.
      expect(o.plusOptions.map((x: { amountArs: number }) => x.amountArs)).toEqual([24900, 74700, 149400]);
      const pending = (await request(p, 1, 'PRO_PLUS').expect(200)).body.pending;
      expect(pending).toMatchObject({ planTier: 'PRO_PLUS', amountArs: 24900, status: 'AWAITING_PROOF' });
      expect(new Date(pending.startsAt).getTime()).toBe(until.getTime());
      expect((await me(p)).plan.tier).toBe('PRO');
    });

    it('confirmado: sigue PRO hasta el fin del período pago, Plus arranca ahí; aviso in-app solo (sin PRO_TRANSFER_APPROVED)', async () => {
      const p = await pro('programa');
      await pay(p, 1, 'PRO');
      const proEnd = (await profileRow(p)).transfer_pro_until as Date;
      await pay(p, 3, 'PRO_PLUS');
      const row = await profileRow(p);
      expect(new Date(row.transfer_plus_from).getTime()).toBe(proEnd.getTime());
      expect(new Date(row.transfer_pro_until).getTime()).toBe(proEnd.getTime() + 90 * DAY);
      expect((await me(p)).plan.tier).toBe('PRO'); // hoy sigue PRO
      expect(new Date((await overview(p)).plusStartsAt).getTime()).toBe(proEnd.getTime());
      expect(await noticeTypes(p)).toEqual(['PRO_TRANSFER_APPROVED', 'PRO_PLAN_CHANGE_SCHEDULED']);
      const [n] = await h.dataSource.query(
        `SELECT payload, email_status, push_status FROM notifications WHERE user_id = $1 AND type = 'PRO_PLAN_CHANGE_SCHEDULED'`,
        [p.userId],
      );
      expect(n.payload.planChange).toMatchObject({ tier: 'PRO_PLUS', via: 'TRANSFER' });
      expect(new Date(n.payload.planChange.startsAt).getTime()).toBe(proEnd.getTime());
      expect(JSON.stringify(n.payload)).not.toMatch(/amount|\$|monto/i);
      // Solo in-app: ni email ni push (no están en los textos de esos canales).
      const { EMAIL_NOTICE_COPY } = await import('../src/notifications/email/email-notification-copy');
      const { PUSH_COPY } = await import('../src/notifications/push/push-copy');
      for (const t of PLUS_TYPES) {
        expect((EMAIL_NOTICE_COPY as Record<string, unknown>)[t]).toBeUndefined();
        expect((PUSH_COPY as Record<string, unknown>)[t]).toBeUndefined();
      }
    });

    it('cuando Plus empieza: Plus activo y un único aviso de "activo" aunque el job corra varias veces', async () => {
      const p = await pro('activa');
      await pay(p, 1, 'PRO');
      const plusId = await pay(p, 1, 'PRO_PLUS');
      // Se simula el paso del tiempo: el PRO terminó hace una hora y Plus ya corre.
      await h.dataSource.query(
        `UPDATE transfer_payments SET period_start = now() - interval '40 days', period_end = now() - interval '1 hour', reviewed_at = now() - interval '40 days'
          WHERE professional_id = $1 AND plan_tier = 'PRO'`,
        [p.proId],
      );
      await h.dataSource.query(
        `UPDATE transfer_payments SET period_start = now() - interval '1 hour', period_end = now() + interval '29 days', reviewed_at = now() - interval '35 days' WHERE id = $1`,
        [plusId],
      );
      await h.dataSource.query(
        `UPDATE professional_profiles SET transfer_plus_from = now() - interval '1 hour', transfer_plus_until = now() + interval '29 days', transfer_pro_until = now() + interval '29 days' WHERE id = $1`,
        [p.proId],
      );
      expect((await me(p)).plan).toMatchObject({ tier: 'PRO_PLUS', source: 'TRANSFER' });
      expect((await transfers.tick()).activated).toBe(1);
      await transfers.tick();
      expect((await noticeTypes(p)).filter((t) => t === 'PRO_PLAN_CHANGE_ACTIVATED')).toHaveLength(1);
    });

    it('si el admin confirma tarde, el período arranca en la confirmación: no se descuentan días anteriores', async () => {
      const p = await pro('tarde');
      await pay(p, 1, 'PRO');
      const pending = (await request(p, 1, 'PRO_PLUS').expect(200)).body.pending;
      await h.http.post(`${API}/billing/transfer/submit`).set(auth(p.token)).send({}).expect(200);
      // El PRO venció antes de que el admin confirmara.
      await h.dataSource.query(
        `UPDATE transfer_payments SET period_end = now() - interval '2 days' WHERE professional_id = $1 AND status = 'APPROVED'`,
        [p.proId],
      );
      await h.dataSource.query(`UPDATE professional_profiles SET transfer_pro_until = now() - interval '2 days' WHERE id = $1`, [p.proId]);
      const before = Date.now();
      await transfers.approve(pending.id, operator.userId);
      const [paid] = await h.dataSource.query(`SELECT period_start, period_end FROM transfer_payments WHERE id = $1`, [pending.id]);
      expect(new Date(paid.period_start).getTime()).toBeGreaterThanOrEqual(before - 1000);
      expect(new Date(paid.period_end).getTime() - new Date(paid.period_start).getTime()).toBe(30 * DAY);
      expect((await me(p)).plan.tier).toBe('PRO_PLUS'); // rige desde la confirmación, con los 30 días completos
      expect(await noticeTypes(p)).not.toContain('PRO_PLAN_CHANGE_SCHEDULED'); // rige ya: no es un cambio programado
    });

    it('rechazo o arrepentimiento: el PRO pagado queda intacto y no hay aviso de cambio', async () => {
      const p = await pro('rechazo');
      await pay(p, 1, 'PRO');
      const proEnd = (await profileRow(p)).transfer_pro_until as Date;
      const pending = (await request(p, 1, 'PRO_PLUS').expect(200)).body.pending;
      await h.http.post(`${API}/billing/transfer/submit`).set(auth(p.token)).send({}).expect(200);
      await transfers.reject(pending.id, operator.userId, 'No lo encontramos');
      expect((await profileRow(p)).transfer_plus_until).toBeNull();
      expect(await noticeTypes(p)).not.toContain('PRO_PLAN_CHANGE_SCHEDULED');
      // Confirmado y revocado: vuelve al PRO original.
      const again = await pay(p, 1, 'PRO_PLUS');
      expect(await noticeTypes(p)).toContain('PRO_PLAN_CHANGE_SCHEDULED');
      await h.http.post(`${API}/billing/transfer/withdraw`).set(auth(p.token)).send({ refundTo: 'alias.valido' }).expect(200);
      const row = await profileRow(p);
      expect(row.transfer_plus_until).toBeNull();
      expect(new Date(row.transfer_pro_until).getTime()).toBe(proEnd.getTime());
      expect((await me(p)).plan.tier).toBe('PRO');
      expect(again).toBeTruthy();
    });

    it('Plus → PRO sigue fuera: se pide cuando termine el período', async () => {
      const p = await pro('inverso');
      await pay(p, 1, 'PRO');
      await pay(p, 1, 'PRO_PLUS');
      const res = await request(p, 1, 'PRO').expect(409);
      expect(res.body.code).toBe('TRANSFER_BLOCKED');
    });

    it('doble pedido: el mismo código; doble aprobación: la segunda no suma días', async () => {
      const p = await pro('doble');
      await pay(p, 1, 'PRO');
      const a = (await request(p, 1, 'PRO_PLUS').expect(200)).body.pending;
      const b = (await request(p, 1, 'PRO_PLUS').expect(200)).body.pending;
      expect(b.reference).toBe(a.reference);
      await h.http.post(`${API}/billing/transfer/submit`).set(auth(p.token)).send({}).expect(200);
      await transfers.approve(a.id, operator.userId);
      const until = (await profileRow(p)).transfer_pro_until;
      await expect(transfers.approve(a.id, operator.userId)).rejects.toMatchObject({ response: { code: 'TRANSFER_INVALID_STATE' } });
      expect((await profileRow(p)).transfer_pro_until).toEqual(until);
      expect((await noticeTypes(p)).filter((t) => t === 'PRO_PLAN_CHANGE_SCHEDULED')).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  describe('Mercado Pago', () => {
    const providerIdOf = async (subscriptionId: string) =>
      (await h.dataSource.query(`SELECT provider_subscription_id FROM billing_subscriptions WHERE id = $1`, [subscriptionId]))[0]
        .provider_subscription_id as string;
    const row = async (subscriptionId: string) =>
      (await h.dataSource.query(`SELECT * FROM billing_subscriptions WHERE id = $1`, [subscriptionId]))[0];
    // Los contadores de fallos del proveedor falso no se arrastran de un caso al siguiente.
    afterEach(() => {
      h.billing.failAmountUpdates = 0;
      h.billing.appliedThenTimeoutAmountUpdates = 0;
      h.billing.rejectAmountUpdates = 0;
    });
    const requestChange = (p: Pro) => h.http.post(`${API}/billing/pro/plan-change`).set(auth(p.token)).send({});
    const cancelChange = (p: Pro) => h.http.post(`${API}/billing/pro/plan-change/cancel`).set(auth(p.token)).send({});
    const amountCalls = (amount: number) => h.billing.calls.filter((c) => c === `update-amount:${amount}`).length;

    function webhook(topic: 'subscription_preapproval' | 'subscription_authorized_payment', id: string) {
      const requestId = randomUUID();
      const ts = String(Math.floor(Date.now() / 1000));
      const hash = createHmac('sha256', TEST_MP_WEBHOOK_SECRET)
        .update(`id:${id.toLowerCase()};request-id:${requestId};ts:${ts};`)
        .digest('hex');
      return h.http
        .post(`${API}/webhooks/mercado-pago/subscriptions?data.id=${encodeURIComponent(id)}&type=${topic}`)
        .set('x-signature', `ts=${ts},v1=${hash}`)
        .set('x-request-id', requestId)
        .send({ action: 'updated', type: topic, data: { id } });
    }

    /** PRO pago por Mercado Pago, con el primer cobro aprobado y el próximo a ~30 días. */
    async function subscribed(label: string) {
      const p = await pro(label);
      const { subscriptionId } = (await h.http.post(`${API}/billing/pro/checkout`).set(auth(p.token)).send({}).expect(200)).body;
      const providerId = await providerIdOf(subscriptionId);
      h.billing.authorize(providerId);
      await webhook('subscription_preapproval', providerId).expect(200);
      const first = h.billing.charge(providerId, 'approved');
      await webhook('subscription_authorized_payment', first.id).expect(200);
      expect((await me(p)).plan).toMatchObject({ tier: 'PRO', source: 'BILLING' });
      return { p, subscriptionId, providerId };
    }
    /** El cobro del ciclo siguiente (con el monto que tenga el preapproval en el proveedor) y su aviso. */
    async function renewal(providerId: string, outcome: 'approved' | 'rejected', amount?: number) {
      const charge = h.billing.charge(providerId, outcome, amount === undefined ? {} : { amount });
      await webhook('subscription_authorized_payment', charge.id).expect(200);
      return charge;
    }

    it('pedido: queda CONFIRMADO por el proveedor sin cobrar ni crear otra suscripción; el plan sigue PRO', async () => {
      const { p, subscriptionId, providerId } = await subscribed('confirma');
      const creates = h.billing.calls.filter((c) => c.startsWith('create')).length;
      const before = await status(p);
      expect(before.planChangeOptions).toMatchObject({ available: true, reason: null, tier: 'PRO_PLUS', amount: 24900, minHoursBeforeCharge: 24 });

      const res = (await requestChange(p).expect(200)).body;
      expect(res.subscription.planChange).toMatchObject({ state: 'CONFIRMED', tier: 'PRO_PLUS', amount: 24900 });
      expect(res.subscription.planChange.effectiveAt).toBe(res.subscription.nextPaymentAt);
      expect(res.plan).toBe('PRO');
      const r = await row(subscriptionId);
      expect(r).toMatchObject({ plan_tier: 'PRO', current_amount: 15000, pending_amount: 24900, pending_previous_amount: 15000 });
      expect(r.pending_confirmed_at).not.toBeNull();
      expect(h.billing.subscriptions.get(providerId)?.amount).toBe(24900);
      expect(h.billing.calls.filter((c) => c.startsWith('create')).length).toBe(creates); // ninguna suscripción nueva
      expect(await noticeTypes(p)).toContain('PRO_PLAN_CHANGE_SCHEDULED');
      expect((await me(p)).plan.tier).toBe('PRO');
      // Un aviso de preapproval no pisa el monto que hoy se cobra.
      await webhook('subscription_preapproval', providerId).expect(200);
      expect((await status(p)).subscription).toMatchObject({ currentAmount: 15000, planTier: 'PRO' });
    });

    it('doble click simultáneo: un solo pedido al proveedor y un solo aviso', async () => {
      const { p } = await subscribed('doble');
      const before = amountCalls(24900);
      const [a, b] = await Promise.all([requestChange(p), requestChange(p)]);
      expect([a.status, b.status]).toEqual([200, 200]);
      expect(amountCalls(24900)).toBe(before + 1);
      expect((await noticeTypes(p)).filter((t) => t === 'PRO_PLAN_CHANGE_SCHEDULED')).toHaveLength(1);
    });

    it('ACTIVO solo con el cobro de Plus aprobado: monto, plan y aviso cambian juntos', async () => {
      const { p, subscriptionId, providerId } = await subscribed('activa');
      await requestChange(p).expect(200);
      expect((await me(p)).plan.tier).toBe('PRO');
      await renewal(providerId, 'approved'); // cobra lo que el preapproval tiene: 24.900
      const r = await row(subscriptionId);
      expect(r).toMatchObject({ plan_tier: 'PRO_PLUS', current_amount: 24900, base_amount: 24900, pending_plan_tier: null, pending_amount: null });
      expect(r.plan_changed_at).not.toBeNull();
      const m = await me(p);
      expect(m.plan).toMatchObject({ tier: 'PRO_PLUS', source: 'BILLING' });
      expect(m.plan.entitlements.portfolioWorkLimit).toBe(30);
      expect(await noticeTypes(p)).toEqual(expect.arrayContaining(['PRO_PLAN_CHANGE_SCHEDULED', 'PRO_PLAN_CHANGE_ACTIVATED']));
      const s = await status(p);
      expect(s.subscription).toMatchObject({ planTier: 'PRO_PLUS', planChange: null });
      expect(s.planChangeOptions).toBeNull();
      // Repetir el aviso del mismo cobro no activa ni notifica dos veces.
      await webhook('subscription_authorized_payment', h.billing.payments.keys().next().value as string).expect(200);
      expect((await noticeTypes(p)).filter((t) => t === 'PRO_PLAN_CHANGE_ACTIVATED')).toHaveLength(1);
    });

    it('un cobro con el monto ANTERIOR no activa Plus: sigue PRO con el cambio pendiente', async () => {
      const { p, subscriptionId, providerId } = await subscribed('anterior');
      await requestChange(p).expect(200);
      await renewal(providerId, 'approved', 15000);
      const r = await row(subscriptionId);
      expect(r).toMatchObject({ plan_tier: 'PRO', current_amount: 15000, pending_amount: 24900 });
      expect((await me(p)).plan.tier).toBe('PRO');
      expect((await status(p)).subscription.planChange).toMatchObject({ state: 'CONFIRMED' });
      expect(await noticeTypes(p)).not.toContain('PRO_PLAN_CHANGE_ACTIVATED');
    });

    it('cobro de Plus rechazado: mora con la gracia de PRO, nunca Plus; si después se aprueba, activa', async () => {
      const { p, subscriptionId, providerId } = await subscribed('mora');
      await requestChange(p).expect(200);
      await renewal(providerId, 'rejected');
      expect((await row(subscriptionId)).status).toBe('PAST_DUE');
      expect((await me(p)).plan.tier).toBe('PRO');
      expect((await row(subscriptionId)).plan_tier).toBe('PRO');
      expect((await profileRow(p)).billing_plus_until).toBeNull();
      await renewal(providerId, 'approved');
      expect((await row(subscriptionId))).toMatchObject({ status: 'ACTIVE', plan_tier: 'PRO_PLUS' });
    });

    it('descartar el cambio: el proveedor vuelve al monto anterior y no queda nada pendiente', async () => {
      const { p, subscriptionId, providerId } = await subscribed('descarta');
      await requestChange(p).expect(200);
      const res = (await cancelChange(p).expect(200)).body;
      expect(res.subscription.planChange).toBeNull();
      expect(h.billing.subscriptions.get(providerId)?.amount).toBe(15000);
      expect(await row(subscriptionId)).toMatchObject({ pending_plan_tier: null, plan_tier: 'PRO' });
      expect((await cancelChange(p).expect(409)).body.code).toBe('PLAN_CHANGE_NONE');
      // El próximo cobro es el de siempre.
      await renewal(providerId, 'approved');
      expect((await me(p)).plan.tier).toBe('PRO');
    });

    it('descartar con el proveedor caído: queda DESCARTANDO y el job lo completa', async () => {
      const { p, subscriptionId, providerId } = await subscribed('descarta-cae');
      await requestChange(p).expect(200);
      h.billing.failAmountUpdates = 2; // el pedido de descarte y el reintento que hace el siguiente pedido
      const res = (await cancelChange(p).expect(200)).body;
      expect(res.subscription.planChange).toMatchObject({ state: 'REVERTING' });
      expect(h.billing.subscriptions.get(providerId)?.amount).toBe(24900);
      expect((await requestChange(p).expect(409)).body.code).toBe('PLAN_CHANGE_IN_PROGRESS');
      await reconciler.reconcileAll();
      expect(h.billing.subscriptions.get(providerId)?.amount).toBe(15000);
      expect((await row(subscriptionId)).pending_plan_tier).toBeNull();
    });

    it('timeout sin aplicarse: queda SOLICITADO (sin aviso de programado) y el job lo confirma', async () => {
      const { p, subscriptionId } = await subscribed('timeout');
      h.billing.failAmountUpdates = 1;
      const res = (await requestChange(p).expect(200)).body;
      expect(res.subscription.planChange).toMatchObject({ state: 'REQUESTED', effectiveAt: null });
      expect(await noticeTypes(p)).not.toContain('PRO_PLAN_CHANGE_SCHEDULED');
      expect((await me(p)).plan.tier).toBe('PRO');
      await reconciler.reconcileAll();
      expect((await status(p)).subscription.planChange).toMatchObject({ state: 'CONFIRMED' });
      expect(await noticeTypes(p)).toContain('PRO_PLAN_CHANGE_SCHEDULED');
      expect((await row(subscriptionId)).pending_attempts).toBe(2);
    });

    it('timeout DESPUÉS de aplicarse: la lectura fresca lo confirma sin repetir el pedido', async () => {
      const { p } = await subscribed('ambiguo');
      h.billing.appliedThenTimeoutAmountUpdates = 1;
      const before = amountCalls(24900);
      const res = (await requestChange(p).expect(200)).body;
      expect(res.subscription.planChange).toMatchObject({ state: 'CONFIRMED' });
      expect(amountCalls(24900)).toBe(before + 1);
    });

    it('el proveedor lo rechaza (4xx): 502, nada pendiente, plan y monto intactos, sin aviso', async () => {
      const { p, subscriptionId, providerId } = await subscribed('rechaza');
      h.billing.rejectAmountUpdates = 1;
      expect((await requestChange(p).expect(502)).body.code).toBe('BILLING_PROVIDER_ERROR');
      expect(await row(subscriptionId)).toMatchObject({ pending_plan_tier: null, current_amount: 15000 });
      expect(h.billing.subscriptions.get(providerId)?.amount).toBe(15000);
      expect(await noticeTypes(p)).not.toContain('PRO_PLAN_CHANGE_SCHEDULED');
    });

    it('sin margen antes del cobro: 409 y ningún pedido al proveedor; un SOLICITADO que pierde el margen se descarta', async () => {
      const { p, subscriptionId, providerId } = await subscribed('margen');
      h.billing.subscriptions.get(providerId)!.nextPaymentDate = new Date(Date.now() + 2 * HOUR);
      const calls = amountCalls(24900);
      const res = await requestChange(p).expect(409);
      expect(res.body.code).toBe('PLAN_CHANGE_TOO_CLOSE');
      expect(amountCalls(24900)).toBe(calls);
      expect((await status(p)).planChangeOptions).toMatchObject({ available: false, reason: 'TOO_CLOSE' });

      const other = await subscribed('margen-job');
      h.billing.failAmountUpdates = 1;
      await requestChange(other.p).expect(200); // SOLICITADO
      h.billing.subscriptions.get(other.providerId)!.nextPaymentDate = new Date(Date.now() + 2 * HOUR);
      await reconciler.reconcileAll();
      expect((await row(other.subscriptionId)).pending_plan_tier).toBeNull();
      expect(h.billing.subscriptions.get(other.providerId)?.amount).toBe(15000);
      expect(subscriptionId).toBeTruthy();
    });

    it('tras agotar los intentos se descarta y el proveedor queda en el monto anterior', async () => {
      const { p, subscriptionId, providerId } = await subscribed('agota');
      h.billing.failAmountUpdates = 20;
      await requestChange(p).expect(200);
      for (let i = 0; i < 6; i++) await reconciler.reconcileAll();
      expect((await row(subscriptionId)).pending_plan_tier).toBeNull();
      expect(h.billing.subscriptions.get(providerId)?.amount).toBe(15000);
      expect((await me(p)).plan.tier).toBe('PRO');
    });

    it('cancelar la renovación descarta el cambio: un cobro tardío de Plus no activa nada', async () => {
      const { p, subscriptionId, providerId } = await subscribed('cancela');
      await requestChange(p).expect(200);
      await h.http.post(`${API}/billing/pro/cancel`).set(auth(p.token)).send({}).expect(200);
      expect(await row(subscriptionId)).toMatchObject({ status: 'CANCELLED', pending_plan_tier: null, plan_tier: 'PRO' });
      await renewal(providerId, 'approved');
      expect((await row(subscriptionId)).plan_tier).toBe('PRO');
      expect(await noticeTypes(p)).not.toContain('PRO_PLAN_CHANGE_ACTIVATED');
    });

    it('oferta de bienvenida: sin cambio mientras su precio normal está pendiente; el precio normal no pisa un cambio pendiente', async () => {
      const { p, subscriptionId, providerId } = await subscribed('oferta');
      await h.dataSource.query(
        `UPDATE billing_subscriptions SET offer_code = 'PRO_FIRST_MONTH_20', offer_cycles = 5, offer_redeemed_at = now() WHERE id = $1`,
        [subscriptionId],
      );
      const blocked = await requestChange(p).expect(409);
      expect(blocked.body).toMatchObject({ code: 'PLAN_CHANGE_NOT_ALLOWED', details: { reason: 'OFFER_PENDING' } });
      expect((await status(p)).planChangeOptions).toMatchObject({ available: false, reason: 'OFFER_PENDING' });

      await h.dataSource.query(
        `UPDATE billing_subscriptions SET offer_code = NULL, offer_cycles = NULL, offer_redeemed_at = NULL WHERE id = $1`,
        [subscriptionId],
      );
      await requestChange(p).expect(200);
      expect(h.billing.subscriptions.get(providerId)?.amount).toBe(24900);
      await h.dataSource.query(
        `UPDATE billing_subscriptions SET offer_code = 'PRO_FIRST_MONTH_20', offer_cycles = 1, offer_redeemed_at = now() WHERE id = $1`,
        [subscriptionId],
      );
      const calls = amountCalls(15000);
      expect(await reconciler.applyRegularPrice(subscriptionId)).toBe('SKIPPED');
      expect(amountCalls(15000)).toBe(calls);
      expect(h.billing.subscriptions.get(providerId)?.amount).toBe(24900);
    });

    it('no corresponde sin una suscripción de Mercado Pago activa de PRO', async () => {
      const manual = await pro('manual');
      await h.dataSource.query(`UPDATE professional_profiles SET plan_tier = 'PRO' WHERE id = $1`, [manual.proId]);
      expect((await status(manual)).planChangeOptions).toBeNull();
      expect((await requestChange(manual).expect(409)).body.code).toBe('PLAN_CHANGE_NOT_ALLOWED');
      const free = await pro('free');
      expect((await requestChange(free).expect(409)).body.code).toBe('PLAN_CHANGE_NOT_ALLOWED');
      const bad = await pro('plan-raro');
      await h.http.post(`${API}/billing/pro/plan-change`).set(auth(bad.token)).send({ plan: 'PRO' }).expect(400);
      await h.http.post(`${API}/billing/pro/plan-change`).set(auth(bad.token)).send({ amount: 1 }).expect(400);
      await h.http.post(`${API}/billing/pro/plan-change`).expect(401);
    });
  });
});
