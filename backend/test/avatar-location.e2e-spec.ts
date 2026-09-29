import { randomUUID } from 'crypto';
import { describeE2E, Harness, startApp } from './app.harness';

const API = '/api/v1';
const PASSWORD = 'una-clave-bien-larga';

/**
 * Foto de perfil profesional (Cloudinary público, firmado, validado con el
 * proveedor) y "¿Dónde es el trabajo?" (proveedor de direcciones encapsulado,
 * barrio inferido, sin coordenadas en la respuesta).
 */
describeE2E('Avatar profesional y ubicación (e2e)', () => {
  let h: Harness;
  const svc: Record<string, string> = {};
  const zone: Record<string, string> = {};
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function register(label: string) {
    const email = `${label}-${randomUUID().slice(0, 8)}@test.dev`;
    const res = await h.http
      .post(`${API}/auth/register`)
      .send({ firstName: label, lastName: 'Foto', email, password: PASSWORD })
      .expect(202);
    const verify = await h.http
      .post(`${API}/auth/register/verify`)
      .send({ verificationSessionId: res.body.verificationSessionId, code: h.mail.lastCodeFor(email) })
      .expect(200);
    return { email, token: verify.body.accessToken as string };
  }

  async function pro(label: string) {
    const user = await register(label);
    const res = await h.http
      .post(`${API}/pro/profile`)
      .set(auth(user.token))
      .send({
        headline: `${label} en Tandil`,
        yearsExperience: 3,
        serviceIds: [svc.plomeria],
        zoneIds: [zone.centro],
      })
      .expect(201);
    return { ...user, proId: res.body.id as string };
  }

  beforeAll(async () => {
    h = await startApp();
    for (const s of (await h.http.get(`${API}/services`).expect(200)).body) svc[s.slug] = s.id;
    for (const z of (await h.http.get(`${API}/zones`).expect(200)).body) zone[z.slug] = z.id;
  }, 60_000);

  afterAll(async () => {
    await h?.app.close();
  });

  describe('avatar', () => {
    const ticket = (token: string) => h.http.post(`${API}/pro/profile/avatar/upload`).set(auth(token));
    const confirm = (token: string, publicId: string) =>
      h.http.put(`${API}/pro/profile/avatar`).set(auth(token)).send({ publicId });

    it('CORS: el navegador puede confirmar (PUT) y eliminar (DELETE) desde el frontend', async () => {
      for (const method of ['PUT', 'DELETE']) {
        const res = await h.http
          .options(`${API}/pro/profile/avatar`)
          .set('Origin', 'http://localhost:4200')
          .set('Access-Control-Request-Method', method)
          .set('Access-Control-Request-Headers', 'authorization,content-type');
        expect(res.status).toBeLessThan(300);
        expect(res.headers['access-control-allow-methods']).toContain(method);
      }
    });

    it('firma por carpeta de SU perfil (sin email ni teléfono) y solo imágenes', async () => {
      const p = await pro('firma');
      const res = await ticket(p.token).expect(201);
      expect(res.body.publicId).toMatch(new RegExp(`^resuelve/avatars/${p.proId}/[0-9a-f-]{36}$`));
      expect(res.body.publicId).not.toContain(p.email);
      expect(res.body.allowedFormats).toEqual(['jpg', 'png', 'webp']);
      expect(res.body.maxBytes).toBe(5 * 1024 * 1024);
      expect(res.body.fields.type).toBe('upload');
    });

    it('subir → perfil propio, público, resultados y /auth/me muestran la foto; reemplazar borra la anterior', async () => {
      const p = await pro('sube');
      const first = (await ticket(p.token).expect(201)).body.publicId as string;
      h.avatars.upload(first, 'jpg');
      const own = await confirm(p.token, first).expect(200);
      expect(own.body.avatarUrl).toContain('c_fill,g_auto,w_256,h_256,q_auto,f_auto');
      expect(own.body.avatarUrl).toContain(first);

      const pub = await h.http.get(`${API}/professionals/${p.proId}`).expect(200);
      expect(pub.body.avatarUrl).toBe(own.body.avatarUrl);
      expect(JSON.stringify(pub.body)).not.toContain('avatarPublicId');
      const list = await h.http
        .get(`${API}/professionals`)
        .query({ service: svc.plomeria, pageSize: 50 })
        .expect(200);
      expect(list.body.items.find((i: { id: string }) => i.id === p.proId).avatarUrl).toBe(
        own.body.avatarUrl,
      );
      expect((await h.http.get(`${API}/auth/me`).set(auth(p.token)).expect(200)).body.avatarUrl).toBe(
        own.body.avatarUrl,
      );

      const second = (await ticket(p.token).expect(201)).body.publicId as string;
      h.avatars.upload(second, 'webp');
      const replaced = await confirm(p.token, second).expect(200);
      expect(replaced.body.avatarUrl).toContain(second);
      await new Promise((r) => setTimeout(r, 20));
      expect(h.avatars.destroyed).toContain(first);
    });

    it('eliminar → vuelven las iniciales (avatarUrl null) y se borra del proveedor', async () => {
      const p = await pro('borra');
      const id = (await ticket(p.token).expect(201)).body.publicId as string;
      h.avatars.upload(id);
      await confirm(p.token, id).expect(200);
      const res = await h.http.delete(`${API}/pro/profile/avatar`).set(auth(p.token)).expect(200);
      expect(res.body.avatarUrl).toBeNull();
      await new Promise((r) => setTimeout(r, 20));
      expect(h.avatars.destroyed).toContain(id);
    });

    it('formato o peso REAL inválido → 422 INVALID_IMAGE y se borra', async () => {
      const p = await pro('pesada');
      const big = (await ticket(p.token).expect(201)).body.publicId as string;
      h.avatars.upload(big, 'jpg', 6 * 1024 * 1024);
      expect((await confirm(p.token, big).expect(422)).body.code).toBe('INVALID_IMAGE');
      expect(h.avatars.destroyed).toContain(big);
      const gif = (await ticket(p.token).expect(201)).body.publicId as string;
      h.avatars.upload(gif, 'gif');
      expect((await confirm(p.token, gif).expect(422)).body.code).toBe('INVALID_IMAGE');
    });

    it('foto de otra carpeta o inexistente → 404; publicId con otra forma → 400', async () => {
      const a = await pro('duenio');
      const b = await pro('ajeno');
      const aId = (await ticket(a.token).expect(201)).body.publicId as string;
      h.avatars.upload(aId);
      await confirm(b.token, aId).expect(404);
      await confirm(a.token, `resuelve/avatars/${a.proId}/${randomUUID()}`).expect(404);
      await confirm(a.token, 'resuelve/verifications/x/y').expect(400);
    });

    it('sin Cloudinary → 503 UPLOADS_NOT_CONFIGURED; sin perfil profesional → 403', async () => {
      const p = await pro('sin-cloud');
      h.avatars.configured = false;
      try {
        expect((await ticket(p.token).expect(503)).body.code).toBe('UPLOADS_NOT_CONFIGURED');
      } finally {
        h.avatars.configured = true;
      }
      const client = await register('cliente');
      await ticket(client.token).expect(403);
    });
  });

  describe('ubicación', () => {
    afterEach(() => {
      h.location.configured = false;
      h.location.fail = false;
      h.location.place = null;
      h.location.suggestions = [];
    });

    it('sin proveedor: config apagada y las consultas de geocoding responden 503', async () => {
      expect((await h.http.get(`${API}/location/config`).expect(200)).body).toEqual({ enabled: false, mapApiKey: null });
      const res = await h.http.post(`${API}/location/reverse`).send({ lat: -37.32, lng: -59.13 }).expect(503);
      expect(res.body.code).toBe('LOCATION_NOT_CONFIGURED');
    });

    it('"Usar mi ubicación": devuelve coordenadas para previsualizar; solo la confirmación del pedido las persiste', async () => {
      h.location.configured = true;
      h.location.place = {
        formattedAddress: 'Gral. Paz 1234, B7000 Tandil, Provincia de Buenos Aires, Argentina',
        street: 'Gral. Paz',
        number: '1234',
        neighbourhood: 'Villa Italia',
        locality: 'Tandil',
      };
      const res = await h.http
        .post(`${API}/location/reverse`)
        .send({ lat: -37.3211, lng: -59.1401 })
        .expect(200);
      expect(res.body.result).toEqual({
        address: 'Gral. Paz 1234',
        formattedAddress: 'Gral. Paz 1234, B7000 Tandil, Provincia de Buenos Aires, Argentina',
        zone: { id: zone['villa-italia'], name: 'Villa Italia' },
        outsideCity: false,
        cityVerified: true,
        latitude: -37.3211,
        longitude: -59.1401,
        providerPlaceId: null,
      });
      expect(res.body.result.latitude).toBe(-37.3211);
    });

    it('sin barrio reconocible → zone null (no se elige uno cualquiera); fuera de Tandil → outsideCity', async () => {
      h.location.configured = true;
      h.location.place = {
        formattedAddress: 'Ruta 226 km 160, Tandil',
        street: null,
        number: null,
        neighbourhood: 'Barrio Nuevo',
        locality: 'Tandil',
      };
      expect(
        (await h.http.post(`${API}/location/resolve`).send({ address: 'Ruta 226 km 160' }).expect(200)).body
          .result.zone,
      ).toBeNull();
      h.location.place = {
        formattedAddress: 'Centro, Azul',
        street: null,
        number: null,
        neighbourhood: 'Centro',
        locality: 'Azul',
      };
      const res = await h.http.post(`${API}/location/resolve`).send({ placeId: 'abc' }).expect(200);
      expect(res.body.result).toMatchObject({ zone: null, outsideCity: true });
    });

    it('autocompletar pasa por el backend; falla del proveedor → 502 recuperable', async () => {
      h.location.configured = true;
      h.location.suggestions = [{ id: 'p1', main: 'Alem 455', secondary: 'Tandil, Buenos Aires' }];
      const ok = await h.http.post(`${API}/location/autocomplete`).send({ query: 'Alem 4' }).expect(200);
      expect(ok.body.items).toEqual(h.location.suggestions);
      h.location.fail = true;
      expect(
        (await h.http.post(`${API}/location/autocomplete`).send({ query: 'Alem 4' }).expect(502)).body.code,
      ).toBe('LOCATION_PROVIDER_ERROR');
    });

    it('valida la entrada (coordenadas, largo de la búsqueda)', async () => {
      h.location.configured = true;
      await h.http.post(`${API}/location/reverse`).send({ lat: 123, lng: 0 }).expect(400);
      await h.http.post(`${API}/location/autocomplete`).send({ query: 'ab' }).expect(400);
      await h.http.post(`${API}/location/resolve`).send({}).expect(400);
    });
  });
});
