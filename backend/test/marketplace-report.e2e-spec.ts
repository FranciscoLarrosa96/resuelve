import { randomUUID } from 'crypto';
import { describeE2E, Harness, startApp } from './app.harness';
import { formatReport, marketplaceReport, REPORT_NOTES } from '../src/analytics/marketplace-report';
import { localActivityReport } from '../src/analytics/local-activity-report';

const API = '/api/v1';
const PASSWORD = 'una-clave-bien-larga';
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const HOUR = 3_600_000;

/**
 * Reporte del marketplace: agregado, de solo lectura y con las definiciones de
 * `analytics/marketplace-report.ts` (borradores fuera, ventanas con denominador "con tiempo",
 * cancelados antes y presupuestos retirados aparte, mediana con los sin respuesta al lado).
 */
describeE2E('Reporte del marketplace (e2e)', () => {
  let h: Harness;
  let serviceId: string;
  let otherServiceId: string;
  let zoneId: string;
  let client: { token: string };
  let pro: { token: string; id: string };
  const now = new Date();

  it('actividad local: no atribuye eventos sin barrio a la ciudad del profesional ni inventa búsquedas', async () => {
    const prefix = randomUUID();
    await h.dataSource.query(
      `INSERT INTO exposure_events (professional_id, type, zone_id, occurred_at, session_key_hash, dedupe_key)
       VALUES ($1, 'PROFILE_VIEW', $2, '2030-01-15', repeat('a',64), md5($3)||md5($3)),
              ($1, 'WHATSAPP_CLICK', NULL, '2030-01-15', repeat('a',64), md5($4)||md5($4)),
              ($1, 'PROFILE_VIEW', $2, '2030-02-01', repeat('a',64), md5($5)||md5($5))`,
      [pro.id, zoneId, prefix + '1', prefix + '2', prefix + '3'],
    );
    const report = await localActivityReport(h.dataSource.manager, new Date('2030-01-01Z'), new Date('2030-02-01Z'));
    expect(report.rows.find((r: { localityId: string | null }) => r.localityId === null)).toMatchObject({ label: 'SIN_LOCALIDAD', whatsappTaps: 1, profileViews: 0 });
    expect(report.rows.find((r: { localityId: string | null }) => r.localityId !== null)).toMatchObject({ profileViews: 1, whatsappTaps: 0, cardImpressions: 0 });
  });

  async function register(label: string) {
    const email = `${label.toLowerCase().replace(/[^a-z]+/g, '-')}-${randomUUID().slice(0, 8)}@test.dev`;
    const res = await h.http.post(`${API}/auth/register`).send({ firstName: label, lastName: 'Reporte', email, password: PASSWORD }).expect(201);
    return { token: res.body.accessToken as string };
  }

  /** Pedido enviado `sentHoursAgo` horas atrás; `quoteAfterMin` crea un presupuesto a esa altura. */
  async function sentRequest(opts: {
    sentHoursAgo: number;
    urgency?: 'FLEXIBLE' | 'TODAY' | 'URGENT';
    targeted?: boolean;
    quoteAfterMin?: number;
    quoteStatus?: string;
    cancelAfterMin?: number;
  }) {
    const created = await h.http
      .post(`${API}/requests`)
      .set(auth(client.token))
      .send({ serviceId, zoneId, title: 'Pierde agua', description: 'Pierde la canilla de la cocina.', urgency: opts.urgency ?? 'FLEXIBLE' })
      .expect(201);
    const id = created.body.id as string;
    await h.http
      .post(`${API}/requests/${id}/invitations`)
      .set(auth(client.token))
      .send({ professionalIds: [pro.id], ...(opts.targeted ? { targeted: true } : {}) })
      .expect(200);
    const sentAt = new Date(now.getTime() - opts.sentHoursAgo * HOUR);
    await h.dataSource.query(`UPDATE request_invitations SET sent_at = $2, available_at = $2 WHERE request_id = $1`, [id, sentAt]);
    if (opts.quoteAfterMin !== undefined) {
      await h.http.post(`${API}/pro/requests/${id}/quote`).set(auth(pro.token)).send({ description: 'Arreglo', laborAmount: 15000 }).expect(201);
      await h.dataSource.query(`UPDATE quotes SET created_at = $2, status = $3 WHERE request_id = $1`, [
        id,
        new Date(sentAt.getTime() + opts.quoteAfterMin * 60_000),
        opts.quoteStatus ?? 'PENDING',
      ]);
    }
    if (opts.cancelAfterMin !== undefined) {
      await h.dataSource.query(`UPDATE service_requests SET status = 'CANCELLED', cancelled_at = $2 WHERE id = $1`, [
        id,
        new Date(sentAt.getTime() + opts.cancelAfterMin * 60_000),
      ]);
    }
    return id;
  }

  beforeAll(async () => {
    h = await startApp({ emailVerification: false });
    // El seed de desarrollo trae pedidos de ejemplo: el reporte se prueba sobre datos controlados.
    await h.dataSource.query(`DELETE FROM service_requests`);
    const services = (await h.http.get(`${API}/services`)).body as { slug: string; id: string }[];
    serviceId = services.find((s) => s.slug === 'plomeria')!.id;
    otherServiceId = services.find((s) => s.slug === 'electricidad')!.id;
    zoneId = (await h.http.get(`${API}/zones?city=tandil`)).body[0].id;
    client = await register('Cliente reporte');
    const u = await register('Pro reporte');
    const res = await h.http
      .post(`${API}/pro/profile`)
      .set(auth(u.token))
      .send({ headline: 'Pro en Tandil', yearsExperience: 4, serviceIds: [serviceId], zoneIds: [zoneId] })
      .expect(201);
    pro = { token: u.token, id: res.body.id };
    await h.dataSource.query(`UPDATE professional_profiles SET plan_tier = 'PRO', takes_urgencies = true WHERE id = $1`, [pro.id]);

    const ids = {
      r1: await sentRequest({ sentHoursAgo: 5, quoteAfterMin: 30 }),
      r2: await sentRequest({ sentHoursAgo: 50, quoteAfterMin: 180 }),
      r3: await sentRequest({ sentHoursAgo: 100, urgency: 'URGENT', targeted: true }),
      r4: await sentRequest({ sentHoursAgo: 100, urgency: 'TODAY', cancelAfterMin: 30 }),
      r5: await sentRequest({ sentHoursAgo: 100, quoteAfterMin: 10, quoteStatus: 'WITHDRAWN', cancelAfterMin: 600 }),
      r7: await sentRequest({ sentHoursAgo: 0.5 }),
      r9: await sentRequest({ sentHoursAgo: 100, quoteAfterMin: 20, quoteStatus: 'ACCEPTED' }),
      // Fuera del período del reporte.
      old: await sentRequest({ sentHoursAgo: 24 * 200, quoteAfterMin: 5 }),
    };
    await h.dataSource.query(`UPDATE quotes SET accepted_at = created_at WHERE request_id = $1`, [ids.r9]);
    await h.dataSource.query(`UPDATE service_requests SET status = 'COMPLETED', completed_at = now() WHERE id = $1`, [ids.r9]);
    await h.dataSource.query(`UPDATE service_requests SET service_id = $2 WHERE id = $1`, [ids.r7, otherServiceId]);
    // Un borrador (nunca se envió): no es un pedido enviado.
    await h.http
      .post(`${API}/requests`)
      .set(auth(client.token))
      .send({ serviceId, zoneId, title: 'Borrador', description: 'Todavía no lo mandé a nadie.', urgency: 'FLEXIBLE' })
      .expect(201);
  }, 120_000);
  afterAll(async () => h?.app.close());

  const period = { from: new Date(now.getTime() - 30 * 24 * HOUR), to: new Date(now.getTime() + HOUR), now };

  it('cuenta pedidos enviados (sin borradores ni fuera del período) con cada ventana, su denominador y lo que no tuvo tiempo', async () => {
    const report = await marketplaceReport(h.dataSource.manager, period);
    expect(report.groups).toHaveLength(1);
    const [total] = report.groups[0].rows;
    expect(total).toMatchObject({
      mode: null,
      urgency: null,
      sent: 7,
      withQuote: 4,
      withoutQuote: 3,
      withoutQuoteCancelled: 1,
      withoutQuoteOther: 2,
      withoutQuoteOver72h: 1,
      onlyWithdrawnQuotes: 1,
      cancelled: 2,
      accepted: 1,
      completed: 1,
      medianMinutes: 25,
    });
    expect(total.windows).toEqual([
      { hours: 1, eligible: 5, answered: 3, percent: 60, notYetDue: 1, cancelledEarly: 1 },
      { hours: 24, eligible: 4, answered: 3, percent: 75, notYetDue: 2, cancelledEarly: 1 },
      { hours: 72, eligible: 3, answered: 2, percent: 66.7, notYetDue: 3, cancelledEarly: 1 },
    ]);
  });

  it('separa por modo y urgencia, y los totales cierran con el desglose', async () => {
    const [group] = (await marketplaceReport(h.dataSource.manager, period)).groups;
    const row = (mode: string | null, urgency: string | null) => group.rows.find((r) => r.mode === mode && r.urgency === urgency);
    expect(row('DISCOVERY', 'FLEXIBLE')).toMatchObject({ sent: 5, withQuote: 4 });
    expect(row('DISCOVERY', 'TODAY')).toMatchObject({ sent: 1, withoutQuote: 1, cancelled: 1 });
    expect(row('DIRECTED', 'URGENT')).toMatchObject({ sent: 1, withoutQuote: 1, withoutQuoteOver72h: 1 });
    expect(row('DISCOVERY', null)).toMatchObject({ sent: 6 });
    expect(row(null, 'FLEXIBLE')).toMatchObject({ sent: 5 });
    const cells = group.rows.filter((r) => r.mode && r.urgency);
    expect(cells.reduce((acc, r) => acc + r.sent, 0)).toBe(7);
  });

  it('se puede abrir por servicio y por ciudad, y filtrar', async () => {
    const byService = await marketplaceReport(h.dataSource.manager, { ...period, by: 'service' });
    const sent = Object.fromEntries(byService.groups.map((g) => [g.serviceLabel, g.rows[0].sent]));
    expect(sent).toEqual({ Plomería: 6, Electricidad: 1 });
    const byCity = await marketplaceReport(h.dataSource.manager, { ...period, by: 'city' });
    expect(byCity.groups).toHaveLength(1);
    expect(byCity.groups[0].cityLabel).toMatch(/Tandil/);
    const onlyElectricity = await marketplaceReport(h.dataSource.manager, { ...period, serviceId: otherServiceId });
    expect(onlyElectricity.groups[0].rows[0]).toMatchObject({ sent: 1, withQuote: 0, medianMinutes: null });
    expect(onlyElectricity.groups[0].rows[0].windows[0]).toMatchObject({ eligible: 0, answered: 0, percent: null, notYetDue: 1 });
  });

  it('un período vacío no inventa nada', async () => {
    const report = await marketplaceReport(h.dataSource.manager, {
      from: new Date('2020-01-01T00:00:00Z'),
      to: new Date('2020-02-01T00:00:00Z'),
      now,
    });
    expect(report.groups).toEqual([]);
    expect(formatReport(report)).toContain('No hay pedidos enviados en el período.');
  });

  it('el texto muestra cantidades junto a los porcentajes, la mediana con los sin respuesta y las notas; sin datos personales', async () => {
    const text = formatReport(await marketplaceReport(h.dataSource.manager, period));
    expect(text).toContain('primer presupuesto en 1 h: 3 de 5 (60 %)');
    expect(text).toContain('primer presupuesto en 72 h: 2 de 3 (66.7 %)');
    expect(text).toContain('mediana hasta el primer presupuesto: 25 min (sobre 4 con presupuesto; 3 sin presupuesto)');
    expect(text).toContain('sin tiempo todavía');
    for (const note of REPORT_NOTES) expect(text).toContain(note);
    expect(text).not.toMatch(/@test\.dev/);
    expect(text).not.toContain(client.token);
    expect(text).not.toContain(pro.id);
  });

  it('es de solo lectura: no escribe aunque se lo intente', async () => {
    const before = await h.dataSource.query(`SELECT count(*)::int AS n FROM service_requests`);
    await h.dataSource.transaction('REPEATABLE READ', async (m) => {
      await m.query('SET TRANSACTION READ ONLY');
      await marketplaceReport(m, period);
      await expect(m.query(`DELETE FROM service_requests`)).rejects.toThrow(/read-only/);
    });
    expect(await h.dataSource.query(`SELECT count(*)::int AS n FROM service_requests`)).toEqual(before);
  });
});
