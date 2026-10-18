import { ConfigService } from '@nestjs/config';
import { EmailService } from './email.service';
import { EmailMessage } from './email-sender';

describe('Avisos de actividad por email', () => {
  it('conserva todos los enlaces en texto plano y HTML cuando hay varias novedades', async () => {
    const send = jest.fn<Promise<void>, [EmailMessage]>().mockResolvedValue(undefined);
    const email = new EmailService({ send }, new ConfigService());
    const urls = ['https://resuelve.com.ar/mis-solicitudes/uno', 'https://resuelve.com.ar/mis-solicitudes/dos'];
    await email.sendActivityNotice({
      to: 'cliente@test.dev',
      items: urls.map((url) => ({ text: 'Recibiste un presupuesto nuevo', url })),
      unsubscribeUrl: 'https://resuelve.com.ar/avisos/baja?t=token-de-prueba',
    });
    expect(send).toHaveBeenCalledTimes(1);
    const message = send.mock.calls[0][0];
    for (const url of urls) {
      expect(message.text).toContain(`- Recibiste un presupuesto nuevo: ${url}`);
      expect(message.html).toContain(`href="${url}"`);
    }
  });
});
