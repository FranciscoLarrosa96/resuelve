import { randomUUID } from 'crypto';
import { describeE2E, Harness, startApp } from './app.harness';

const API = '/api/v1';
describeE2E('Especialidades propias (e2e)', () => {
  let h: Harness;
  let token: string;
  let id: string;
  let serviceId: string;
  let otherId: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    h = await startApp({ emailVerification: false });
    const services = (await h.http.get(`${API}/services`)).body;
    serviceId = services.find((s: { slug: string }) => s.slug === 'gas').id;
    otherId = services.find((s: { slug: string }) => s.slug === 'plomeria').id;
    const user = await h.http.post(`${API}/auth/register`).send({
      firstName: 'Especialista', lastName: 'Prueba', email: `especialista-${randomUUID()}@test.dev`, password: 'una-clave-de-prueba-larga',
    }).expect(201);
    token = user.body.accessToken;
  }, 60_000);
  afterAll(async () => h?.app.close());

  it('crea especialidades en Free, las publica y no altera catálogo ni matrícula', async () => {
    const created = await h.http.post(`${API}/pro/profile`).set(auth()).send({
      headline: 'Reparaciones', yearsExperience: 3, serviceIds: [serviceId], coversEntireCity: true,
      specialties: [{ serviceId, names: ['  Reparación  de calderas  '] }],
    }).expect(201);
    id = created.body.id;
    expect(created.body.plan.tier).toBe('FREE');
    expect(created.body.offeredServices[0].specialties).toEqual(['Reparación de calderas']);
    const pub = (await h.http.get(`${API}/professionals/${id}`).expect(200)).body;
    expect(pub.services[0].specialties).toEqual(['Reparación de calderas']);
    expect(pub.verifications.license).toBe(false);
    expect(pub.services[0].id).toBe(serviceId);
    const catalog = (await h.http.get(`${API}/services`)).body;
    expect(catalog.some((s: { name: string }) => s.name === 'Reparación de calderas')).toBe(false);
  });

  it('conserva especialidades en cambios de presentación/servicios; permite quitarlas explícitamente', async () => {
    await h.http.patch(`${API}/pro/profile`).set(auth()).send({ bio: 'Trabajo prolijo.' }).expect(200);
    const updated = await h.http.patch(`${API}/pro/profile`).set(auth()).send({ serviceIds: [serviceId, otherId] }).expect(200);
    expect(updated.body.offeredServices.find((s: { id: string }) => s.id === serviceId).specialties).toEqual(['Reparación de calderas']);
    const cleared = await h.http.patch(`${API}/pro/profile`).set(auth()).send({ specialties: [{ serviceId, names: [] }] }).expect(200);
    expect(cleared.body.offeredServices.find((s: { id: string }) => s.id === serviceId).specialties).toEqual([]);
  });

  it('valida en el servidor el rubro, tamaño, texto y ausencia de contacto', async () => {
    for (const specialties of [
      [{ serviceId: randomUUID(), names: ['Otro'] }],
      [{ serviceId, names: ['Calderas', 'Cálderas'] }],
      [{ serviceId, names: ['hola@ejemplo.com'] }],
      [{ serviceId, names: ['www.ejemplo.com'] }],
      [{ serviceId, names: ['uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis'] }],
    ]) {
      const response = await h.http.patch(`${API}/pro/profile`).set(auth()).send({ specialties });
      expect([400, 422]).toContain(response.status);
    }
  });
});
