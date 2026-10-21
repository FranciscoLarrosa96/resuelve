import { BillingService } from '../src/billing/billing.service';
import { ProfessionalProfile } from '../src/professionals/professional-profile.entity';
import { PlanTier } from '../src/professionals/professional.enums';
import { randomUUID } from 'crypto';
import { BillingReconciler } from '../src/billing/billing-reconciler.service';
import { TransferService } from '../src/billing/transfer/transfer.service';
import { describeE2E, Harness, startApp } from './app.harness';

const API = '/api/v1';
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

describeE2E('PRO Plus: contratación, permisos y portfolio', () => {
  let h: Harness;
  let serviceId: string;
  let zoneId: string;
  async function user(label: string, professional = true) {
    const email = `plus-${randomUUID()}@test.dev`;
    const registration = await h.http.post(`${API}/auth/register`).send({ firstName: label, lastName: 'Prueba', email, password: 'una-clave-bien-larga' }).expect(201);
    const token = registration.body.accessToken as string;
    const [{ id: userId }] = await h.dataSource.query(`SELECT id FROM users WHERE email = $1`, [email]);
    let id = '';
    if (professional) id = (await h.http.post(`${API}/pro/profile`).set(auth(token)).send({ headline: 'Plomería en Tandil', yearsExperience: 3, serviceIds: [serviceId], zoneIds: [zoneId] }).expect(201)).body.id;
    return { id, token, userId: userId as string };
  }
  type Pro = Awaited<ReturnType<typeof user>>;
  const me = async (p: Pro) => (await h.http.get(`${API}/pro/me`).set(auth(p.token)).expect(200)).body;
  const setPlan = (p: Pro, tier: string) => h.dataSource.query(`UPDATE professional_profiles SET plan_tier = $2 WHERE id = $1`, [p.id, tier]);
  async function work(p: Pro, title: string) {
    const res = await h.http.post(`${API}/pro/profile/works`).set(auth(p.token)).send({ title, doneOn: '2025-01' }).expect(201);
    return res.body.items.find((w: { title: string }) => w.title === title).id as string;
  }
  async function photo(p: Pro, workId: string) {
    const ticket = (await h.http.post(`${API}/pro/profile/work-photos/sign`).set(auth(p.token)).send({ workId }).expect(201)).body;
    h.avatars.upload(ticket.publicId);
    const list = (await h.http.post(`${API}/pro/profile/work-photos`).set(auth(p.token)).send({ workId, publicId: ticket.publicId }).expect(201)).body;
    return list.items.find((w: { id: string }) => w.id === workId).photos.at(-1).id as string;
  }
  const patchWork = (p: Pro, id: string, body: object) => h.http.patch(`${API}/pro/profile/works/${id}`).set(auth(p.token)).send(body);

  beforeAll(async () => {
    h = await startApp({ emailVerification: false });
    serviceId = (await h.http.get(`${API}/services`).expect(200)).body.find((s: { slug: string }) => s.slug === 'plomeria').id;
    zoneId = (await h.http.get(`${API}/zones?city=tandil`).expect(200)).body.find((z: { slug: string }) => z.slug === 'centro').id;
  }, 60000);
  afterAll(async () => { await h?.app.close(); });

  it('publica Gratis y PRO con precios del servidor y no acepta un tier o monto arbitrario', async () => {
    expect((await h.http.get(`${API}/plans`).expect(200)).body).toMatchObject({ pro: { monthlyPriceArs: 15000 } });
    const p = await user('Precios');
    await h.http.post(`${API}/billing/pro/checkout`).set(auth(p.token)).send({ plan: 'FREE' }).expect(400);
    await h.http.post(`${API}/billing/pro/checkout`).set(auth(p.token)).send({ plan: 'PRO_PLUS', amount: 1 }).expect(400);
    await h.http.post(`${API}/billing/pro/checkout`).set(auth(p.token)).send({ plan: 'PRO_PLUS' }).expect(200);
    expect((await me(p)).plan.tier).toBe('FREE');
    const status = (await h.http.get(`${API}/billing/pro/status`).set(auth(p.token)).expect(200)).body;
    expect(status.subscription).toMatchObject({ planTier: 'PRO', baseAmount: 15000 });
    expect(status.plusCheckoutPrice).toBeNull();
    expect(status.planChangeOptions).toBeNull();
    expect((await h.http.get(`${API}/plans`).expect(200)).body.proPlus).toBeUndefined();
  });

  it('conserva un checkout histórico Plus, su precio y sus beneficios bajo el nombre PRO', async () => {
    const p = await user('Compra');
    const first = (await h.http.post(`${API}/billing/pro/checkout`).set(auth(p.token)).send({}).expect(200)).body;
    // Fixture de una contratación histórica: el endpoint público ya solo vende PRO.
    const plus = await h.app.get(BillingService).checkout(await h.dataSource.getRepository(ProfessionalProfile).findOneByOrFail({ id: p.id }), p.userId, undefined, PlanTier.PRO_PLUS);
    expect(plus.subscriptionId).not.toBe(first.subscriptionId);
    const [row] = await h.dataSource.query(`SELECT * FROM billing_subscriptions WHERE id = $1`, [plus.subscriptionId]);
    expect(row).toMatchObject({ plan_tier: 'PRO_PLUS', current_amount: 24900, base_amount: 24900, offer_code: null });
    h.billing.authorize(row.provider_subscription_id);
    await h.app.get(BillingReconciler).reconcileById(row.id);
    expect((await me(p)).plan).toMatchObject({ tier: 'PRO', source: 'BILLING', entitlements: { portfolioWorkLimit: 30, canExportQuotePdf: true } });
    h.billing.charge(row.provider_subscription_id, 'approved');
    await h.app.get(BillingReconciler).reconcileById(row.id);
    await h.http.post(`${API}/billing/pro/cancel`).set(auth(p.token)).expect(200);
    expect((await me(p)).plan.tier).toBe('PRO');
    await h.http.post(`${API}/billing/pro/checkout`).set(auth(p.token)).send({ plan: 'PRO' }).expect(409);
    await h.dataSource.query(`UPDATE professional_profiles SET billing_pro_until = now() - interval '1 second', billing_plus_until = now() - interval '1 second' WHERE id = $1`, [p.id]);
    expect((await me(p)).plan.tier).toBe('FREE');
  });

  it('Plus admite 30 trabajos, máximo 3 fijados concurrentes; al unificar a PRO conserva todos', async () => {
    const p = await user('Portfolio');
    await setPlan(p, 'PRO_PLUS');
    const ids: string[] = [];
    for (let i = 0; i < 30; i++) ids.push(await work(p, `Obra ${i}`));
    await h.http.post(`${API}/pro/profile/works`).set(auth(p.token)).send({ title: 'No entra', doneOn: '2025-01' }).expect(409);
    const results = await Promise.all(ids.slice(0, 4).map((id) => patchWork(p, id, { pinned: true })));
    expect(results.filter((r) => r.status === 200)).toHaveLength(3);
    expect(results.filter((r) => r.status === 409)).toHaveLength(1);
    await setPlan(p, 'PRO');
    const downgraded = (await h.http.get(`${API}/pro/profile/works`).set(auth(p.token)).expect(200)).body;
    expect(downgraded).toMatchObject({ maxWorks: 30, activeWorks: 30 });
    expect(downgraded.items).toHaveLength(30);
    await patchWork(p, ids[0], { pinned: true }).expect(200);
  });

  it('antes/después exige dos fotos distintas del propio trabajo; al unificar a PRO conserva el formato y las fotos', async () => {
    const p = await user('Comparación');
    await setPlan(p, 'PRO_PLUS');
    const id = await work(p, 'Baño');
    const before = await photo(p, id);
    const after = await photo(p, id);
    const otherWork = await work(p, 'Cocina');
    const otherPhoto = await photo(p, otherWork);
    await patchWork(p, id, { beforePhotoId: before, afterPhotoId: before }).expect(422);
    await patchWork(p, id, { beforePhotoId: before, afterPhotoId: otherPhoto }).expect(422);
    await patchWork(p, id, { beforePhotoId: before, afterPhotoId: after, pinned: true }).expect(200);
    let shown = (await h.http.get(`${API}/professionals/${p.id}`).expect(200)).body.works;
    expect(shown[0]).toMatchObject({ id, pinned: true, beforePhotoId: before, afterPhotoId: after });
    await setPlan(p, 'PRO');
    shown = (await h.http.get(`${API}/professionals/${p.id}`).expect(200)).body.works;
    expect(shown.find((w: { id: string }) => w.id === id)).toMatchObject({ pinned: true, beforePhotoId: before, afterPhotoId: after, photos: expect.any(Array) });
    await setPlan(p, 'PRO_PLUS');
    await h.http.delete(`${API}/pro/profile/work-photos/${before}`).set(auth(p.token)).expect(200);
    const [row] = await h.dataSource.query(`SELECT before_photo_id, after_photo_id FROM professional_works WHERE id = $1`, [id]);
    expect(row).toEqual({ before_photo_id: null, after_photo_id: null });
  });

  it('la transferencia conserva el plan elegido y no activa Plus antes del comienzo de un período futuro', async () => {
    const p = await user('Transferencia');
    const operator = await user('Operador', false);
    const service = h.app.get(TransferService);
    await service.setAccount({ enabled: true, holder: 'Cuenta Resuelve', alias: 'resuelve.pro', cbu: null, bank: null, cuit: null }, operator.userId);
    await h.dataSource.query(`UPDATE professional_profiles SET bonus_pro_until = now() + interval '7 days' WHERE id = $1`, [p.id]);
    const requested = (await service.request(p.id, 1, PlanTier.PRO_PLUS)).pending;
    expect(requested).toMatchObject({ planTier: 'PRO_PLUS', amountArs: 24900 });
    await h.http.post(`${API}/billing/transfer/submit`).set(auth(p.token)).send({}).expect(200);
    await service.approve(requested!.id, operator.userId);
    expect((await me(p)).plan.tier).toBe('PRO');
    await h.dataSource.query(`UPDATE professional_profiles SET bonus_pro_until = NULL, transfer_plus_from = now() - interval '1 minute' WHERE id = $1`, [p.id]);
    expect((await me(p)).plan).toMatchObject({ tier: 'PRO', entitlements: { portfolioWorkLimit: 30, canPinWorks: true, canUseBeforeAfter: true, canExportQuotePdf: true, canExportAnalytics: true } });
  });

  it('CSV y PDF son privados, requieren PRO y el PDF usa el presupuesto real', async () => {
    const p = await user('Exportaciones');
    const other = await user('Ajeno');
    const client = await user('Cliente', false);
    await h.http.get(`${API}/pro/analytics/month/export`).set(auth(p.token)).expect(403);
    await setPlan(p, 'PRO_PLUS');
    const request = (await h.http.post(`${API}/requests`).set(auth(client.token)).send({ serviceId, zoneId, title: 'Canilla pierde agua', description: 'Gotea debajo de la mesada.', exactAddress: 'Dirección privada 123', urgency: 'FLEXIBLE' }).expect(201)).body;
    await h.http.post(`${API}/requests/${request.id}/invitations`).set(auth(client.token)).send({ professionalIds: [p.id] }).expect(200);
    const quote = (await h.http.post(`${API}/pro/requests/${request.id}/quote`).set(auth(p.token)).send({ description: 'Reemplazo de canilla', laborAmount: 20000, materialsAmount: 3000, items: [] }).expect(201)).body;
    const pdf = await h.http.get(`${API}/pro/quotes/${quote.id}/pdf`).set(auth(p.token)).expect(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    expect(Buffer.from(pdf.body).subarray(0, 4).toString()).toBe('%PDF');
    expect(pdf.headers['cache-control']).toContain('no-store');
    await setPlan(other, 'PRO_PLUS');
    await h.http.get(`${API}/pro/quotes/${quote.id}/pdf`).set(auth(other.token)).expect(404);
    await h.http.get(`${API}/pro/quotes/${quote.id}/pdf`).expect(401);
    await setPlan(p, 'PRO');
    await h.http.get(`${API}/pro/quotes/${quote.id}/pdf`).set(auth(p.token)).expect(200);
    await setPlan(p, 'PRO_PLUS');
    const csv = await h.http.get(`${API}/pro/analytics/month/export`).set(auth(p.token)).expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain('Presupuestos enviados');
    expect(csv.text).not.toContain('Dirección privada');
    await h.http.get(`${API}/pro/analytics/month/export?month=13`).set(auth(p.token)).expect(400);
  });
});
