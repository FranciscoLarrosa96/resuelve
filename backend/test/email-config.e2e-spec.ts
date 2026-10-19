import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { describeE2E, Harness, startApp } from './app.harness';

describeE2E('Configuración de avisos por email (e2e)', () => {
  let h: Harness;
  let config: ConfigService;
  let token: string;
  const path = '/api/v1/me/notifications';
  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    h = await startApp({ emailVerification: false });
    config = h.app.get(ConfigService);
    const registered = await h.http.post('/api/v1/auth/register').send({
      firstName: 'Cliente', lastName: 'Prueba', email: `email-config-${randomUUID()}@test.dev`, password: 'una-clave-bien-larga',
    }).expect(201);
    token = registered.body.accessToken;
  }, 60_000);
  beforeEach(() => {
    config.set('EMAIL_NOTIFICATIONS_ENABLED', false);
    config.set('RESEND_API_KEY', '');
    config.set('SMTP_HOST', '');
  });
  afterAll(async () => h?.app.close());

  it('la configuración exige sesión', async () => {
    await h.http.get(`${path}/email-config`).expect(401);
  });

  it('solo expone disponibilidad, sin claves ni detalles del proveedor', async () => {
    config.set('EMAIL_NOTIFICATIONS_ENABLED', true);
    config.set('RESEND_API_KEY', 'test-only-secret');
    const result = await h.http.get(`${path}/email-config`).set(auth()).expect(200);
    expect(result.body).toEqual({ deliveryEnabled: true });
    config.set('EMAIL_NOTIFICATIONS_ENABLED', false);
    expect((await h.http.get(`${path}/email-config`).set(auth()).expect(200)).body)
      .toEqual({ deliveryEnabled: false });
  });

  it('guardar la preferencia con el envío apagado no lo habilita; devuelve el estado actual', async () => {
    const saved = await h.http.patch(`${path}/email-preference`).set(auth()).send({ enabled: true }).expect(200);
    expect(saved.body).toEqual({ enabled: true, deliveryEnabled: false });
    expect((await h.http.get('/api/v1/auth/me').set(auth()).expect(200)).body.emailNotifications).toBe(true);
    expect((await h.http.get(`${path}/email-config`).set(auth()).expect(200)).body.deliveryEnabled).toBe(false);
  });
});
