import { randomUUID } from 'crypto';
import { describeE2E, Harness, startApp } from './app.harness';
import { recalculateResponseTime } from '../src/professionals/response-time';
import { ReleaseUnprovenFreeDelays1795600000000 } from '../src/database/migrations/1795600000000-ReleaseUnprovenFreeDelays';

const API = '/api/v1';
const PASSWORD = 'una-clave-bien-larga';
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/**
 * Fase 1: la demora de Free solo existe si un PRO elegible del MISMO pedido tiene acceso antes,
 * nunca en pedidos de hoy/urgentes ni dirigidos; y "te llegó antes/después" solo se muestra y
 * cuenta con evidencia registrada de ese pedido (nunca con el plan de hoy).
 */
describeE2E('Fase 1: demora de oportunidades Free y evidencia "antes/después" (e2e)', () => {
  let h: Harness;
  let serviceId: string;
  let zoneId: string;

  async function user(label: string) {
    const email = `${label.toLowerCase().replace(/[^a-z]+/g, '-')}-${randomUUID().slice(0, 8)}@test.dev`;
    const res = await h.http
      .post(`${API}/auth/register`)
      .send({ firstName: label, lastName: 'Demora', email, password: PASSWORD })
      .expect(201);
    return { token: res.body.accessToken as string };
  }
  type Kind = 'FREE' | 'PRO' | 'NEW';
  /** FREE = ya tuvo su primer cliente (rige la demora); NEW = todavía no (acceso inicial); PRO = plan pago. */
  async function pro(label: string, kind: Kind) {
    const u = await user(label);
    const res = await h.http
      .post(`${API}/pro/profile`)
      .set(auth(u.token))
      .send({ headline: `${label} en Tandil`, yearsExperience: 4, serviceIds: [serviceId], zoneIds: [zoneId] })
      .expect(201);
    const id = res.body.id as string;
    if (kind !== 'NEW') {
      await h.dataSource.query(`UPDATE professional_profiles SET first_success_at = now() WHERE id = $1`, [id]);
    }
    if (kind === 'PRO') await h.dataSource.query(`UPDATE professional_profiles SET plan_tier = 'PRO' WHERE id = $1`, [id]);
    // Para poder recibir pedidos urgentes.
    await h.dataSource.query(`UPDATE professional_profiles SET takes_urgencies = true WHERE id = $1`, [id]);
    return { ...u, id, kind };
  }
  type Pro = Awaited<ReturnType<typeof pro>>;

  async function createRequest(client: { token: string }, urgency: 'FLEXIBLE' | 'TODAY' | 'URGENT' = 'FLEXIBLE') {
    const res = await h.http
      .post(`${API}/requests`)
      .set(auth(client.token))
      .send({ serviceId, zoneId, title: 'Pierde agua', description: 'Pierde la canilla de la cocina.', urgency })
      .expect(201);
    return res.body.id as string;
  }
  const invite = (client: { token: string }, requestId: string, pros: Pro[], targeted = false) =>
    h.http
      .post(`${API}/requests/${requestId}/invitations`)
      .set(auth(client.token))
      .send({ professionalIds: pros.map((p) => p.id), ...(targeted ? { targeted: true } : {}) });
  async function send(client: { token: string }, pros: Pro[], urgency: 'FLEXIBLE' | 'TODAY' | 'URGENT' = 'FLEXIBLE', targeted = false) {
    const id = await createRequest(client, urgency);
    await invite(client, id, pros, targeted).expect(200);
    return id;
  }
  const gapMinutes = async (requestId: string, p: Pro) => {
    const [r] = await h.dataSource.query(
      `SELECT EXTRACT(EPOCH FROM (available_at - sent_at)) / 60 AS gap FROM request_invitations WHERE request_id = $1 AND professional_id = $2`,
      [requestId, p.id],
    );
    return Math.round(Number(r.gap));
  };
  const detail = async (p: Pro, requestId: string) =>
    (await h.http.get(`${API}/pro/requests/${requestId}`).set(auth(p.token)).expect(200)).body;
  const month = async (p: Pro) => (await h.http.get(`${API}/pro/analytics/month`).set(auth(p.token)).expect(200)).body;
  const quote = (p: Pro, requestId: string) =>
    h.http.post(`${API}/pro/requests/${requestId}/quote`).set(auth(p.token)).send({ description: 'Arreglo de la canilla', laborAmount: 15000 });
  /** Simula que pasó el tiempo: corre hacia atrás todo lo registrado de un pedido. */
  async function ageRequest(requestId: string, minutes: number) {
    await h.dataSource.query(
      `UPDATE request_invitations SET sent_at = sent_at - make_interval(mins => $2), available_at = available_at - make_interval(mins => $2) WHERE request_id = $1`,
      [requestId, minutes],
    );
    await h.dataSource.query(`UPDATE pro_funnel_events SET occurred_at = occurred_at - make_interval(mins => $2) WHERE ref = $1`, [requestId, minutes]);
    await h.dataSource.query(`UPDATE quotes SET created_at = created_at - make_interval(mins => $2) WHERE request_id = $1`, [requestId, minutes]);
    await h.dataSource.query(`UPDATE notifications SET available_at = available_at - make_interval(mins => $2) WHERE request_id = $1 AND available_at IS NOT NULL`, [requestId, minutes]);
  }

  beforeAll(async () => {
    h = await startApp({ emailVerification: false, firstSuccessTrial: true, freeOpportunityDelayMinutes: 30 });
    serviceId = (await h.http.get(`${API}/services`)).body.find((s: { slug: string }) => s.slug === 'plomeria').id;
    zoneId = (await h.http.get(`${API}/zones?city=tandil`)).body[0].id;
  }, 60_000);
  afterAll(async () => h?.app.close());

  describe('pedidos nuevos', () => {
    it('sin ningún PRO en el pedido, Free responde ya: sin demora, sin "después que PRO"', async () => {
      const client = await user('Cliente sin pro');
      const free = await pro('Free solo', 'FREE');
      const otherFree = await pro('Otro free', 'FREE');
      const id = await send(client, [free, otherFree]);
      expect(await gapMinutes(id, free)).toBe(0);
      const d = await detail(free, id);
      expect(d.opportunity).toMatchObject({ delayed: false, actionable: true, lateByMinutes: 0 });
      expect(d.description).not.toBe('');
      await quote(free, id).expect(201);
      // Sin evidencia de acceso anticipado: nada para contar.
      const [{ n }] = await h.dataSource.query(`SELECT count(*)::int AS n FROM pro_funnel_events WHERE type = 'EARLY_OPPORTUNITY_DELIVERED' AND ref = $1`, [id]);
      expect(n).toBe(0);
    });

    it('mixto: el Free espera 30 min detrás del PRO y se avisa "antes que Free" solo al PRO', async () => {
      const client = await user('Cliente mixto');
      const paid = await pro('PRO mixto', 'PRO');
      const free = await pro('Free mixto', 'FREE');
      const id = await send(client, [paid, free]);
      expect(await gapMinutes(id, paid)).toBe(0);
      expect(await gapMinutes(id, free)).toBe(30);
      const freeView = await detail(free, id);
      expect(freeView.opportunity).toMatchObject({ delayed: true, actionable: false });
      expect(freeView.description).toBe('');
      expect((await quote(free, id).expect(409)).body.code).toBe('OPPORTUNITY_NOT_AVAILABLE');
      expect((await detail(paid, id)).opportunity).toMatchObject({ delayed: false, actionable: true, lateByMinutes: 0 });
      const notices = await h.dataSource.query(
        `SELECT n.payload, p.id AS professional_id FROM notifications n JOIN professional_profiles p ON p.user_id = n.user_id WHERE n.request_id = $1 AND n.type = 'PRO_REQUEST_RECEIVED'`,
        [id],
      );
      const byPro = new Map(notices.map((r: { professional_id: string; payload: { aheadOfFree?: boolean } | null }) => [r.professional_id, r.payload]));
      expect(byPro.get(paid.id)).toEqual({ aheadOfFree: true });
      expect(byPro.get(free.id)).toBeNull();
    });

    it('una vez cumplida la ventana, el Free ve y cuenta el hecho demostrado: llegó después que a un PRO del pedido', async () => {
      const client = await user('Cliente ventana');
      const paid = await pro('PRO ventana', 'PRO');
      const free = await pro('Free ventana', 'FREE');
      const id = await send(client, [paid, free]);
      await quote(paid, id).expect(201);
      await ageRequest(id, 31);
      const d = await detail(free, id);
      expect(d.opportunity).toMatchObject({ delayed: false, actionable: true, lateByMinutes: 30, quotesBeforeYou: 1 });
      const m = await month(free);
      expect(m.proPreview).toMatchObject({ delayedOpportunities: 1, delayedAfterOtherQuote: 1 });
    });

    it('PRO y Free que ya entró por la prueba de primer éxito: el acceso inicial no se demora', async () => {
      const client = await user('Cliente acceso inicial');
      const paid = await pro('PRO inicial', 'PRO');
      const fresh = await pro('Sin primer cliente', 'NEW');
      const id = await send(client, [paid, fresh]);
      expect(await gapMinutes(id, fresh)).toBe(0);
      expect((await detail(fresh, id)).opportunity).toMatchObject({ delayed: false, actionable: true, lateByMinutes: 0 });
    });

    it.each(['TODAY', 'URGENT'] as const)('un pedido %s nunca se demora, ni con un PRO delante', async (urgency) => {
      const client = await user(`Cliente ${urgency}`);
      const paid = await pro(`PRO ${urgency}`, 'PRO');
      const free = await pro(`Free ${urgency}`, 'FREE');
      const id = await send(client, [paid, free], urgency);
      expect(await gapMinutes(id, free)).toBe(0);
      expect((await detail(free, id)).opportunity).toMatchObject({ delayed: false, actionable: true, lateByMinutes: 0 });
      // Sin ventana de ventaja no hay "antes que Free": ni aviso ni evento de acceso anticipado.
      const notices = await h.dataSource.query(`SELECT payload FROM notifications WHERE request_id = $1 AND type = 'PRO_REQUEST_RECEIVED'`, [id]);
      expect(notices.every((n: { payload: unknown }) => n.payload === null)).toBe(true);
      const [{ n }] = await h.dataSource.query(`SELECT count(*)::int AS n FROM pro_funnel_events WHERE type = 'EARLY_OPPORTUNITY_DELIVERED' AND ref = $1`, [id]);
      expect(n).toBe(0);
    });

    it('un pedido dirigido conserva su entrega inmediata', async () => {
      const client = await user('Cliente dirigido');
      const free = await pro('Free dirigido', 'FREE');
      const id = await send(client, [free], 'FLEXIBLE', true);
      expect(await gapMinutes(id, free)).toBe(0);
      expect((await detail(free, id)).opportunity).toMatchObject({ targeted: true, delayed: false, actionable: true, lateByMinutes: 0 });
    });

    it('quien se suma después a un pedido con PRO espera solo lo que falta de la ventana', async () => {
      const client = await user('Cliente suma');
      const paid = await pro('PRO suma', 'PRO');
      const freeA = await pro('Free suma A', 'FREE');
      const freeB = await pro('Free suma B', 'FREE');
      const id = await send(client, [paid]);
      await ageRequest(id, 10);
      await invite(client, id, [freeA]).expect(200);
      expect(await gapMinutes(id, freeA)).toBe(20);
      await ageRequest(id, 120);
      await invite(client, id, [freeB]).expect(200);
      expect(await gapMinutes(id, freeB)).toBe(0);
    });
  });

  describe('solicitudes ya enviadas (anteriores a esta regla)', () => {
    /** Una invitación Free con la demora vieja guardada (sin evidencia de PRO), todavía pendiente. */
    async function legacyDelayed(urgency: 'FLEXIBLE' | 'URGENT' = 'FLEXIBLE') {
      const client = await user('Cliente histórico');
      const free = await pro('Free histórico', 'FREE');
      const id = await send(client, [free], urgency);
      await h.dataSource.query(
        `UPDATE request_invitations SET available_at = sent_at + interval '30 minutes' WHERE request_id = $1 AND professional_id = $2`,
        [id, free.id],
      );
      return { client, free, id };
    }

    it('demorada sin evidencia de PRO: se puede responder ya, no se presenta como hecho ni se cuenta, y lo guardado no se toca', async () => {
      const { free, id } = await legacyDelayed();
      const d = await detail(free, id);
      expect(d.opportunity).toMatchObject({ delayed: false, actionable: true, lateByMinutes: 0, quotesBeforeYou: 0 });
      const listed = (await h.http.get(`${API}/pro/requests?status=PENDING`).set(auth(free.token)).expect(200)).body;
      expect(listed.items.find((i: { id: string }) => i.id === id).opportunity).toMatchObject({ delayed: false, actionable: true, lateByMinutes: 0 });
      await quote(free, id).expect(201);
      expect(await gapMinutes(id, free)).toBe(30);
      const m = await month(free);
      expect(m.proPreview.delayedOpportunities).toBe(0);
      const [{ n }] = await h.dataSource.query(`SELECT count(*)::int AS n FROM pro_funnel_events WHERE type = 'DELAYED_OPPORTUNITY_UNLOCKED' AND ref = $1`, [id]);
      expect(n).toBe(0);
    });

    const urgentWithOldDelay = async (label: string, urgency: 'URGENT' | 'TODAY' = 'URGENT') => {
      const client = await user(`Cliente ${label}`);
      const paid = await pro(`PRO ${label}`, 'PRO');
      const free = await pro(`Free ${label}`, 'FREE');
      const id = await send(client, [paid, free], urgency);
      // Antes se demoraba y quedó registrado el acceso anticipado del PRO.
      await h.dataSource.query(`UPDATE request_invitations SET available_at = sent_at + interval '30 minutes' WHERE request_id = $1 AND professional_id = $2`, [id, free.id]);
      await h.dataSource.query(
        `INSERT INTO pro_funnel_events (professional_id, type, ref, occurred_at, dedupe_key, context)
         VALUES ($1, 'EARLY_OPPORTUNITY_DELIVERED', $2::text, (SELECT sent_at FROM request_invitations WHERE request_id = $2::uuid AND professional_id = $1), md5($2::text || $1::text) || md5($1::text || $2::text),
                '{"requestId":"x","billingPlan":"PRO","earlyAccess":true,"aheadOfFree":true}'::jsonb)`,
        [paid.id, id],
      );
      return { free, paid, id };
    };

    it('hoy/urgente liberado antes de cumplir la espera: puede responder y NO se muestra ni cuenta demora', async () => {
      const { free, paid, id } = await urgentWithOldDelay('urgente liberado');
      const d = await detail(free, id);
      expect(d.opportunity).toMatchObject({ delayed: false, actionable: true, lateByMinutes: 0, quotesBeforeYou: 0 });
      const listed = (await h.http.get(`${API}/pro/requests`).set(auth(free.token)).expect(200)).body.items.find((i: { id: string }) => i.id === id);
      expect(listed.opportunity).toMatchObject({ delayed: false, lateByMinutes: 0 });
      expect((await month(free)).proPreview.delayedOpportunities).toBe(0);
      expect((await month(paid)).proPreview ?? null).toBeNull(); // el PRO tampoco suma "antes que Free"
      const [{ n }] = await h.dataSource.query(`SELECT count(*)::int AS n FROM pro_funnel_events WHERE type = 'DELAYED_OPPORTUNITY_UNLOCKED' AND ref = $1`, [id]);
      expect(n).toBe(0);
    });

    it('hoy/urgente cuya espera ya se cumplió: la demora ocurrió y se conserva', async () => {
      const { free, id } = await urgentWithOldDelay('urgente cumplido', 'TODAY');
      await ageRequest(id, 31);
      expect((await detail(free, id)).opportunity).toMatchObject({ delayed: false, actionable: true, lateByMinutes: 30 });
      expect((await month(free)).proPreview.delayedOpportunities).toBe(1);
    });

    it('con el acceso anticipado de un PRO registrado en ese pedido, la demora queda demostrada aunque hoy tenga otro plan', async () => {
      const client = await user('Cliente histórico con PRO');
      const paid = await pro('PRO histórico', 'PRO');
      const free = await pro('Free histórico con PRO', 'FREE');
      const id = await send(client, [paid, free]);
      await ageRequest(id, 31);
      // Hoy el PRO ya no lo es y el Free pagó: lo que vale es lo que se registró en ese momento.
      await h.dataSource.query(`UPDATE professional_profiles SET plan_tier = 'FREE' WHERE id = $1`, [paid.id]);
      await h.dataSource.query(`UPDATE professional_profiles SET plan_tier = 'PRO' WHERE id = $1`, [free.id]);
      const d = await detail(free, id);
      expect(d.opportunity.lateByMinutes).toBe(30);
      expect((await month(free)).proPreview).toBeNull(); // hoy es PRO: ya no ve "sin PRO"
    });

    it('un PRO de hoy que no tenía ese plan entonces no demuestra nada', async () => {
      const client = await user('Cliente sin evidencia');
      const wasFree = await pro('Era Free', 'FREE');
      const free = await pro('Free sin evidencia', 'FREE');
      const id = await send(client, [wasFree, free]);
      // Hoy uno es PRO, pero entonces ninguno lo era: no hay evento de acceso anticipado.
      await h.dataSource.query(`UPDATE professional_profiles SET plan_tier = 'PRO' WHERE id = $1`, [wasFree.id]);
      await h.dataSource.query(`UPDATE request_invitations SET available_at = sent_at + interval '30 minutes' WHERE request_id = $1`, [id]);
      await ageRequest(id, 31);
      expect((await detail(free, id)).opportunity.lateByMinutes).toBe(0);
      expect((await month(free)).proPreview.delayedOpportunities).toBe(0);
    });

    it('"antes que Free" para el PRO solo cuenta si en esa solicitud hubo un Free demorado registrado', async () => {
      const paid = await pro('PRO métricas', 'PRO');
      const client = await user('Cliente métricas');
      // a) Solicitud con evento viejo (sin la marca `aheadOfFree`) pero sin ningún Free demorado: no cuenta.
      const alone = await send(client, [paid]);
      await h.dataSource.query(`UPDATE pro_funnel_events SET context = context - 'aheadOfFree' WHERE ref = $1 AND type = 'EARLY_OPPORTUNITY_DELIVERED'`, [alone]);
      expect((await month(paid)).advanced.attribution.earlyAccessOpportunities).toBe(0);
      // b) Solicitud mixta real: cuenta.
      const free = await pro('Free métricas', 'FREE');
      await send(client, [paid, free]);
      expect((await month(paid)).advanced.attribution.earlyAccessOpportunities).toBe(1);
      // c) Mixta de la que no queda evidencia de la demora del Free: no cuenta.
      const other = await pro('Free sin demora', 'FREE');
      const mixedNoDelay = await send(client, [paid, other]);
      await h.dataSource.query(`UPDATE request_invitations SET available_at = sent_at WHERE request_id = $1`, [mixedNoDelay]);
      expect((await month(paid)).advanced.attribution.earlyAccessOpportunities).toBe(1);
    });
  });

  describe('migración de avisos pendientes', () => {
    it('libera el aviso de una demora que no se justifica y deja el de una demora demostrada; no toca invitaciones', async () => {
      const client = await user('Cliente migración');
      const paid = await pro('PRO migración', 'PRO');
      const unproven = await pro('Free sin evidencia migración', 'FREE');
      const proven = await pro('Free con evidencia migración', 'FREE');
      const lonely = await send(client, [unproven]);
      const mixed = await send(client, [paid, proven]);
      // Hoy: pedido normal sin PRO delante, con la demora vieja guardada.
      await h.dataSource.query(`UPDATE request_invitations SET available_at = sent_at + interval '30 minutes' WHERE request_id = $1`, [lonely]);
      await h.dataSource.query(`UPDATE notifications SET available_at = now() + interval '20 minutes' WHERE request_id = $1 AND type = 'PRO_REQUEST_RECEIVED'`, [lonely]);
      await h.dataSource.query(`UPDATE notifications SET available_at = now() + interval '20 minutes' WHERE request_id = $1 AND type = 'PRO_REQUEST_RECEIVED'`, [mixed]);
      const invitationsBefore = await h.dataSource.query(`SELECT id, sent_at, available_at FROM request_invitations WHERE request_id = ANY($1) ORDER BY id`, [[lonely, mixed]]);

      const runner = h.dataSource.createQueryRunner();
      try {
        await new ReleaseUnprovenFreeDelays1795600000000().up(runner);
      } finally {
        await runner.release();
      }
      const notices = await h.dataSource.query(
        `SELECT n.request_id, p.id AS professional_id, n.available_at IS NULL AS released
           FROM notifications n JOIN professional_profiles p ON p.user_id = n.user_id
          WHERE n.request_id = ANY($1) AND n.type = 'PRO_REQUEST_RECEIVED'`,
        [[lonely, mixed]],
      );
      const released = (requestId: string, p: Pro) =>
        notices.find((n: { request_id: string; professional_id: string }) => n.request_id === requestId && n.professional_id === p.id).released;
      expect(released(lonely, unproven)).toBe(true);
      expect(released(mixed, proven)).toBe(false);
      expect(await h.dataSource.query(`SELECT id, sent_at, available_at FROM request_invitations WHERE request_id = ANY($1) ORDER BY id`, [[lonely, mixed]])).toEqual(invitationsBefore);
    });
  });

  describe('"Suele responder en…" con solicitudes históricas', () => {
    const minutesOf = async (p: Pro) =>
      (await h.dataSource.query(`SELECT average_response_minutes AS m FROM professional_profiles WHERE id = $1`, [p.id]))[0].m as number | null;
    /** Presupuesta y deja el presupuesto `afterMin` minutos después del envío. */
    async function answered(client: { token: string }, p: Pro, others: Pro[], afterMin: number, storedDelay: number) {
      const id = await send(client, [p, ...others]);
      // Con un PRO delante la ventana tiene que haber pasado para poder presupuestar.
      if (others.length) await ageRequest(id, 31);
      await quote(p, id).expect(201);
      await h.dataSource.query(`UPDATE request_invitations SET available_at = sent_at + make_interval(mins => $3) WHERE request_id = $1 AND professional_id = $2`, [id, p.id, storedDelay]);
      await h.dataSource.query(`UPDATE quotes q SET created_at = i.sent_at + make_interval(mins => $3) FROM request_invitations i WHERE q.request_id = $1 AND i.request_id = q.request_id AND q.professional_id = $2 AND i.professional_id = q.professional_id`, [id, p.id, afterMin]);
      return id;
    }

    it('demora guardada sin evidencia: cuenta desde el envío, sin descartar ni inflar respuestas', async () => {
      const client = await user('Cliente histórico');
      const free = await pro('Free histórico', 'FREE');
      // Demora vieja de 30 min guardada, sin ningún PRO registrado en el pedido.
      // Respuestas a 5, 20 y 40 min del envío: las dos primeras salieron "antes" del available_at guardado.
      for (const m of [5, 20, 40]) await answered(client, free, [], m, 30);
      await recalculateResponseTime(h.dataSource.manager, free.id);
      // Desde el envío: mediana 20. Con el available_at guardado habría descartado dos y dado 10.
      expect(await minutesOf(free)).toBe(20);
    });

    it('demora demostrada (PRO del mismo pedido antes): cuenta desde el acceso efectivo', async () => {
      const client = await user('Cliente demostrado');
      const free = await pro('Free demostrado', 'FREE');
      for (const m of [40, 50, 60]) {
        const paid = await pro(`PRO delante ${m}`, 'PRO');
        const id = await answered(client, free, [paid], m, 30);
        const [e] = await h.dataSource.query(`SELECT count(*)::int AS n FROM pro_funnel_events WHERE type = 'EARLY_OPPORTUNITY_DELIVERED' AND ref = $1`, [id]);
        expect(e.n).toBeGreaterThan(0);
      }
      await recalculateResponseTime(h.dataSource.manager, free.id);
      // 40-30, 50-30 y 60-30 minutos desde que pudo verla: mediana 20.
      expect(await minutesOf(free)).toBe(20);
    });

    it('hoy/urgente con demora vieja: cuenta desde el envío aunque haya PRO registrado', async () => {
      const client = await user('Cliente urgente histórico');
      const free = await pro('Free urgente histórico', 'FREE');
      for (const m of [6, 8, 10]) {
        const paid = await pro(`PRO urgente ${m}`, 'PRO');
        const id = await send(client, [free, paid], 'URGENT');
        await quote(free, id).expect(201);
        await h.dataSource.query(`UPDATE request_invitations SET available_at = sent_at + interval '30 minutes' WHERE request_id = $1 AND professional_id = $2`, [id, free.id]);
        await h.dataSource.query(`INSERT INTO pro_funnel_events (professional_id, type, ref, context, occurred_at, dedupe_key) SELECT $2::uuid, 'EARLY_OPPORTUNITY_DELIVERED', $1::text, '{"billingPlan":"PRO","earlyAccess":true}'::jsonb, sent_at, 'hist-' || id::text FROM request_invitations WHERE request_id = $1::uuid AND professional_id = $3::uuid`, [id, paid.id, free.id]);
        await h.dataSource.query(`UPDATE quotes q SET created_at = i.sent_at + make_interval(mins => $3) FROM request_invitations i WHERE q.request_id = $1 AND i.request_id = q.request_id AND q.professional_id = $2 AND i.professional_id = q.professional_id`, [id, free.id, m]);
      }
      await recalculateResponseTime(h.dataSource.manager, free.id);
      expect(await minutesOf(free)).toBe(8);
    });
  });
});
