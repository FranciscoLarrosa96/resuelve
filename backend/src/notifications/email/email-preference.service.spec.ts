import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { EmailPreferenceService } from './email-preference.service';

describe('Disponibilidad de avisos por email', () => {
  const setup = (values: Record<string, unknown>) => {
    const query = jest.fn().mockResolvedValue([]);
    const config = { get: (key: string, fallback?: unknown) => values[key] ?? fallback } as ConfigService;
    return { service: new EmailPreferenceService({ query } as unknown as DataSource, config), query };
  };

  it.each([
    [{}, false],
    [{ EMAIL_NOTIFICATIONS_ENABLED: false, RESEND_API_KEY: 'test-only' }, false],
    [{ EMAIL_NOTIFICATIONS_ENABLED: true }, false],
    [{ EMAIL_NOTIFICATIONS_ENABLED: true, RESEND_API_KEY: 'test-only' }, true],
    [{ EMAIL_NOTIFICATIONS_ENABLED: true, SMTP_HOST: 'smtp.test' }, true],
  ])('comparte la regla de configuración con el scheduler: %j', (config, enabled) => {
    const { service, query } = setup(config);
    expect(service.deliveryConfig()).toEqual({ deliveryEnabled: enabled });
    expect(query).not.toHaveBeenCalled();
  });

  it('guardar una preferencia no enciende el envío ni expone las claves del proveedor', async () => {
    const { service, query } = setup({ EMAIL_NOTIFICATIONS_ENABLED: false, RESEND_API_KEY: 'test-only' });
    expect(await service.set('user-test', true)).toEqual({ enabled: true, deliveryEnabled: false });
    expect(query).toHaveBeenCalledWith(expect.stringContaining('UPDATE users'), ['user-test', true]);
  });
});
