import { randomUUID } from 'crypto';
import { describeE2E, Harness, startApp } from './app.harness';
import { TransferService } from '../src/billing/transfer/transfer.service';
import { User } from '../src/users/user.entity';

const API = '/api/v1';
const PASSWORD = 'una-clave-bien-larga';
const DAY = 86_400_000;
/** CBU de ejemplo con dígitos verificadores válidos. */
const CBU = '2850590940090418135201';
const ACCOUNT = { enabled: true, holder: 'Francisco Larrosa', alias: 'resuelve.pro', cbu: CBU, bank: 'Banco Macro', cuit: '20-39550730-4' };

/**
 * PRO por transferencia: el profesional elige 1, 3 o 6 meses, transfiere con
 * el código y avisa (comprobante opcional); un admin confirma o rechaza.
 * Prepago, sin renovación; se apila sobre PRO vigente; arrepentimiento con
 * devolución a mano; el admin puede anotar un pago recibido por fuera.
 */
describeE2E('PRO por transferencia (e2e)', () => {
  let h: Harness;
  const svc: Record<string, string> = {};
  const zone: Record<string, string> = {};
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  let admin: { email: string; token: string; userId: string };

  async function user(label: string, asPro = true) {
    const email = `${label}-${randomUUID().slice(0, 8)}@test.dev`;
    const reg = await h.http
      .post(`${API}/auth/register`)
      .send({ firstName: label, lastName: 'Transfer', email, password: PASSWORD })
      .expect(201);
    const token = reg.body.accessToken as string;
    let profileId = '';
    if (asPro) {
      const res = await h.http
        .post(`${API}/pro/profile`)
        .set(auth(token))
        .send({ headline: `${label} en Tandil`, yearsExperience: 3, serviceIds: [svc.plomeria], zoneIds: [zone['villa-italia']] })
        .expect(201);
      profileId = res.body.id;
    }
    const [{ id: userId }] = await h.dataSource.query(`SELECT id FROM users WHERE email = $1`, [email]);
    return { email, token, userId: userId as string, profileId };
  }

  const overview = async (token: string) =>
    (await h.http.get(`${API}/billing/transfer`).set(auth(token)).expect(200)).body;
  const plan = async (token: string) => (await h.http.get(`${API}/pro/me`).set(auth(token)).expect(200)).body.plan;
  const profileRow = async (id: string) =>
    (await h.dataSource.query(`SELECT * FROM professional_profiles WHERE id = $1`, [id]))[0];
  const notificationTypes = async (userId: string): Promise<string[]> =>
    (await h.dataSource.query(`SELECT type FROM notifications WHERE user_id = $1 ORDER BY created_at`, [userId])).map(
      (r: { type: string }) => r.type,
    );
  /** Pide el período y avisa que transfirió (con o sin comprobante). */
  async function requestAndSubmit(token: string, months: number, withProof = true) {
    await h.http.post(`${API}/billing/transfer`).set(auth(token)).send({ months }).expect(200);
    let proofPublicId: string | undefined;
    if (withProof) {
      const ticket = (await h.http.post(`${API}/billing/transfer/proof/upload`).set(auth(token)).expect(200)).body;
      h.storage.upload(ticket.publicId, 'jpg');
      proofPublicId = ticket.publicId;
    }
    const body = (await h.http.post(`${API}/billing/transfer/submit`).set(auth(token)).send({ proofPublicId }).expect(200)).body;
    return body.pending as { id: string; reference: string; status: string; amountArs: number };
  }

  beforeAll(async () => {
    h = await startApp({ emailVerification: false });
    for (const s of (await h.http.get(`${API}/services`).expect(200)).body) svc[s.slug] = s.id;
    for (const z of (await h.http.get(`${API}/zones?city=tandil`).expect(200)).body) zone[z.slug] = z.id;
    admin = await user('operador', false);
    await h.dataSource.getRepository(User).update({ email: admin.email }, { isAdmin: true });
  }, 60_000);

  afterAll(async () => {
    await h?.app.close();
  });

  it('sin datos bancarios la opción no existe; el panel es solo para admins', async () => {
    const pro = await user('sindatos');
    const o = await overview(pro.token);
    expect(o).toMatchObject({ available: false, account: null, options: [], pending: null });
    const res = await h.http.post(`${API}/billing/transfer`).set(auth(pro.token)).send({ months: 1 }).expect(503);
    expect(res.body.code).toBe('TRANSFER_NOT_AVAILABLE');
    for (const path of ['transfers', 'transfer-account']) {
      await h.http.get(`${API}/admin/${path}`).set(auth(pro.token)).expect(404);
    }
    await h.http.put(`${API}/admin/transfer-account`).set(auth(pro.token)).send(ACCOUNT).expect(404);
  });

  it('el admin carga los datos bancarios (CBU con dígitos verificadores, alias válido)', async () => {
    for (const bad of [
      { ...ACCOUNT, cbu: '2850590940090418135202' },
      { ...ACCOUNT, alias: 'a b' },
      { ...ACCOUNT, holder: '' },
      { ...ACCOUNT, cuit: '123' },
    ]) {
      await h.http.put(`${API}/admin/transfer-account`).set(auth(admin.token)).send(bad).expect(400);
    }
    const res = await h.http.put(`${API}/admin/transfer-account`).set(auth(admin.token)).send(ACCOUNT).expect(200);
    expect(res.body).toMatchObject({ ...ACCOUNT, changedBy: admin.email });
    // Sin CBU también vale (solo alias).
    await h.http
      .put(`${API}/admin/transfer-account`)
      .set(auth(admin.token))
      .send({ ...ACCOUNT, cbu: '', bank: '', cuit: '' })
      .expect(200);
    await h.http.put(`${API}/admin/transfer-account`).set(auth(admin.token)).send(ACCOUNT).expect(200);
  });

  it('períodos de 1, 3 y 6 meses al precio vigente; la bienvenida solo en el primer mes', async () => {
    const pro = await user('periodos');
    const o = await overview(pro.token);
    expect(o.available).toBe(true);
    expect(o.account).toEqual({ holder: ACCOUNT.holder, alias: ACCOUNT.alias, cbu: CBU, bank: ACCOUNT.bank, cuit: ACCOUNT.cuit });
    expect(o.options.map((x: { months: number; amountArs: number; days: number }) => [x.months, x.days, x.amountArs])).toEqual([
      [1, 30, 15000],
      [3, 90, 45000],
      [6, 180, 90000],
    ]);
    // Reservó la bienvenida: $12.000 el primer mes y el resto a precio normal.
    await h.dataSource.query(`UPDATE professional_profiles SET pro_interest_offer_code = 'PRO_FIRST_MONTH_20' WHERE id = $1`, [
      pro.profileId,
    ]);
    const promo = await overview(pro.token);
    expect(promo.options.map((x: { amountArs: number }) => x.amountArs)).toEqual([12000, 42000, 87000]);
    expect(promo.options[0]).toMatchObject({ discountedFirstMonthArs: 12000, offerCode: 'PRO_FIRST_MONTH_20' });
    // El monto nunca viaja desde el frontend; períodos fuera de la lista → 400.
    for (const months of [0, 2, 12, 'x']) {
      await h.http.post(`${API}/billing/transfer`).set(auth(pro.token)).send({ months }).expect(400);
    }
    await h.http.post(`${API}/billing/transfer`).set(auth(pro.token)).send({ months: 1, amountArs: 1 }).expect(400);
  });

  it('pedir → código único; mismo período = mismo código; otro período lo reemplaza; descartar', async () => {
    const pro = await user('pedido');
    const a = (await h.http.post(`${API}/billing/transfer`).set(auth(pro.token)).send({ months: 3 }).expect(200)).body;
    expect(a.pending).toMatchObject({ status: 'AWAITING_PROOF', months: 3, amountArs: 45000, proofUploaded: false });
    expect(a.pending.reference).toMatch(/^RES-[A-HJ-NP-Z2-9]{6}$/);
    expect(a.options).toEqual([]);
    const again = (await h.http.post(`${API}/billing/transfer`).set(auth(pro.token)).send({ months: 3 }).expect(200)).body;
    expect(again.pending.reference).toBe(a.pending.reference);
    const other = (await h.http.post(`${API}/billing/transfer`).set(auth(pro.token)).send({ months: 1 }).expect(200)).body;
    expect(other.pending.reference).not.toBe(a.pending.reference);
    const [old] = await h.dataSource.query(`SELECT status FROM transfer_payments WHERE reference = $1`, [a.pending.reference]);
    expect(old.status).toBe('CANCELLED');
    const cancelled = (await h.http.delete(`${API}/billing/transfer/pending`).set(auth(pro.token)).expect(200)).body;
    expect(cancelled.pending).toBeNull();
    expect(cancelled.options).toHaveLength(3);
    const none = await h.http.delete(`${API}/billing/transfer/pending`).set(auth(pro.token)).expect(409);
    expect(none.body.code).toBe('TRANSFER_NO_PENDING');
  });

  it('comprobante: solo de su carpeta, formato real; en revisión no se cambia el período ni se descarta', async () => {
    const pro = await user('comprobante');
    const other = await user('ajeno');
    await h.http.post(`${API}/billing/transfer`).set(auth(pro.token)).send({ months: 1 }).expect(200);
    await h.http.post(`${API}/billing/transfer`).set(auth(other.token)).send({ months: 1 }).expect(200);
    const foreign = (await h.http.post(`${API}/billing/transfer/proof/upload`).set(auth(other.token)).expect(200)).body;
    h.storage.upload(foreign.publicId, 'pdf');
    await h.http.post(`${API}/billing/transfer/submit`).set(auth(pro.token)).send({ proofPublicId: foreign.publicId }).expect(404);
    const exe = (await h.http.post(`${API}/billing/transfer/proof/upload`).set(auth(pro.token)).expect(200)).body;
    h.storage.upload(exe.publicId, 'exe');
    const bad = await h.http.post(`${API}/billing/transfer/submit`).set(auth(pro.token)).send({ proofPublicId: exe.publicId }).expect(422);
    expect(bad.body.code).toBe('INVALID_DOCUMENT');
    expect(h.storage.destroyed).toContain(exe.publicId);

    const first = (await h.http.post(`${API}/billing/transfer/proof/upload`).set(auth(pro.token)).expect(200)).body;
    h.storage.upload(first.publicId, 'png');
    const sent = (await h.http.post(`${API}/billing/transfer/submit`).set(auth(pro.token)).send({ proofPublicId: first.publicId }).expect(200)).body;
    expect(sent.pending).toMatchObject({ status: 'IN_REVIEW', proofUploaded: true });
    // Reemplazar el comprobante en revisión borra el anterior.
    const second = (await h.http.post(`${API}/billing/transfer/proof/upload`).set(auth(pro.token)).expect(200)).body;
    h.storage.upload(second.publicId, 'pdf');
    await h.http.post(`${API}/billing/transfer/submit`).set(auth(pro.token)).send({ proofPublicId: second.publicId }).expect(200);
    expect(h.storage.destroyed).toContain(first.publicId);

    expect((await h.http.post(`${API}/billing/transfer`).set(auth(pro.token)).send({ months: 3 }).expect(409)).body.code).toBe(
      'TRANSFER_IN_REVIEW',
    );
    expect((await h.http.delete(`${API}/billing/transfer/pending`).set(auth(pro.token)).expect(409)).body.code).toBe(
      'TRANSFER_IN_REVIEW',
    );
  });

  it('el admin confirma: PRO por transferencia, avisos, bienvenida consumida y sin checkout de MP encima', async () => {
    const pro = await user('confirmado');
    await h.dataSource.query(`UPDATE professional_profiles SET pro_interest_offer_code = 'PRO_FIRST_MONTH_20' WHERE id = $1`, [
      pro.profileId,
    ]);
    const pending = await requestAndSubmit(pro.token, 1);
    expect(pending.amountArs).toBe(12000);

    const list = (await h.http.get(`${API}/admin/transfers`).set(auth(admin.token)).expect(200)).body;
    expect(list.counts.inReview).toBeGreaterThanOrEqual(1);
    const row = list.items.find((i: { id: string }) => i.id === pending.id);
    expect(row).toMatchObject({ status: 'IN_REVIEW', reference: pending.reference, hasProof: true, professional: { email: pro.email } });
    const detail = (await h.http.get(`${API}/admin/transfers/${pending.id}`).set(auth(admin.token)).expect(200)).body;
    expect(detail.proofUrl).toMatch(/^https:\/\/fake\.upload\.test\/download\//);

    const before = Date.now();
    const approved = (
      await h.http.post(`${API}/admin/transfers/${pending.id}/approve`).set(auth(admin.token)).send({ note: 'Macro 9/10' }).expect(200)
    ).body;
    expect(approved).toMatchObject({ status: 'APPROVED', adminNote: 'Macro 9/10', reviewerEmail: admin.email });
    const end = new Date(approved.periodEnd).getTime();
    expect(end - before).toBeGreaterThanOrEqual(30 * DAY - 5_000);
    expect(end - before).toBeLessThanOrEqual(30 * DAY + 5_000);

    expect(await plan(pro.token)).toMatchObject({ tier: 'PRO', source: 'TRANSFER', entitlementSource: 'TRANSFER_PRO' });
    const o = await overview(pro.token);
    expect(o.pending).toBeNull();
    expect(o.last).toMatchObject({ status: 'APPROVED', reference: pending.reference });
    expect(new Date(o.proUntil).getTime()).toBe(end);
    expect(o.withdrawal).toMatchObject({ paymentId: pending.id, amountArs: 12000 });
    expect(await notificationTypes(pro.userId)).toContain('PRO_TRANSFER_APPROVED');

    const p = await profileRow(pro.profileId);
    expect(p.first_paid_pro_at).not.toBeNull();
    const [redeemed] = await h.dataSource.query(
      `SELECT discounted_price_ars, base_price_ars FROM pro_offer_redemptions WHERE professional_id = $1`,
      [pro.profileId],
    );
    expect(redeemed).toMatchObject({ discounted_price_ars: 12000, base_price_ars: 15000 });
    const funnel = await h.dataSource.query(
      `SELECT type FROM pro_funnel_events WHERE professional_id = $1 AND type = 'PRO_PAYMENT_APPROVED'`,
      [pro.profileId],
    );
    expect(funnel).toHaveLength(1);

    // Mercado Pago no le cobra encima de lo que ya pagó.
    const status = (await h.http.get(`${API}/billing/pro/status`).set(auth(pro.token)).expect(200)).body;
    expect(status).toMatchObject({ source: 'TRANSFER', canCheckout: false });
    const checkout = await h.http.post(`${API}/billing/pro/checkout`).set(auth(pro.token)).send({}).expect(409);
    expect(checkout.body.code).toBe('BILLING_TRANSFER_PRO_ACTIVE');
    // Ya confirmado: no se rechaza ni se confirma de nuevo.
    await h.http.post(`${API}/admin/transfers/${pending.id}/approve`).set(auth(admin.token)).send({}).expect(409);
    await h.http
      .post(`${API}/admin/transfers/${pending.id}/reject`)
      .set(auth(admin.token))
      .send({ reason: 'Ya no corresponde' })
      .expect(409);
  });

  it('renovar antes de que venza suma los días al final (no se pierden), y arrepentirse quita solo el último', async () => {
    const pro = await user('renueva');
    const first = await requestAndSubmit(pro.token, 1, false);
    const a = (await h.http.post(`${API}/admin/transfers/${first.id}/approve`).set(auth(admin.token)).send({}).expect(200)).body;
    const second = await requestAndSubmit(pro.token, 3);
    expect(second.amountArs).toBe(45000);
    const b = (await h.http.post(`${API}/admin/transfers/${second.id}/approve`).set(auth(admin.token)).send({}).expect(200)).body;
    expect(new Date(b.periodStart).getTime()).toBe(new Date(a.periodEnd).getTime());
    expect(new Date(b.periodEnd).getTime() - new Date(a.periodEnd).getTime()).toBe(90 * DAY);
    expect(new Date((await profileRow(pro.profileId)).transfer_pro_until).getTime()).toBe(new Date(b.periodEnd).getTime());
    const renewed = await h.dataSource.query(
      `SELECT 1 FROM pro_funnel_events WHERE professional_id = $1 AND type = 'PRO_RENEWED'`,
      [pro.profileId],
    );
    expect(renewed).toHaveLength(1);

    // Arrepentimiento: destino válido (alias o CBU) obligatorio.
    for (const refundTo of ['', 'a b', '123', '2850590940090418135202']) {
      await h.http.post(`${API}/billing/transfer/withdraw`).set(auth(pro.token)).send({ refundTo }).expect(400);
    }
    const w = (await h.http.post(`${API}/billing/transfer/withdraw`).set(auth(pro.token)).send({ refundTo: 'mi.alias.mp' }).expect(200)).body;
    expect(new Date(w.proUntil).getTime()).toBe(new Date(a.periodEnd).getTime());
    expect(w.refundPending).toMatchObject({ amountArs: 45000 });
    expect(w.withdrawal).toMatchObject({ paymentId: first.id }); // el anterior sigue dentro de la ventana
    expect(await plan(pro.token)).toMatchObject({ tier: 'PRO', source: 'TRANSFER' });

    const list = (await h.http.get(`${API}/admin/transfers`).query({ status: 'WITHDRAWN' }).set(auth(admin.token)).expect(200)).body;
    expect(list.items.find((i: { id: string }) => i.id === second.id)).toMatchObject({ refundDestination: 'mi.alias.mp', refundedAt: null });
    expect(list.counts.refundsPending).toBeGreaterThanOrEqual(1);
    const refunded = (await h.http.post(`${API}/admin/transfers/${second.id}/refunded`).set(auth(admin.token)).expect(200)).body;
    expect(refunded.refundedAt).not.toBeNull();
    await h.http.post(`${API}/admin/transfers/${second.id}/refunded`).set(auth(admin.token)).expect(409);
    expect((await overview(pro.token)).refundPending).toBeNull();

    // Fuera de la ventana de 10 días ya no se puede.
    await h.dataSource.query(`UPDATE transfer_payments SET reviewed_at = now() - interval '11 days' WHERE id = $1`, [first.id]);
    const late = await h.http.post(`${API}/billing/transfer/withdraw`).set(auth(pro.token)).send({ refundTo: CBU }).expect(409);
    expect(late.body.code).toBe('TRANSFER_WITHDRAWAL_EXPIRED');
    expect((await overview(pro.token)).withdrawal).toBeNull();
  });

  it('rechazo: el profesional ve el motivo y puede volver a pedir', async () => {
    const pro = await user('rechazo');
    const pending = await requestAndSubmit(pro.token, 6, false);
    await h.http.post(`${API}/admin/transfers/${pending.id}/reject`).set(auth(admin.token)).send({ reason: 'abc' }).expect(400);
    await h.http
      .post(`${API}/admin/transfers/${pending.id}/reject`)
      .set(auth(admin.token))
      .send({ reason: 'No encontramos una transferencia con ese código.' })
      .expect(200);
    const o = await overview(pro.token);
    expect(o.last).toMatchObject({ status: 'REJECTED', rejectionReason: 'No encontramos una transferencia con ese código.' });
    expect(o.options).toHaveLength(3);
    expect(await plan(pro.token)).toMatchObject({ tier: 'FREE' });
    expect(await notificationTypes(pro.userId)).toContain('PRO_TRANSFER_REJECTED');
  });

  it('el admin anota un pago recibido por fuera (con el monto que llegó); con pedido abierto, no', async () => {
    const pro = await user('anotado');
    const res = await h.http
      .post(`${API}/admin/users/${pro.userId}/plan/transfer`)
      .set(auth(admin.token))
      .send({ months: 6, amountArs: 90000, note: 'Efectivo en mano' })
      .expect(200);
    expect(res.body).toEqual({ ok: true });
    const [t] = await h.dataSource.query(`SELECT * FROM transfer_payments WHERE professional_id = $1`, [pro.profileId]);
    expect(t).toMatchObject({ status: 'APPROVED', origin: 'ADMIN', months: 6, amount_ars: 90000, admin_note: 'Efectivo en mano' });
    expect(await plan(pro.token)).toMatchObject({ tier: 'PRO', source: 'TRANSFER' });
    const shown = (await h.http.get(`${API}/admin/users/${pro.userId}`).set(auth(admin.token)).expect(200)).body;
    expect(shown.plan).toMatchObject({ source: 'TRANSFER' });
    expect(shown.plan.transferProUntil).not.toBeNull();

    const other = await user('conpedido');
    await h.http.post(`${API}/billing/transfer`).set(auth(other.token)).send({ months: 1 }).expect(200);
    const blocked = await h.http
      .post(`${API}/admin/users/${other.userId}/plan/transfer`)
      .set(auth(admin.token))
      .send({ months: 1, amountArs: 15000 })
      .expect(409);
    expect(blocked.body.code).toBe('TRANSFER_IN_REVIEW');
    await h.http.post(`${API}/admin/users/${other.userId}/plan/transfer`).set(auth(admin.token)).send({ months: 2, amountArs: 1 }).expect(400);
    await h.http.post(`${API}/admin/users/${other.userId}/plan/transfer`).set(auth(pro.token)).send({ months: 1, amountArs: 1 }).expect(404);
  });

  it('con Mercado Pago activo no se paga por transferencia; un PRO por bonus no pierde días', async () => {
    const pro = await user('conmp');
    await h.dataSource.query(
      `INSERT INTO billing_subscriptions (id, professional_id, provider, status, base_amount, current_amount, currency)
       VALUES (gen_random_uuid(), $1, 'MERCADO_PAGO', 'ACTIVE', 15000, 15000, 'ARS')`,
      [pro.profileId],
    );
    const o = await overview(pro.token);
    expect(o).toMatchObject({ blocked: 'SUBSCRIPTION_ACTIVE', options: [] });
    const res = await h.http.post(`${API}/billing/transfer`).set(auth(pro.token)).send({ months: 1 }).expect(409);
    expect(res.body).toMatchObject({ code: 'TRANSFER_BLOCKED', details: { reason: 'SUBSCRIPTION_ACTIVE' } });

    const bonus = await user('conbonus');
    const bonusUntil = new Date(Date.now() + 10 * DAY);
    await h.dataSource.query(`UPDATE professional_profiles SET bonus_pro_until = $2 WHERE id = $1`, [bonus.profileId, bonusUntil]);
    const pending = await requestAndSubmit(bonus.token, 1, false);
    const ok = (await h.http.post(`${API}/admin/transfers/${pending.id}/approve`).set(auth(admin.token)).send({}).expect(200)).body;
    expect(new Date(ok.periodStart).getTime()).toBe(bonusUntil.getTime());
    expect(await plan(bonus.token)).toMatchObject({ source: 'TRANSFER' });
  });

  it('job: avisa una sola vez que vence pronto y borra comprobantes viejos (el registro queda)', async () => {
    const pro = await user('vence');
    const pending = await requestAndSubmit(pro.token, 1);
    await h.http.post(`${API}/admin/transfers/${pending.id}/approve`).set(auth(admin.token)).send({}).expect(200);
    const jobs = h.app.get(TransferService);
    await h.dataSource.query(`UPDATE professional_profiles SET transfer_pro_until = now() + interval '2 days' WHERE id = $1`, [
      pro.profileId,
    ]);
    await jobs.tick();
    await jobs.tick();
    expect((await notificationTypes(pro.userId)).filter((t) => t === 'PRO_TRANSFER_EXPIRING')).toHaveLength(1);

    const [{ proof_public_id: proof }] = await h.dataSource.query(`SELECT proof_public_id FROM transfer_payments WHERE id = $1`, [
      pending.id,
    ]);
    await h.dataSource.query(`UPDATE transfer_payments SET updated_at = now() - interval '91 days' WHERE id = $1`, [pending.id]);
    await jobs.tick();
    expect(h.storage.destroyed).toContain(proof);
    const detail = (await h.http.get(`${API}/admin/transfers/${pending.id}`).set(auth(admin.token)).expect(200)).body;
    expect(detail).toMatchObject({ status: 'APPROVED', hasProof: false, proofDeleted: true, proofUrl: null });
  });
});
