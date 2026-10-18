import { randomUUID } from 'crypto';
import { describeE2E, Harness, startApp } from './app.harness';

const API = '/api/v1';
const PASSWORD = 'una-clave-bien-larga';
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/**
 * Hallazgo 3(b): los sugeridos al final del pedido solo ofrecen a quien puede RESPONDER. El endpoint
 * público `POST /requests/eligible-recipients` usa la misma regla que `POST /requests/:id/invitations`
 * (`assessInvitees`); el envío revalida igual porque la elegibilidad cambia entre un paso y otro.
 */
describeE2E('Sugeridos: solo quien puede responder (e2e)', () => {
  let h: Harness;
  let serviceId: string;
  let otherServiceId: string;
  let zoneId: string;

  async function user(label: string) {
    const email = `${label.toLowerCase().replace(/[^a-z]+/g, '-')}-${randomUUID().slice(0, 8)}@test.dev`;
    const res = await h.http.post(`${API}/auth/register`).send({ firstName: label, lastName: 'Sugerido', email, password: PASSWORD }).expect(201);
    return { token: res.body.accessToken as string };
  }
  type Opts = { free?: 'POST_SUCCESS' | 'NEW'; plan?: 'PRO'; services?: string[]; contact?: boolean };
  async function pro(label: string, o: Opts = {}) {
    const u = await user(label);
    const res = await h.http
      .post(`${API}/pro/profile`)
      .set(auth(u.token))
      .send({ headline: `${label} en Tandil`, yearsExperience: 4, serviceIds: o.services ?? [serviceId], zoneIds: [zoneId] })
      .expect(201);
    const id = res.body.id as string;
    if (o.free !== 'NEW') await h.dataSource.query(`UPDATE professional_profiles SET first_success_at = now() WHERE id = $1`, [id]);
    if (o.plan === 'PRO') await h.dataSource.query(`UPDATE professional_profiles SET plan_tier = 'PRO' WHERE id = $1`, [id]);
    await h.dataSource.query(`UPDATE professional_profiles SET takes_urgencies = true WHERE id = $1`, [id]);
    if (o.contact) {
      await h.http
        .patch(`${API}/pro/contact`)
        .set(auth(u.token))
        .send({ whatsappEnabled: true, whatsappNumber: '2494123456', callsEnabled: false, requestsEnabled: true, consent: true })
        .expect(200);
    }
    return { ...u, id };
  }
  type Pro = Awaited<ReturnType<typeof pro>>;

  const check = (pros: Pro[], extra: Record<string, unknown> = {}) =>
    h.http
      .post(`${API}/requests/eligible-recipients`)
      .send({ serviceId, zoneId, urgency: 'FLEXIBLE', professionalIds: pros.map((p) => p.id), ...extra });
  const eligible = async (pros: Pro[], extra: Record<string, unknown> = {}) => (await check(pros, extra).expect(200)).body.eligibleIds as string[];

  async function exhaust(p: Pro, client: { token: string }) {
    for (let i = 0; i < 5; i++) {
      const dummy = (
        await h.http.post(`${API}/requests`).set(auth(client.token)).send({ serviceId, zoneId, title: 'Pierde agua', description: 'Pierde la canilla de la cocina.' }).expect(201)
      ).body.id as string;
      await h.dataSource.query(
        `INSERT INTO quote_quota_usages (professional_id, request_id, consumed_at, consumes_free_quota) VALUES ($1, $2, now(), true)`,
        [p.id, dummy],
      );
    }
  }
  async function sendTo(client: { token: string }, pros: Pro[], extra: Record<string, unknown> = {}) {
    const id = (
      await h.http.post(`${API}/requests`).set(auth(client.token)).send({ serviceId, zoneId, title: 'Pierde agua', description: 'Pierde la canilla de la cocina.' }).expect(201)
    ).body.id as string;
    return h.http.post(`${API}/requests/${id}/invitations`).set(auth(client.token)).send({ professionalIds: pros.map((p) => p.id), ...extra });
  }

  beforeAll(async () => {
    h = await startApp({ emailVerification: false, firstSuccessTrial: true });
    const services = (await h.http.get(`${API}/services`)).body as { slug: string; id: string }[];
    serviceId = services.find((s) => s.slug === 'plomeria')!.id;
    otherServiceId = services.find((s) => s.slug === 'electricidad')!.id;
    zoneId = (await h.http.get(`${API}/zones?city=tandil`)).body[0].id;
  }, 120_000);
  afterAll(async () => h?.app.close());

  it('excluye cupo agotado, solicitudes apagadas, pausado y servicio distinto; conserva el orden', async () => {
    const client = await user('Cliente');
    const ok = await pro('Disponible');
    const pro1 = await pro('Pago', { plan: 'PRO' });
    const noQuota = await pro('SinCupo');
    const off = await pro('Apagado', { contact: true });
    const paused = await pro('Pausado');
    const elsewhere = await pro('OtroOficio', { services: [otherServiceId] });
    await exhaust(noQuota, client);
    await h.dataSource.query(`UPDATE professional_profiles SET contact_requests_enabled = false WHERE id = $1`, [off.id]);
    await h.dataSource.query(`UPDATE professional_profiles SET status = 'PAUSED' WHERE id = $1`, [paused.id]);

    const all = [noQuota, ok, off, paused, elsewhere, pro1];
    expect(await eligible(all)).toEqual([ok.id, pro1.id]);
    // Lo que se recomienda es exactamente lo que el envío acepta.
    await sendTo(client, [ok, pro1]).then((r) => expect(r.status).toBe(200));
  });

  it('un Free nuevo deja de ser elegible al agotar el cupo, aunque todavía no tenga primer éxito', async () => {
    const client = await user('Cliente');
    const fresh = await pro('Nuevo', { free: 'NEW' });
    expect(await eligible([fresh])).toEqual([fresh.id]);
    await exhaust(fresh, client);
    expect(await eligible([fresh])).toEqual([]);
    await sendTo(client, [fresh]).then((r) => expect(r.status).toBe(422));
    await sendTo(client, [fresh], { targeted: true }).then((r) => expect(r.status).toBe(200));
  });

  it('urgencias: solo quien las atiende', async () => {
    const yes = await pro('ConUrgencias');
    const no = await pro('SinUrgencias');
    await h.dataSource.query(`UPDATE professional_profiles SET takes_urgencies = false WHERE id = $1`, [no.id]);
    expect(await eligible([no, yes], { urgency: 'URGENT' })).toEqual([yes.id]);
    expect(await eligible([no, yes], { urgency: 'FLEXIBLE' })).toEqual([no.id, yes.id]);
  });

  it('el pedido dirigido no mira el cupo: el envío lo acepta y la consulta de descubrimiento no lo ofrece', async () => {
    const client = await user('Cliente');
    const noQuota = await pro('SinCupo');
    await exhaust(noQuota, client);
    expect(await eligible([noQuota])).toEqual([]);
    await sendTo(client, [noQuota], { targeted: true }).then((r) => expect(r.status).toBe(200));
    await sendTo(client, [noQuota]).then((r) => expect(r.status).toBe(422));
  });

  it('cambios entre la consulta y el envío: el backend revalida y rechaza', async () => {
    const client = await user('Cliente');
    const a = await pro('Cambia');
    const b = await pro('Estable');
    expect(await eligible([a, b])).toEqual([a.id, b.id]);
    // Entre un paso y otro, `a` agota su cupo.
    await exhaust(a, client);
    const res = await sendTo(client, [a, b]);
    expect(res.status).toBe(422);
    expect(res.body.details.reason).toBe('QUOTA_EXHAUSTED');
    // Una nueva consulta ya no lo ofrece y el envío con el resto sale.
    expect(await eligible([a, b])).toEqual([b.id]);
    await sendTo(client, [b]).then((r) => expect(r.status).toBe(200));
  });

  it('sin candidatos devuelve lista vacía; ids inexistentes no rompen; valida la entrada', async () => {
    const noQuota = await pro('SinCupo2');
    await exhaust(noQuota, await user('Cliente'));
    expect(await eligible([noQuota])).toEqual([]);
    expect(await eligible([{ id: randomUUID() } as Pro])).toEqual([]);
    await check([], {}).expect(400);
    await h.http.post(`${API}/requests/eligible-recipients`).send({ serviceId, zoneId, urgency: 'FLEXIBLE', professionalIds: ['x'] }).expect(400);
    await check([noQuota], { serviceId: randomUUID() }).expect(404);
  });

  it('no devuelve motivos ni datos de cupo', async () => {
    const p = await pro('Privado');
    const res = await check([p]).expect(200);
    expect(Object.keys(res.body)).toEqual(['eligibleIds']);
  });
});
