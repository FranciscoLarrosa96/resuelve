import { Logger } from '@nestjs/common';
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

    describe('arrepentimiento del Plus programado', () => {
      const withdraw = (p: Pro, refundTo = 'mi.alias.mp') =>
        h.http.post(`${API}/billing/transfer/withdraw`).set(auth(p.token)).send({ refundTo });

      it('Plus que todavía no empezó: se ofrece con su fecha de inicio y revocarlo devuelve el total sin tocar el PRO pagado', async () => {
        const p = await pro('arrep-futuro');
        await pay(p, 1, 'PRO');
        const proEnd = (await profileRow(p)).transfer_pro_until as Date;
        const plusId = await pay(p, 1, 'PRO_PLUS');
        const o = await overview(p);
        expect(o.withdrawal).toMatchObject({
          paymentId: plusId,
          planTier: 'PRO_PLUS',
          amountArs: 24900,
          periodState: 'NOT_STARTED',
        });
        expect(new Date(o.withdrawal.startsAt).getTime()).toBe(proEnd.getTime());
        const w = (await withdraw(p).expect(200)).body;
        // Código de arrepentimiento = el código del pago; monto total; el PRO ya pagado queda en sus fechas.
        expect(w.refundPending).toMatchObject({ amountArs: 24900, planTier: 'PRO_PLUS', reference: expect.stringMatching(/^RES-/) });
        const row = await profileRow(p);
        expect(row.transfer_plus_until).toBeNull();
        expect(new Date(row.transfer_pro_until).getTime()).toBe(proEnd.getTime());
        expect((await me(p)).plan).toMatchObject({ tier: 'PRO', source: 'TRANSFER' });
        // Lo gestiona un admin a mano, a la cuenta indicada.
        const refunded = await transfers.markRefunded(plusId, operator.userId);
        expect(refunded).toMatchObject({ status: 'WITHDRAWN', refundDestination: 'mi.alias.mp' });
        expect((await overview(p)).refundPending).toBeNull();
      });

      it('confirmación tardía: Plus empieza en la confirmación; revocar dentro de los 10 días devuelve el total aunque ya haya empezado', async () => {
        const p = await pro('arrep-tarde');
        await pay(p, 1, 'PRO');
        const pending = (await request(p, 1, 'PRO_PLUS').expect(200)).body.pending;
        await h.http.post(`${API}/billing/transfer/submit`).set(auth(p.token)).send({}).expect(200);
        await h.dataSource.query(
          `UPDATE transfer_payments SET period_end = now() - interval '2 days' WHERE professional_id = $1 AND status = 'APPROVED'`,
          [p.proId],
        );
        await h.dataSource.query(`UPDATE professional_profiles SET transfer_pro_until = now() - interval '2 days' WHERE id = $1`, [p.proId]);
        await transfers.approve(pending.id, operator.userId);
        // Pasan 4 días: Plus ya corre, y la ventana (10 días desde la confirmación) sigue abierta.
        await h.dataSource.query(
          `UPDATE transfer_payments SET reviewed_at = now() - interval '4 days', period_start = now() - interval '4 days', period_end = now() + interval '26 days' WHERE id = $1`,
          [pending.id],
        );
        await h.dataSource.query(
          `UPDATE professional_profiles SET transfer_plus_from = now() - interval '4 days', transfer_plus_until = now() + interval '26 days', transfer_pro_until = now() + interval '26 days' WHERE id = $1`,
          [p.proId],
        );
        const o = await overview(p);
        expect(o.withdrawal).toMatchObject({ paymentId: pending.id, periodState: 'STARTED' });
        expect((await me(p)).plan.tier).toBe('PRO_PLUS');
        const w = (await withdraw(p).expect(200)).body;
        expect(w.refundPending).toMatchObject({ amountArs: 24900 }); // total, sin descontar los 4 días de uso
        expect((await me(p)).plan.tier).toBe('FREE'); // el PRO pagado ya había vencido: nada que conservar
      });

      describe('pago anterior con un Plus programado detrás', () => {
        const paymentRow = async (id: string) =>
          (await h.dataSource.query(`SELECT * FROM transfer_payments WHERE id = $1`, [id]))[0];

        async function proThenPlus(label: string) {
          const p = await pro(label);
          const proId = await pay(p, 1, 'PRO');
          const plusId = await pay(p, 1, 'PRO_PLUS');
          return { p, proId, plusId };
        }

        it('se registra la solicitud sobre el pago elegido: pago, fechas y acceso intactos; nada se anula ni se devuelve todavía', async () => {
          const { p, proId, plusId } = await proThenPlus('arrep-previo');
          const before = await profileRow(p);
          const o = await overview(p);
          expect(o.withdrawals.map((w: { paymentId: string; deferred: boolean }) => [w.paymentId, w.deferred])).toEqual([
            [plusId, false],
            [proId, true],
          ]);
          const t0 = Date.now();
          const res = (await withdraw(p, 'mi.alias.mp').send({ refundTo: 'mi.alias.mp', paymentId: proId }).expect(200)).body;
          const row = await paymentRow(proId);
          expect(row.status).toBe('APPROVED'); // sigue vigente hasta que se resuelva
          expect(row.refund_destination).toBe('mi.alias.mp');
          expect(Math.abs(new Date(row.withdrawal_requested_at).getTime() - t0)).toBeLessThan(10_000);
          expect(row.withdrawn_at).toBeNull();
          expect(res.refundPending).toBeNull(); // todavía no hay devolución que hacer
          expect(res.withdrawals.find((w: { paymentId: string }) => w.paymentId === proId).requestedAt).not.toBeNull();
          // El otro pago y el acceso no se tocan.
          expect((await paymentRow(plusId)).status).toBe('APPROVED');
          const after = await profileRow(p);
          expect(after.transfer_pro_until).toEqual(before.transfer_pro_until);
          expect(after.transfer_plus_from).toEqual(before.transfer_plus_from);
          expect((await me(p)).plan.tier).toBe('PRO');
          // Se ve en el panel admin, primero.
          const list = await transfers.adminList();
          expect(list.counts.withdrawalRequests).toBeGreaterThanOrEqual(1);
          expect(list.items.find((i: { id: string }) => i.id === proId)).toMatchObject({ status: 'APPROVED', refundDestination: 'mi.alias.mp' });
          // Repetirla no duplica ni pisa la fecha.
          const again = await withdraw(p).send({ refundTo: 'otro.alias.x', paymentId: proId }).expect(409);
          expect(again.body.code).toBe('TRANSFER_WITHDRAWAL_PENDING');
          expect((await paymentRow(proId)).withdrawal_requested_at).toEqual(row.withdrawal_requested_at);
        });

        it('la resolución conserva la fecha de la solicitud aunque la ventana ya haya vencido, devuelve el total y adelanta el Plus sin regalar días', async () => {
          const { p, proId, plusId } = await proThenPlus('arrep-resuelve');
          await withdraw(p).send({ refundTo: 'mi.alias.mp', paymentId: proId }).expect(200);
          const plusBefore = await paymentRow(plusId);
          // Pasan los días: la ventana del pago ya venció, pero la solicitud se hizo dentro (hace 3 días).
          await h.dataSource.query(
            `UPDATE transfer_payments SET reviewed_at = now() - interval '12 days', withdrawal_requested_at = now() - interval '3 days' WHERE id = $1`,
            [proId],
          );
          const detail = await transfers.resolveWithdrawal(proId, operator.userId);
          expect(detail).toMatchObject({ status: 'WITHDRAWN', refundDestination: 'mi.alias.mp', refundedAt: null });
          const row = await paymentRow(proId);
          expect(new Date(row.withdrawn_at).getTime()).toBe(new Date(row.withdrawal_requested_at).getTime()); // fecha de la solicitud
          // El PRO ya no figura; el Plus pagado empieza ahora (no a los 30 días) y dura lo mismo que pagó.
          const plusAfter = await paymentRow(plusId);
          expect(plusAfter.status).toBe('APPROVED');
          expect(new Date(plusAfter.period_start).getTime()).toBeLessThan(new Date(plusBefore.period_start).getTime());
          expect(new Date(plusAfter.period_start).getTime()).toBeLessThanOrEqual(Date.now());
          expect(new Date(plusAfter.period_end).getTime() - new Date(plusAfter.period_start).getTime()).toBe(30 * DAY);
          expect(new Date(plusAfter.period_end).getTime()).toBeLessThan(new Date(plusBefore.period_end).getTime());
          expect((await me(p)).plan.tier).toBe('PRO_PLUS');
          const profile = await profileRow(p);
          expect(new Date(profile.transfer_pro_until).getTime()).toBe(new Date(plusAfter.period_end).getTime());
          // La devolución es total y se gestiona como cualquier otra.
          expect((await overview(p)).refundPending).toMatchObject({ amountArs: row.amount_ars, reference: expect.stringMatching(/^RES-/) });
          // No se resuelve dos veces ni lo que nadie pidió.
          await expect(transfers.resolveWithdrawal(proId, operator.userId)).rejects.toMatchObject({ response: { code: 'TRANSFER_INVALID_STATE' } });
          await expect(transfers.resolveWithdrawal(plusId, operator.userId)).rejects.toMatchObject({ response: { code: 'TRANSFER_INVALID_STATE' } });
        });

        it('fuera del plazo la solicitud no se registra; y si después se revoca el último, el anterior se resuelve sin mover nada', async () => {
          const { p, proId, plusId } = await proThenPlus('arrep-orden');
          await h.dataSource.query(`UPDATE transfer_payments SET reviewed_at = now() - interval '11 days' WHERE id = $1`, [proId]);
          const late = await withdraw(p).send({ refundTo: 'mi.alias.mp', paymentId: proId }).expect(409);
          expect(late.body.code).toBe('TRANSFER_WITHDRAWAL_EXPIRED');
          expect((await paymentRow(proId)).withdrawal_requested_at).toBeNull();

          await h.dataSource.query(`UPDATE transfer_payments SET reviewed_at = now() - interval '2 days' WHERE id = $1`, [proId]);
          await withdraw(p).send({ refundTo: 'mi.alias.mp', paymentId: proId }).expect(200); // registrada
          await withdraw(p).send({ refundTo: 'mi.alias.mp', paymentId: plusId }).expect(200); // el último, en el acto
          expect((await paymentRow(plusId)).status).toBe('WITHDRAWN');
          expect((await paymentRow(proId)).status).toBe('APPROVED'); // sigue a la espera de su resolución
          await transfers.resolveWithdrawal(proId, operator.userId);
          expect((await paymentRow(proId)).status).toBe('WITHDRAWN');
          expect((await profileRow(p)).transfer_pro_until).toBeNull();
          expect((await me(p)).plan.tier).toBe('FREE');
        });

        it('una solicitud hecha a tiempo sigue visible (fecha, código y estado) aunque la ventana venza, hasta que se resuelve', async () => {
          const { p, proId } = await proThenPlus('arrep-visible');
          await withdraw(p).send({ refundTo: 'mi.alias.mp', paymentId: proId }).expect(200);
          const reference = (await paymentRow(proId)).reference;
          // Pasan los días: la ventana venció, pero la solicitud se registró dentro.
          await h.dataSource.query(`UPDATE transfer_payments SET reviewed_at = now() - interval '12 days' WHERE id = $1`, [proId]);
          // Recarga de Mi plan: sigue a la vista, ya no se puede "iniciar" y no se pierde.
          const o = await overview(p);
          const w = o.withdrawals.find((x: { paymentId: string }) => x.paymentId === proId);
          expect(w).toMatchObject({ reference, requestedAt: expect.any(String), canRequest: false, planTier: 'PRO' });
          expect(o.withdrawal?.paymentId).not.toBe(proId); // el botón simple no vuelve a ofrecer lo ya pedido
          // Repetirla dice que está en trámite (no "venció").
          const again = await withdraw(p).send({ refundTo: 'x.alias.y', paymentId: proId }).expect(409);
          expect(again.body.code).toBe('TRANSFER_WITHDRAWAL_PENDING');
          // Resolución: sale de la lista de pendientes y queda la devolución con el mismo código.
          await transfers.resolveWithdrawal(proId, operator.userId);
          const after = await overview(p);
          expect(after.withdrawals.map((x: { paymentId: string }) => x.paymentId)).not.toContain(proId);
          expect(after.refundPending).toMatchObject({ reference });
        });

        describe('al resolver, con pagos posteriores en distinto estado', () => {
          const setPeriod = (id: string, startDays: number, endDays: number) =>
            h.dataSource.query(
              `UPDATE transfer_payments SET period_start = now() + ($2 || ' days')::interval, period_end = now() + ($3 || ' days')::interval WHERE id = $1`,
              [id, String(startDays), String(endDays)],
            );
          const notice = async (p: Pro) =>
            (
              await h.dataSource.query(
                `SELECT payload FROM notifications n JOIN professional_profiles pp ON pp.user_id = n.user_id
                  WHERE pp.id = $1 AND n.type = 'PRO_TRANSFER_WITHDRAWAL_RESOLVED'`,
                [p.proId],
              )
            ).map((r: { payload: { withdrawalResolved: { reference: string; changes: unknown[] } } }) => r.payload.withdrawalResolved);

          it('el posterior YA empezó: no se reinicia ni se duplican días; el aviso no trae fechas nuevas', async () => {
            const { p, proId, plusId } = await proThenPlus('resuelve-empezo');
            await setPeriod(proId, -50, -20); // consumido en su mayoría
            await setPeriod(plusId, -20, 10); // Plus en curso
            await withdraw(p).send({ refundTo: 'mi.alias.mp', paymentId: proId }).expect(200);
            const before = await paymentRow(plusId);
            await transfers.resolveWithdrawal(proId, operator.userId);
            const after = await paymentRow(plusId);
            expect(after.period_start).toEqual(before.period_start);
            expect(after.period_end).toEqual(before.period_end);
            expect((await profileRow(p)).transfer_pro_until).toEqual(before.period_end);
            expect((await me(p)).plan.tier).toBe('PRO_PLUS');
            expect(await notice(p)).toEqual([{ reference: (await paymentRow(proId)).reference, changes: [] }]);
          });

          it('el posterior YA terminó: queda como estaba y no se regalan días', async () => {
            const { p, proId, plusId } = await proThenPlus('resuelve-termino');
            await setPeriod(proId, -80, -50);
            await setPeriod(plusId, -50, -20);
            await withdraw(p).send({ refundTo: 'mi.alias.mp', paymentId: proId }).expect(200);
            const before = await paymentRow(plusId);
            await transfers.resolveWithdrawal(proId, operator.userId);
            const after = await paymentRow(plusId);
            expect(after.period_start).toEqual(before.period_start);
            expect(after.period_end).toEqual(before.period_end);
            expect(new Date((await profileRow(p)).transfer_pro_until).getTime()).toBeLessThan(Date.now()); // nada vigente
            expect((await me(p)).plan.tier).toBe('FREE');
          });

          it('hay un tercero sin empezar detrás de uno en curso: ninguno se mueve (no hay hueco que cerrar)', async () => {
            const { p, proId, plusId } = await proThenPlus('resuelve-tres');
            const thirdId = await pay(p, 1, 'PRO_PLUS');
            await setPeriod(proId, -50, -20);
            await setPeriod(plusId, -20, 10);
            await h.dataSource.query(
              `UPDATE transfer_payments SET period_start = (SELECT period_end FROM transfer_payments WHERE id = $2), period_end = (SELECT period_end FROM transfer_payments WHERE id = $2) + interval '30 days' WHERE id = $1`,
              [thirdId, plusId],
            );
            await withdraw(p).send({ refundTo: 'mi.alias.mp', paymentId: proId }).expect(200);
            const before = [await paymentRow(plusId), await paymentRow(thirdId)];
            await transfers.resolveWithdrawal(proId, operator.userId);
            const after = [await paymentRow(plusId), await paymentRow(thirdId)];
            expect(after.map((r) => [r.period_start, r.period_end])).toEqual(before.map((r) => [r.period_start, r.period_end]));
            expect((await notice(p))[0].changes).toEqual([]);
          });

          it('el posterior todavía no empezó: se adelanta, y se avisa con el código y las fechas nuevas', async () => {
            const { p, proId, plusId } = await proThenPlus('resuelve-adelanta');
            await setPeriod(proId, -10, 20); // PRO en curso
            await setPeriod(plusId, 20, 50); // Plus programado
            await withdraw(p).send({ refundTo: 'mi.alias.mp', paymentId: proId }).expect(200);
            await transfers.resolveWithdrawal(proId, operator.userId);
            const plus = await paymentRow(plusId);
            expect(new Date(plus.period_start).getTime()).toBeLessThanOrEqual(Date.now());
            expect(new Date(plus.period_end).getTime() - new Date(plus.period_start).getTime()).toBe(30 * DAY);
            const [n] = await notice(p);
            expect(n.reference).toBe((await paymentRow(proId)).reference);
            expect(n.changes).toEqual([
              {
                reference: plus.reference,
                tier: 'PRO_PLUS',
                startsAt: new Date(plus.period_start).toISOString(),
                endsAt: new Date(plus.period_end).toISOString(),
              },
            ]);
          });
        });
      });

      it('la ventana corre desde la confirmación, no desde que Plus empieza: pasados 10 días ya no se puede aunque Plus aún no haya empezado', async () => {
        const p = await pro('arrep-vencido');
        await pay(p, 6, 'PRO'); // PRO pagado por 180 días: Plus empezaría muy adelante
        const plusId = await pay(p, 1, 'PRO_PLUS');
        await h.dataSource.query(`UPDATE transfer_payments SET reviewed_at = now() - interval '11 days' WHERE id = $1`, [plusId]);
        // El Plus (ventana vencida) ya no figura; el PRO anterior, confirmado hace instantes, sí.
        const ids = (await overview(p)).withdrawals.map((w: { paymentId: string }) => w.paymentId);
        expect(ids).not.toContain(plusId);
        const res = await withdraw(p).send({ refundTo: 'mi.alias.mp', paymentId: plusId }).expect(409);
        expect(res.body.code).toBe('TRANSFER_WITHDRAWAL_EXPIRED');
        expect((await me(p)).plan.tier).toBe('PRO');
      });
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
    async function renewal(providerId: string, outcome: 'approved' | 'rejected', amount?: number, debitDate?: Date) {
      const charge = h.billing.charge(providerId, outcome, { ...(amount === undefined ? {} : { amount }), ...(debitDate ? { debitDate } : {}) });
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

    // Cobro de Plus que llega cuando el cambio ya no existe. Sin decisión comercial sobre qué hacer con ese dinero
    // (docs/plan-change/terminos-propuesta.md, punto D), el sistema solo lo deja a la vista: no da acceso por su cuenta,
    // no lo devuelve y no lo da por resuelto. Mientras tanto el canal Mercado Pago sigue sin habilitarse.
    describe('cobro de Plus que llega con el cambio ya cerrado', () => {
      const payments = async (subscriptionId: string) =>
        h.dataSource.query(`SELECT amount, status FROM billing_payments WHERE billing_subscription_id = $1 AND amount = 24900`, [subscriptionId]);
      let warn: jest.SpyInstance;
      beforeEach(() => {
        warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      });
      afterEach(() => warn.mockRestore());
      const flagged = () => warn.mock.calls.filter((c) => String(c[0]).includes('cobro aprobado a revisar'));

      it('cancelar la RENOVACIÓN descarta el cambio; un cobro de Plus posterior queda registrado, sin acceso ni devolución, y a la vista', async () => {
        const { p, subscriptionId, providerId } = await subscribed('cancela');
        await requestChange(p).expect(200);
        const before = await row(subscriptionId);
        await h.http.post(`${API}/billing/pro/cancel`).set(auth(p.token)).send({}).expect(200);
        const cancelled = await row(subscriptionId);
        expect(cancelled).toMatchObject({ status: 'CANCELLED', pending_plan_tier: null, plan_tier: 'PRO', current_amount: 15000 });
        const accessUntil = cancelled.access_until;
        expect(before.pending_plan_tier).toBe('PRO_PLUS');

        const refunds = h.billing.calls.filter((c) => c.startsWith('refund')).length;
        await renewal(providerId, 'approved', 24900, new Date(Date.now() + 1000));
        // Monto cobrado: queda registrado tal cual.
        expect(await payments(subscriptionId)).toEqual([{ amount: 24900, status: 'APPROVED' }]);
        // Acceso otorgado: ninguno nuevo y nunca Plus.
        const after = await row(subscriptionId);
        expect(after).toMatchObject({ plan_tier: 'PRO', pending_plan_tier: null, status: 'CANCELLED' });
        expect(after.access_until).toEqual(accessUntil);
        expect((await profileRow(p)).billing_plus_until).toBeNull();
        expect(await noticeTypes(p)).not.toContain('PRO_PLAN_CHANGE_ACTIVATED');
        // Tratamiento: ni devolución automática ni nada resuelto; queda marcado para revisión.
        expect(h.billing.calls.filter((c) => c.startsWith('refund')).length).toBe(refunds);
        expect(flagged()).toHaveLength(1);
        // Releer el mismo cobro no repite el aviso.
        await reconciler.reconcileById(subscriptionId);
        expect(flagged()).toHaveLength(1);
      });

      it('un cobro de Plus que ya estaba en curso ANTES de cancelar conserva ese ciclo como PRO, no como Plus', async () => {
        const { p, subscriptionId, providerId } = await subscribed('en-curso');
        await requestChange(p).expect(200);
        const charged = new Date(Date.now() - 1000);
        const charge = h.billing.charge(providerId, 'approved', { amount: 24900, debitDate: charged });
        await h.http.post(`${API}/billing/pro/cancel`).set(auth(p.token)).send({}).expect(200);
        await webhook('subscription_authorized_payment', charge.id).expect(200);
        const after = await row(subscriptionId);
        expect(await payments(subscriptionId)).toEqual([{ amount: 24900, status: 'APPROVED' }]);
        expect(after.status).toBe('CANCELLED');
        expect(after.plan_tier).toBe('PRO');
        expect((await profileRow(p)).billing_plus_until).toBeNull();
        expect((await me(p)).plan.tier).toBe('PRO'); // acceso PRO hasta el fin del ciclo; el tratamiento del monto es la decisión pendiente
      });

      it('descartar SOLO el cambio (la suscripción sigue) y que igual entre un cobro de Plus: sigue PRO, el monto queda a la vista', async () => {
        const { p, subscriptionId, providerId } = await subscribed('descarta-tarde');
        await requestChange(p).expect(200);
        await cancelChange(p).expect(200);
        const sub = await row(subscriptionId);
        expect(sub).toMatchObject({ status: 'ACTIVE', pending_plan_tier: null, plan_tier: 'PRO', current_amount: 15000 });
        await renewal(providerId, 'approved', 24900);
        expect(await payments(subscriptionId)).toEqual([{ amount: 24900, status: 'APPROVED' }]);
        expect(await row(subscriptionId)).toMatchObject({ status: 'ACTIVE', plan_tier: 'PRO', current_amount: 15000 });
        expect((await me(p)).plan.tier).toBe('PRO');
        expect(flagged()).toHaveLength(1);
        expect(h.billing.calls.some((c) => c.startsWith('refund'))).toBe(false);
      });
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
