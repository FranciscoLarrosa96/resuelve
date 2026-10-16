import { randomUUID } from 'crypto';
import { describeE2E, Harness, startApp } from './app.harness';
import { formatReport, marketplaceReport } from '../src/analytics/marketplace-report';

const API = '/api/v1';
const PASSWORD = 'una-clave-bien-larga';
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const HOUR = 3_600_000;
const MIN = 60_000;

/**
 * Medición de "Sumar profesionales": cuántos pedidos la usaron y cuántos recibieron después su
 * primer presupuesto. Descriptivo y sin causalidad (ver `AddProfessionalsStat`).
 */
describeE2E('Reporte: Sumar profesionales (e2e)', () => {
  let h: Harness;
  let serviceId: string;
  let zoneId: string;
  let client: { token: string };
  let original: { token: string; id: string };
  let added: { token: string; id: string };
  const now = new Date();

  async function register(label: string) {
    const email = `${label.toLowerCase().replace(/[^a-z]+/g, '-')}-${randomUUID().slice(0, 8)}@test.dev`;
    const res = await h.http.post(`${API}/auth/register`).send({ firstName: label, lastName: 'Medición', email, password: PASSWORD }).expect(201);
    return { token: res.body.accessToken as string };
  }
  async function pro(label: string) {
    const u = await register(label);
    const res = await h.http
      .post(`${API}/pro/profile`)
      .set(auth(u.token))
      .send({ headline: `${label} en Tandil`, yearsExperience: 4, serviceIds: [serviceId], zoneIds: [zoneId] })
      .expect(201);
    await h.dataSource.query(`UPDATE professional_profiles SET plan_tier = 'PRO', takes_urgencies = true WHERE id = $1`, [res.body.id]);
    return { token: u.token, id: res.body.id as string };
  }
  const ago = (hours: number) => new Date(now.getTime() - hours * HOUR);

  /**
   * Pedido enviado `sentH` horas atrás. `addH` = hace cuántas horas se sumó gente (null = nunca).
   * `quote` = quién presupuestó y a cuántos minutos del momento de referencia.
   */
  async function request(o: {
    sentH: number;
    addH: number | null;
    quote?: { by: 'original' | 'added'; at: Date };
    cancelAt?: Date;
  }) {
    const id = (
      await h.http
        .post(`${API}/requests`)
        .set(auth(client.token))
        .send({ serviceId, zoneId, title: 'Pierde agua', description: 'Pierde la canilla de la cocina.', urgency: 'FLEXIBLE' })
        .expect(201)
    ).body.id as string;
    await h.http.post(`${API}/requests/${id}/invitations`).set(auth(client.token)).send({ professionalIds: [original.id] }).expect(200);
    await h.dataSource.query(`UPDATE request_invitations SET sent_at = $2, available_at = $2 WHERE request_id = $1`, [id, ago(o.sentH)]);
    if (o.addH !== null) {
      await h.http
        .post(`${API}/requests/${id}/invitations`)
        .set(auth(client.token))
        .send({ professionalIds: [added.id], addedVia: 'ADD_PROFESSIONALS' })
        .expect(200);
      await h.dataSource.query(`UPDATE request_invitations SET sent_at = $3, available_at = $3 WHERE request_id = $1 AND professional_id = $2`, [id, added.id, ago(o.addH)]);
    }
    if (o.quote) {
      const who = o.quote.by === 'original' ? original : added;
      await h.http.post(`${API}/pro/requests/${id}/quote`).set(auth(who.token)).send({ description: 'Arreglo', laborAmount: 15000 }).expect(201);
      await h.dataSource.query(`UPDATE quotes SET created_at = $2 WHERE request_id = $1`, [id, o.quote.at]);
    }
    if (o.cancelAt) await h.dataSource.query(`UPDATE service_requests SET status = 'CANCELLED', cancelled_at = $2 WHERE id = $1`, [id, o.cancelAt]);
    return id;
  }

  beforeAll(async () => {
    h = await startApp({ emailVerification: false });
    await h.dataSource.query(`DELETE FROM service_requests`);
    serviceId = ((await h.http.get(`${API}/services`)).body as { slug: string; id: string }[]).find((s) => s.slug === 'plomeria')!.id;
    zoneId = (await h.http.get(`${API}/zones?city=tandil`)).body[0].id;
    client = await register('Cliente medición');
    original = await pro('Original');
    added = await pro('Sumado');

    // A: se sumó hace 2 h; el sumado presupuestó 30 min después.
    await request({ sentH: 5, addH: 2, quote: { by: 'added', at: new Date(ago(2).getTime() + 30 * MIN) } });
    // B: se sumó hace 90 h; el original presupuestó 30 h después de sumar.
    await request({ sentH: 100, addH: 90, quote: { by: 'original', at: new Date(ago(90).getTime() + 30 * HOUR) } });
    // C: se sumó hace 90 h y sigue sin presupuesto.
    await request({ sentH: 100, addH: 90 });
    // D: se sumó hace 90 h y se canceló a los 30 min, sin presupuesto.
    await request({ sentH: 100, addH: 90, cancelAt: new Date(ago(90).getTime() + 30 * MIN) });
    // E: ya tenía presupuesto antes de sumar.
    await request({ sentH: 10, addH: 6, quote: { by: 'original', at: ago(9) } });
    // G: se sumó hace 10 minutos.
    await request({ sentH: 3, addH: 10 / 60 });
    // F: nunca se sumó a nadie (control del denominador).
    await request({ sentH: 20, addH: null });
  }, 120_000);
  afterAll(async () => h?.app.close());

  const period = { from: new Date(now.getTime() - 30 * 24 * HOUR), to: new Date(now.getTime() + HOUR), now };

  it('cuenta los pedidos que la usaron y qué pasó después, con denominadores y sin ceros inventados', async () => {
    const { addProfessionals: a } = await marketplaceReport(h.dataSource.manager, period);
    expect(a).toMatchObject({
      sentRequests: 7,
      used: 6,
      addedProfessionals: 6,
      quoteBeforeAdd: 1,
      withoutQuoteAtAdd: 5,
      quoteAfterAdd: 2,
      firstQuoteFromAdded: 1,
      stillWithoutQuote: 2,
      cancelledWithoutQuote: 1,
    });
    const [w1, w24] = a.windows;
    // 1 h: A, B y C tuvieron tiempo; D se canceló antes; G todavía no.
    expect(w1).toMatchObject({ hours: 1, eligible: 3, answered: 1, percent: 33.3, notYetDue: 1, cancelledEarly: 1 });
    // 24 h: B y C; A y G todavía no; D se canceló antes. B respondió a las 30 h: fuera de la ventana.
    expect(w24).toMatchObject({ hours: 24, eligible: 2, answered: 0, percent: 0, notYetDue: 2, cancelledEarly: 1 });
    expect(a.medianMinutesToFirstAdd).not.toBeNull();
  });

  it('se filtra por servicio y no inventa nada cuando no hay pedidos', async () => {
    const other = ((await h.http.get(`${API}/services`)).body as { slug: string; id: string }[]).find((s) => s.slug === 'electricidad')!.id;
    const { addProfessionals: a } = await marketplaceReport(h.dataSource.manager, { ...period, serviceId: other });
    expect(a).toMatchObject({ sentRequests: 0, used: 0, medianMinutesToFirstAdd: null, quoteAfterAdd: 0 });
    expect(a.windows.every((w) => w.percent === null)).toBe(true);
  });

  it('el texto explica cómo leerlo y no atribuye causas', async () => {
    const text = formatReport(await marketplaceReport(h.dataSource.manager, period));
    expect(text).toContain('== Sumar profesionales ==');
    expect(text).toContain('Pedidos que la usaron: 6 de 7');
    expect(text).toContain('no demuestra que sumar profesionales haya causado el presupuesto');
  });

  it('es de solo lectura', async () => {
    const before = await h.dataSource.query(`SELECT count(*)::int AS n FROM request_invitations`);
    await marketplaceReport(h.dataSource.manager, period);
    expect(await h.dataSource.query(`SELECT count(*)::int AS n FROM request_invitations`)).toEqual(before);
  });
});
