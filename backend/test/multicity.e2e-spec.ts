import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { describeE2E, Harness, startApp } from './app.harness';
import { normalizeGeoText } from '../src/catalog/geo/geo-text';
import { importGeorefLocalities, parseGeorefCensusLocalities } from '../src/catalog/geo/georef';

const API = '/api/v1';
const PASSWORD = 'una-clave-bien-larga';

/**
 * Resuelve multiciudad: catálogo de localidades (muestra REAL de Georef + ciudades
 * cargadas a mano sin código), cobertura por localidad y barrio, matching de
 * búsqueda e invitaciones, privacidad y URLs semánticas. Escenarios A–J de
 * docs/multiciudad.md.
 */
describeE2E('Multiciudad (e2e)', () => {
  let h: Harness;
  const svc: Record<string, string> = {};
  const zone: Record<string, string> = {};
  const city: Record<string, string> = {};

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function register(label: string) {
    const email = `${label}-${randomUUID().slice(0, 8)}@test.dev`;
    const res = await h.http
      .post(`${API}/auth/register`)
      .send({ firstName: label, lastName: 'Multi', email, password: PASSWORD, phone: '+54 223 555 1111' })
      .expect(202);
    const verify = await h.http
      .post(`${API}/auth/register/verify`)
      .send({ verificationSessionId: res.body.verificationSessionId, code: h.mail.lastCodeFor(email) })
      .expect(200);
    return { email, token: verify.body.accessToken as string };
  }

  async function pro(label: string, body: Record<string, unknown>) {
    const user = await register(label);
    const res = await h.http
      .post(`${API}/pro/profile`)
      .set(auth(user.token))
      .send({ headline: `${label}`, yearsExperience: 3, ...body });
    expect(res.status).toBe(201);
    return { ...user, proId: res.body.id as string, body: res.body };
  }

  async function search(query: Record<string, unknown>) {
    return (
      await h.http
        .get(`${API}/professionals`)
        .query({ pageSize: 50, ...query })
        .expect(200)
    ).body as {
      items: { id: string; isFeaturedPlacement: boolean }[];
      total: number;
    };
  }
  const ids = async (query: Record<string, unknown>) => (await search(query)).items.map((p) => p.id);

  async function addLocality(name: string, slug: string, provinceCode: string) {
    const [row] = await h.dataSource.query(
      `INSERT INTO cities (name, slug, province, province_id, search_name, source)
       SELECT $1, $2, p.name, p.id, $4, 'MANUAL' FROM provinces p WHERE p.official_code = $3 RETURNING id`,
      [name, slug, provinceCode, normalizeGeoText(name)],
    );
    return row.id as string;
  }

  function request(token: string, body: Record<string, unknown>) {
    return h.http
      .post(`${API}/requests`)
      .set(auth(token))
      .send({
        serviceId: svc.plomeria,
        title: 'Pérdida',
        description: 'Pierde agua la canilla de la cocina.',
        ...body,
      });
  }

  const invite = (token: string, id: string, professionalIds: string[]) =>
    h.http.post(`${API}/requests/${id}/invitations`).set(auth(token)).send({ professionalIds });

  beforeAll(async () => {
    h = await startApp();
    for (const s of (await h.http.get(`${API}/services`).expect(200)).body) svc[s.slug] = s.id;
    for (const z of (await h.http.get(`${API}/zones?city=tandil`).expect(200)).body) zone[z.slug] = z.id;
    [{ id: city.tandil }] = await h.dataSource.query(`SELECT id FROM cities WHERE slug = 'tandil'`);
    // Ciudades sin código oficial todavía (como estarían antes de `geo:import`) y sin barrios.
    city.mdp = await addLocality('Mar del Plata', 'mar-del-plata', '06');
    city.rauch = await addLocality('Rauch', 'rauch', '06');
    city.olavarria = await addLocality('Olavarría', 'olavarria', '06');
    city.azul = await addLocality('Azul', 'azul', '06');
    // Homónimo en OTRA provincia de una localidad de la muestra oficial (Villa Mercedes, San Juan).
    city.villaMercedesSanLuis = await addLocality('Villa Mercedes', 'villa-mercedes', '74');
    // Una "San Juan" cargada a mano: la importación la vincula (mismo id) en vez de duplicarla.
    city.sanJuanManual = await addLocality('San Juan', 'san-juan', '70');
  }, 60_000);

  afterAll(async () => {
    await h?.app.close();
  });

  // ---- Catálogo e importación -------------------------------------------------
  describe('catálogo nacional (Georef)', () => {
    const sample = () =>
      parseGeorefCensusLocalities(
        JSON.parse(
          readFileSync(join(__dirname, 'fixtures', 'georef-localidades-censales.sample.json'), 'utf8'),
        ),
      ).items;

    it('importa la muestra oficial, vincula la ciudad cargada a mano y es idempotente', async () => {
      const items = sample();
      const first = await h.dataSource.transaction((m) => importGeorefLocalities(m, items));
      expect(first.linked).toBe(1);
      expect(first.inserted).toBe(items.length - 1);
      const slugsBefore = await h.dataSource.query(
        `SELECT id, slug FROM cities WHERE source = 'GEOREF' ORDER BY id`,
      );
      const second = await h.dataSource.transaction((m) => importGeorefLocalities(m, items));
      expect(second).toMatchObject({ inserted: 0, linked: 0, updated: items.length });
      expect(
        await h.dataSource.query(`SELECT id, slug FROM cities WHERE source = 'GEOREF' ORDER BY id`),
      ).toEqual(slugsBefore);
      const [sanJuan] = await h.dataSource.query(`SELECT id, official_code FROM cities WHERE id = $1`, [
        city.sanJuanManual,
      ]);
      expect(sanJuan.official_code).toBe('70028010');
    });

    it('24 jurisdicciones con código oficial', async () => {
      const provinces = (await h.http.get(`${API}/provinces`).expect(200)).body as {
        slug: string;
        officialCode: string;
      }[];
      expect(provinces).toHaveLength(24);
      expect(provinces.find((p) => p.slug === 'caba')?.officialCode).toBe('02');
    });

    it('Escenario G: homónimos en la misma provincia y en provincias distintas se distinguen', async () => {
      const rincon = (await h.http.get(`${API}/localities`).query({ search: 'el rincon' }).expect(200)).body
        .items as {
        id: string;
        label: string;
        path: string;
      }[];
      expect(rincon.map((r) => r.label).sort()).toEqual([
        'El Rincón (Albardón), San Juan',
        'El Rincón (Caucete), San Juan',
      ]);
      expect(new Set(rincon.map((r) => r.path)).size).toBe(2);
      // Sin tildes ni mayúsculas.
      const accented = (await h.http.get(`${API}/localities`).query({ search: 'RINCÓN' }).expect(200)).body
        .items;
      expect(accented.length).toBeGreaterThanOrEqual(2);

      const mercedes = (await h.http.get(`${API}/localities`).query({ search: 'villa mercedes' }).expect(200))
        .body.items as { id: string; label: string; province: { slug: string } }[];
      expect(mercedes.map((m) => m.label).sort()).toEqual([
        'Villa Mercedes, San Juan',
        'Villa Mercedes, San Luis',
      ]);
      // La URL semántica resuelve una sola, por provincia.
      const sanLuis = (await h.http.get(`${API}/provinces/san-luis/localities/villa-mercedes`).expect(200))
        .body;
      expect(sanLuis.id).toBe(city.villaMercedesSanLuis);
      // El slug solo ya no identifica una ciudad: /zones?city= se niega a adivinar.
      expect((await h.http.get(`${API}/zones`).query({ city: 'villa-mercedes' }).expect(422)).body.code).toBe(
        'AMBIGUOUS_LOCALITY',
      );
    });

    it('el autocompletar devuelve pocas opciones (nunca el catálogo entero)', async () => {
      const res = (await h.http.get(`${API}/localities`).query({ search: 'v', limit: 20 }).expect(200)).body
        .items;
      expect(res.length).toBeLessThanOrEqual(20);
      await h.http.get(`${API}/localities`).query({ limit: 500 }).expect(400);
    });

    it('localidad con barrios vs sin barrios', async () => {
      const tandil = (await h.http.get(`${API}/localities/${city.tandil}`).expect(200)).body;
      expect(tandil).toMatchObject({ name: 'Tandil', hasNeighborhoods: true, path: 'buenos-aires/tandil' });
      const barrios = (await h.http.get(`${API}/localities/${city.tandil}/neighborhoods`).expect(200)).body;
      expect(barrios.map((z: { slug: string }) => z.slug)).toContain('villa-italia');
      expect((await h.http.get(`${API}/localities/${city.mdp}/neighborhoods`).expect(200)).body).toEqual([]);
      await h.http.get(`${API}/localities/${randomUUID()}`).expect(404);
    });
  });

  // ---- Profesionales y matching ------------------------------------------------
  describe('cobertura y matching por localidad', () => {
    let tandilBarrios: Awaited<ReturnType<typeof pro>>;
    let todoTandil: Awaited<ReturnType<typeof pro>>;
    let marplatense: Awaited<ReturnType<typeof pro>>;
    let tandilRauch: Awaited<ReturnType<typeof pro>>;

    beforeAll(async () => {
      tandilBarrios = await pro('tandil-barrios', {
        serviceIds: [svc.plomeria],
        zoneIds: [zone['villa-italia']],
      });
      todoTandil = await pro('todo-tandil', {
        serviceIds: [svc.plomeria],
        coverage: [{ localityId: city.tandil, coversEntireCity: true }],
      });
      marplatense = await pro('marplatense', {
        serviceIds: [svc.plomeria],
        coverage: [{ localityId: city.mdp, coversEntireCity: true }],
        availableToday: true,
      });
      tandilRauch = await pro('tandil-rauch', {
        serviceIds: [svc.plomeria, svc.electricidad],
        primaryLocalityId: city.tandil,
        coverage: [
          { localityId: city.tandil, coversEntireCity: false, zoneIds: [zone.centro] },
          { localityId: city.rauch, coversEntireCity: true },
        ],
      });
    }, 60_000);

    it('Escenario A: plomeros en Tandil, con el filtro de barrios de siempre', async () => {
      const inTandil = await ids({ locality: city.tandil, service: 'plomeria' });
      expect(inTandil).toEqual(
        expect.arrayContaining([tandilBarrios.proId, todoTandil.proId, tandilRauch.proId]),
      );
      expect(inTandil).not.toContain(marplatense.proId);
      const villaItalia = await ids({ locality: city.tandil, zone: 'villa-italia', service: 'plomeria' });
      expect(villaItalia).toEqual(expect.arrayContaining([tandilBarrios.proId, todoTandil.proId]));
      expect(villaItalia).not.toContain(tandilRauch.proId);
    });

    it('Escenario B: en Mar del Plata solo quienes cubren Mar del Plata', async () => {
      const res = await search({ locality: city.mdp, service: 'plomeria' });
      expect(res.items.map((p) => p.id)).toEqual([marplatense.proId]);
      expect(res.total).toBe(1);
      // Urgencias: mismo filtro geográfico.
      expect(await ids({ locality: city.mdp, availableToday: true })).toEqual([marplatense.proId]);
      expect(await ids({ locality: city.tandil, availableToday: true })).not.toContain(marplatense.proId);
      // Un barrio de Tandil con la localidad de Mar del Plata no "fuerza" resultados de Tandil.
      expect(await ids({ locality: city.mdp, zone: zone.centro })).toEqual([]);
    });

    it('Escenario C: un electricista de Tandil y Rauch aparece en las dos, con un solo perfil', async () => {
      expect(await ids({ locality: city.rauch, service: 'electricidad' })).toEqual([tandilRauch.proId]);
      // En Tandil también (junto a los electricistas del seed), una sola vez.
      const inTandil = await ids({ locality: city.tandil, service: 'electricidad' });
      expect(inTandil.filter((id) => id === tandilRauch.proId)).toHaveLength(1);
      const pub = (await h.http.get(`${API}/professionals/${tandilRauch.proId}`).expect(200)).body;
      expect(pub.primaryLocality).toMatchObject({ name: 'Tandil', province: { slug: 'buenos-aires' } });
      expect(pub.coverage.map((c: { locality: { name: string } }) => c.locality.name)).toEqual([
        'Tandil',
        'Rauch',
      ]);
      expect(pub.coverage[1].coversEntireCity).toBe(true);
      const [{ n }] = await h.dataSource.query(
        `SELECT count(*)::int n FROM professional_profiles WHERE id = $1`,
        [tandilRauch.proId],
      );
      expect(n).toBe(1);

      // Recibe solicitudes válidas de las dos ciudades.
      const client = await register('cli-c');
      const enRauch = await request(client.token, { localityId: city.rauch }).expect(201);
      expect(enRauch.body.zone).toBeNull();
      expect(enRauch.body.locality).toMatchObject({ id: city.rauch, name: 'Rauch' });
      await invite(client.token, enRauch.body.id, [tandilRauch.proId]).expect(200);
      const enTandil = await request(client.token, { zoneId: zone.centro }).expect(201);
      expect(enTandil.body.locality.id).toBe(city.tandil);
      await invite(client.token, enTandil.body.id, [tandilRauch.proId]).expect(200);
      const inbox = (await h.http.get(`${API}/pro/requests`).set(auth(tandilRauch.token)).expect(200)).body
        .items as {
        id: string;
      }[];
      expect(inbox.map((r) => r.id)).toEqual(expect.arrayContaining([enRauch.body.id, enTandil.body.id]));
    });

    it('Escenario D: al cambiar de ciudad cambian resultados y destacados', async () => {
      expect(await ids({ locality: city.olavarria })).toEqual([]);
      expect(await ids({ locality: city.olavarria, pro: true })).toEqual([]);
      expect((await search({ locality: city.olavarria })).items.some((p) => p.isFeaturedPlacement)).toBe(
        false,
      );
    });

    it('Escenario E: una ciudad sin profesionales responde vacío, sin errores ni resultados de otra', async () => {
      const res = await search({ locality: city.azul, service: 'plomeria' });
      expect(res).toMatchObject({ items: [], total: 0 });
      const azul = (
        await h.http.get(`${API}/localities/${city.azul}`).query({ service: 'plomeria' }).expect(200)
      ).body;
      expect(azul).toMatchObject({
        professionalsCount: 0,
        serviceProfessionalsCount: 0,
        hasNeighborhoods: false,
      });
      const served = (await h.http.get(`${API}/localities/served`).query({ service: 'plomeria' }).expect(200))
        .body.items as { id: string; professionalsCount: number }[];
      expect(served.map((s) => s.id)).toEqual(expect.arrayContaining([city.tandil, city.mdp, city.rauch]));
      expect(served.map((s) => s.id)).not.toContain(city.azul);
      // Sitemap: solo pares localidad × servicio con oferta real.
      const pages = (await h.http.get(`${API}/localities/served-services`).expect(200)).body.items as {
        path: string;
        service: string;
      }[];
      expect(pages).toContainEqual(expect.objectContaining({ path: 'buenos-aires/mar-del-plata', service: 'plomeria' }));
      expect(pages).toContainEqual(expect.objectContaining({ path: 'buenos-aires/rauch', service: 'electricidad' }));
      expect(pages.some((p) => p.path === 'buenos-aires/azul')).toBe(false);
      expect(pages.some((p) => p.path === 'buenos-aires/mar-del-plata' && p.service === 'electricidad')).toBe(false);
    });

    it('Escenario F: una solicitud de Mar del Plata no llega a quien no cubre Mar del Plata', async () => {
      const client = await register('cli-f');
      const req = await request(client.token, {
        localityId: city.mdp,
        exactAddress: 'Av. Colón 1234',
      }).expect(201);
      for (const outsider of [todoTandil, tandilRauch]) {
        const res = await invite(client.token, req.body.id, [outsider.proId]).expect(422);
        expect(res.body.details.reason).toBe('LOCALITY_NOT_COVERED');
      }
      await invite(client.token, req.body.id, [marplatense.proId]).expect(200);
      // El invitado ve la localidad, nunca la dirección exacta ni el teléfono antes de ser elegido.
      const seen = (
        await h.http.get(`${API}/pro/requests/${req.body.id}`).set(auth(marplatense.token)).expect(200)
      ).body;
      expect(seen.locality).toMatchObject({ name: 'Mar del Plata' });
      expect(seen.contact).toBeNull();
      expect(JSON.stringify(seen)).not.toContain('Colón 1234');
      // Quien no fue invitado no la ve (404, no revela que existe).
      await h.http.get(`${API}/pro/requests/${req.body.id}`).set(auth(todoTandil.token)).expect(404);
    });

    it('la ubicación del trabajo se valida en el servidor', async () => {
      const client = await register('cli-val');
      // Sin localidad ni barrio.
      expect((await request(client.token, {}).expect(422)).body.code).toBe('INVALID_WORK_LOCATION');
      // Tandil tiene barrios: hay que elegirlo.
      expect((await request(client.token, { localityId: city.tandil }).expect(422)).body.code).toBe(
        'INVALID_WORK_LOCATION',
      );
      // Barrio de Tandil con localidad Mar del Plata.
      expect(
        (await request(client.token, { localityId: city.mdp, zoneId: zone.centro }).expect(422)).body.code,
      ).toBe('INVALID_WORK_LOCATION');
      // Cambiar de ciudad: solo en borrador.
      const draft = await request(client.token, { localityId: city.mdp }).expect(201);
      const moved = await h.http
        .patch(`${API}/requests/${draft.body.id}`)
        .set(auth(client.token))
        .send({ localityId: city.rauch })
        .expect(200);
      expect(moved.body.locality.id).toBe(city.rauch);
      await invite(client.token, draft.body.id, [tandilRauch.proId]).expect(200);
      expect(
        (
          await h.http
            .patch(`${API}/requests/${draft.body.id}`)
            .set(auth(client.token))
            .send({ localityId: city.mdp })
            .expect(409)
        ).body.code,
      ).toBe('INVALID_REQUEST_STATE');
    });

    it('cobertura: validada en el servidor y editable sin duplicar el perfil', async () => {
      const p = await pro('editable', {
        serviceIds: [svc.plomeria],
        coverage: [{ localityId: city.azul, coversEntireCity: true }],
      });
      // Una ciudad sin barrios no se puede cubrir "por barrios".
      const bad = await h.http
        .patch(`${API}/pro/profile`)
        .set(auth(p.token))
        .send({ coverage: [{ localityId: city.olavarria, coversEntireCity: false }] })
        .expect(422);
      expect(bad.body.details.fields).toContain('coverage');
      // Un barrio de otra ciudad tampoco.
      await h.http
        .patch(`${API}/pro/profile`)
        .set(auth(p.token))
        .send({ coverage: [{ localityId: city.mdp, coversEntireCity: false, zoneIds: [zone.centro] }] })
        .expect(422);
      // Principal fuera de la cobertura.
      await h.http
        .patch(`${API}/pro/profile`)
        .set(auth(p.token))
        .send({ primaryLocalityId: city.tandil })
        .expect(422);
      const ok = await h.http
        .patch(`${API}/pro/profile`)
        .set(auth(p.token))
        .send({
          primaryLocalityId: city.olavarria,
          coverage: [
            { localityId: city.azul, coversEntireCity: true },
            { localityId: city.olavarria, coversEntireCity: true },
          ],
        })
        .expect(200);
      expect(ok.body.id).toBe(p.proId);
      expect(ok.body.primaryLocality.name).toBe('Olavarría');
      expect(ok.body.savedCoverage).toHaveLength(2);
      expect(await ids({ locality: city.olavarria })).toEqual([p.proId]);
    });
  });

  // ---- URLs, preferencias y direcciones ------------------------------------------
  describe('URL, preferencia y direcciones', () => {
    it('Escenario I: la URL semántica identifica la misma ciudad al recargar o compartir', async () => {
      const bySlug = (await h.http.get(`${API}/provinces/buenos-aires/localities/mar-del-plata`).expect(200))
        .body;
      expect(bySlug).toMatchObject({
        id: city.mdp,
        path: 'buenos-aires/mar-del-plata',
        label: 'Mar del Plata, Buenos Aires',
      });
      await h.http.get(`${API}/provinces/cordoba/localities/mar-del-plata`).expect(404);
    });

    it('la ciudad elegida queda guardada como preferencia de la cuenta', async () => {
      const u = await register('pref');
      const me = (
        await h.http
          .put(`${API}/auth/me/locality`)
          .set(auth(u.token))
          .send({ localityId: city.mdp })
          .expect(200)
      ).body;
      expect(me.preferredLocality).toMatchObject({ id: city.mdp, name: 'Mar del Plata' });
      await h.http
        .put(`${API}/auth/me/locality`)
        .set(auth(u.token))
        .send({ localityId: randomUUID() })
        .expect(422);
      const cleared = (
        await h.http.put(`${API}/auth/me/locality`).set(auth(u.token)).send({ localityId: null }).expect(200)
      ).body;
      expect(cleared.preferredLocality).toBeNull();
    });

    it('direcciones: sesgo y barrios de la localidad elegida; sugiere la localidad sin guardar coordenadas', async () => {
      h.location.configured = true;
      h.location.fail = false;
      const [{ id: sanJuan }] = await h.dataSource.query(
        `SELECT id FROM cities WHERE official_code = '70028010'`,
      );
      h.location.suggestions = [];
      await h.http
        .post(`${API}/location/autocomplete`)
        .send({ query: 'Mitre 12', localityId: sanJuan })
        .expect(200);
      expect(h.location.calls).toContain('autocomplete:Mitre 12@San Juan');

      h.location.place = {
        formattedAddress: 'Av. Colón 1234, Mar del Plata, Provincia de Buenos Aires',
        street: 'Av. Colón',
        number: '1234',
        neighbourhood: null,
        locality: 'Mar del Plata',
        province: 'Provincia de Buenos Aires',
      };
      const res = (
        await h.http
          .post(`${API}/location/reverse`)
          .send({ lat: -38.0, lng: -57.55, localityId: city.tandil })
          .expect(200)
      ).body.result;
      expect(res).toMatchObject({
        outsideCity: true,
        zone: null,
        suggestedLocality: { id: city.mdp, name: 'Mar del Plata' },
      });
      expect(JSON.stringify(res)).not.toContain('-57.55');
      h.location.configured = false;
      h.location.place = null;
    });
  });
});
