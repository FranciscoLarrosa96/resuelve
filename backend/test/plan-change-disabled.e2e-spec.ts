import { randomUUID } from 'crypto';
import { TransferService } from '../src/billing/transfer/transfer.service';
import { describeE2E, Harness, startApp } from './app.harness';

const API = '/api/v1';
const PASSWORD = 'una-clave-bien-larga';
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/**
 * Las funciones nuevas de cobro del cambio PRO → PRO Plus vienen APAGADAS: sin
 * `PLAN_CHANGE_TRANSFER_ENABLED` / `PLAN_CHANGE_MP_ENABLED` todo se comporta como antes.
 */
describeE2E('Cambio programado PRO → PRO Plus apagado (e2e)', () => {
  let h: Harness;
  const svc: Record<string, string> = {};
  const zone: Record<string, string> = {};

  async function pro(label: string) {
    const email = `${label}-${randomUUID().slice(0, 8)}@test.dev`;
    const reg = await h.http.post(`${API}/auth/register`).send({ firstName: label, lastName: 'Off', email, password: PASSWORD }).expect(201);
    const token = reg.body.accessToken as string;
    const res = await h.http
      .post(`${API}/pro/profile`)
      .set(auth(token))
      .send({ headline: `${label} en Tandil`, yearsExperience: 3, serviceIds: [svc.plomeria], zoneIds: [zone['villa-italia']] })
      .expect(201);
    const [{ id: userId }] = await h.dataSource.query(`SELECT id FROM users WHERE email = $1`, [email]);
    return { token, proId: res.body.id as string, userId: userId as string };
  }

  beforeAll(async () => {
    delete process.env.PLAN_CHANGE_TRANSFER_ENABLED;
    delete process.env.PLAN_CHANGE_MP_ENABLED;
    h = await startApp({ emailVerification: false });
    for (const s of (await h.http.get(`${API}/services`).expect(200)).body) svc[s.slug] = s.id;
    for (const z of (await h.http.get(`${API}/zones?city=tandil`).expect(200)).body) zone[z.slug] = z.id;
  }, 60_000);

  afterAll(async () => {
    await h?.app.close();
  });

  it('transferencia: con PRO vigente Plus no se ofrece ni se acepta (como antes)', async () => {
    const p = await pro('transfer-off');
    const transfers = h.app.get(TransferService);
    await transfers.setAccount({ enabled: true, holder: 'Cuenta Resuelve', alias: 'resuelve.pro', cbu: null, bank: null, cuit: null }, p.userId);
    const pending = (await h.http.post(`${API}/billing/transfer`).set(auth(p.token)).send({ months: 1 }).expect(200)).body.pending;
    await h.http.post(`${API}/billing/transfer/submit`).set(auth(p.token)).send({}).expect(200);
    const op = await pro('operador-off');
    await transfers.approve(pending.id, op.userId);

    const o = (await h.http.get(`${API}/billing/transfer`).set(auth(p.token)).expect(200)).body;
    expect(o).toMatchObject({ scheduledPlus: false, plusOptions: [], currentTier: 'PRO' });
    const res = await h.http.post(`${API}/billing/transfer`).set(auth(p.token)).send({ months: 1, plan: 'PRO_PLUS' }).expect(409);
    expect(res.body.code).toBe('TRANSFER_BLOCKED');
  });

  it('Mercado Pago: sin opción en el estado y el pedido responde 503 sin tocar al proveedor', async () => {
    const p = await pro('mp-off');
    const { subscriptionId } = (await h.http.post(`${API}/billing/pro/checkout`).set(auth(p.token)).send({}).expect(200)).body;
    const [{ provider_subscription_id: providerId }] = await h.dataSource.query(
      `SELECT provider_subscription_id FROM billing_subscriptions WHERE id = $1`,
      [subscriptionId],
    );
    h.billing.authorize(providerId);
    await h.dataSource.query(`UPDATE billing_subscriptions SET status = 'ACTIVE', authorized_at = now() WHERE id = $1`, [subscriptionId]);
    await h.dataSource.query(`UPDATE professional_profiles SET billing_pro_until = now() + interval '30 days' WHERE id = $1`, [p.proId]);
    const calls = h.billing.calls.length;
    const status = (await h.http.get(`${API}/billing/pro/status`).set(auth(p.token)).expect(200)).body;
    expect(status.planChangeOptions).toBeNull();
    const res = await h.http.post(`${API}/billing/pro/plan-change`).set(auth(p.token)).send({}).expect(503);
    expect(res.body.code).toBe('PLAN_CHANGE_NOT_AVAILABLE');
    expect(h.billing.calls.slice(calls).some((c) => c.startsWith('update-amount'))).toBe(false);
  });
});
