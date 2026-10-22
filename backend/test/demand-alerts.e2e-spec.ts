import { randomUUID } from 'crypto';
import { describeE2E, Harness, startApp } from './app.harness';
import { normalizeGeoText } from '../src/catalog/geo/geo-text';
import { DemandAlertsScheduler } from '../src/demand-alerts/demand-alerts.scheduler';

const API = '/api/v1';
const PASSWORD = 'una-clave-bien-larga';

/**
 * "Avisame cuando haya": quien no encontró profesionales de un servicio en su localidad
 * pide un aviso; cuando aparece oferta real (la misma de la búsqueda) recibe uno, una vez.
 */
describeE2E('Avisame cuando haya (e2e)', () => {
  let h: Harness;
  let scheduler: DemandAlertsScheduler;
  const svc: Record<string, string> = {};
  let cityId: string;
  let otherCityId: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function register(label: string) {
    const email = `${label}-${randomUUID().slice(0, 8)}@test.dev`;
    const res = await h.http
      .post(`${API}/auth/register`)
      .send({ firstName: label, lastName: 'Aviso', email, password: PASSWORD, phone: '+54 223 555 1111' })
      .expect(202);
    const verify = await h.http
      .post(`${API}/auth/register/verify`)
      .send({ verificationSessionId: res.body.verificationSessionId, code: h.mail.lastCodeFor(email) })
      .expect(200);
    return verify.body.accessToken as string;
  }

  async function addLocality(name: string, slug: string) {
    const [row] = await h.dataSource.query(
      `INSERT INTO cities (name, slug, province, province_id, search_name, source)
       SELECT $1, $2, p.name, p.id, $3, 'MANUAL' FROM provinces p WHERE p.official_code = '06' RETURNING id`,
      [name, slug, normalizeGeoText(name)],
    );
    return row.id as string;
  }

  const clientNotices = async (token: string) =>
    (
      await h.http.get(`${API}/me/notifications`).query({ audience: 'CLIENT' }).set(auth(token)).expect(200)
    ).body.items.filter((n: { type: string }) => n.type === 'CLIENT_DEMAND_ALERT_MATCHED');

  const status = async (token: string, serviceId: string, city = cityId) =>
    (
      await h.http
        .get(`${API}/me/demand-alerts`)
        .query({ cityId: city, serviceId })
        .set(auth(token))
        .expect(200)
    ).body.active as boolean;

  beforeAll(async () => {
    h = await startApp();
    scheduler = h.app.get(DemandAlertsScheduler);
    for (const s of (await h.http.get(`${API}/services`).expect(200)).body) svc[s.slug] = s.id;
    cityId = await addLocality('Ayacucho', 'ayacucho');
    otherCityId = await addLocality('Benito Juárez', 'benito-juarez');
  }, 60_000);

  afterAll(async () => {
    await h?.app.close();
  });

  it('pide sesión y valida localidad y servicio', async () => {
    await h.http.post(`${API}/me/demand-alerts`).send({ cityId, serviceId: svc.electricidad }).expect(401);
    const token = await register('validacion');
    await h.http.post(`${API}/me/demand-alerts`).set(auth(token)).send({ cityId, serviceId: 'x' }).expect(400);
    await h.http
      .post(`${API}/me/demand-alerts`)
      .set(auth(token))
      .send({ cityId, serviceId: randomUUID() })
      .expect(404);
  });

  it('avisa una sola vez cuando aparece un profesional que cubre esa localidad y servicio', async () => {
    const client = await register('cliente');
    expect(await status(client, svc.electricidad)).toBe(false);
    for (let i = 0; i < 2; i++) {
      await h.http
        .post(`${API}/me/demand-alerts`)
        .set(auth(client))
        .send({ cityId, serviceId: svc.electricidad })
        .expect(200, { active: true });
    }
    expect(await status(client, svc.electricidad)).toBe(true);
    const [{ n }] = await h.dataSource.query(`SELECT count(*)::int AS n FROM demand_alerts WHERE city_id = $1`, [cityId]);
    expect(n).toBe(1);

    // Sin oferta todavía: nada que avisar.
    await scheduler.tick();
    expect(await clientNotices(client)).toHaveLength(0);

    // Oferta de OTRO servicio o de OTRA localidad: tampoco.
    const proToken = await register('pro');
    await h.http
      .post(`${API}/pro/profile`)
      .set(auth(proToken))
      .send({
        headline: 'Plomero',
        serviceIds: [svc.plomeria],
        coverage: [{ localityId: cityId, coversEntireCity: true }],
      })
      .expect(201);
    const otherPro = await register('pro-otra');
    await h.http
      .post(`${API}/pro/profile`)
      .set(auth(otherPro))
      .send({
        headline: 'Electricista',
        serviceIds: [svc.electricidad],
        coverage: [{ localityId: otherCityId, coversEntireCity: true }],
      })
      .expect(201);
    await scheduler.tick();
    expect(await clientNotices(client)).toHaveLength(0);

    // Ahora sí: un electricista que cubre la localidad.
    const electricista = await register('electricista');
    await h.http
      .post(`${API}/pro/profile`)
      .set(auth(electricista))
      .send({
        headline: 'Electricista',
        serviceIds: [svc.electricidad],
        coverage: [{ localityId: cityId, coversEntireCity: true }],
      })
      .expect(201);
    expect(await scheduler.tick()).toBeGreaterThanOrEqual(1);
    const [notice] = await clientNotices(client);
    expect(notice).toMatchObject({
      demandAlert: { serviceSlug: 'electricidad', citySlug: 'ayacucho', provinceSlug: expect.any(String) },
      route: expect.stringMatching(/^\/profesionales\?servicio=electricidad&provincia=[a-z-]+&ciudad=ayacucho$/),
    });
    expect(await status(client, svc.electricidad)).toBe(false);

    // Una sola vez.
    await scheduler.tick();
    expect(await clientNotices(client)).toHaveLength(1);

    // Volver a pedirlo con oferta: un aviso nuevo (otro pedido), no un duplicado del anterior.
    await h.http
      .post(`${API}/me/demand-alerts`)
      .set(auth(client))
      .send({ cityId, serviceId: svc.electricidad })
      .expect(200);
    await scheduler.tick();
    expect(await clientNotices(client)).toHaveLength(2);
  });

  it('un perfil pausado no cuenta como oferta', async () => {
    const client = await register('cliente-pausa');
    await h.http
      .post(`${API}/me/demand-alerts`)
      .set(auth(client))
      .send({ cityId: otherCityId, serviceId: svc.plomeria })
      .expect(200);
    const pro = await register('pro-pausado');
    const res = await h.http
      .post(`${API}/pro/profile`)
      .set(auth(pro))
      .send({
        headline: 'Plomero',
        serviceIds: [svc.plomeria],
        coverage: [{ localityId: otherCityId, coversEntireCity: true }],
      })
      .expect(201);
    await h.dataSource.query(`UPDATE professional_profiles SET status = 'PAUSED' WHERE id = $1`, [res.body.id]);
    await scheduler.tick();
    expect(await clientNotices(client)).toHaveLength(0);
    expect(await status(client, svc.plomeria, otherCityId)).toBe(true);
  });
});
