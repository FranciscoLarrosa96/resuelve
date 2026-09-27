import { ConfigService } from '@nestjs/config';
import { createEmailSender } from './email.module';
import { buildProviderRequest, HttpEmailSender, parseFromAddress } from './http-email-sender';
import { NoopEmailSender } from './noop-email-sender';
import { SmtpEmailSender } from './smtp-email-sender';

const message = { to: 'ana@example.com', subject: 'Código', html: '<b>123456</b>', text: '123456' };

describe('parseFromAddress', () => {
  it('separa nombre y email', () => {
    expect(parseFromAddress('Resuelve <hola@resuelve.dev>')).toEqual({ name: 'Resuelve', email: 'hola@resuelve.dev' });
    expect(parseFromAddress('"Resuelve Tandil" <hola@gmail.com>')).toEqual({ name: 'Resuelve Tandil', email: 'hola@gmail.com' });
  });

  it('acepta un email solo', () => {
    expect(parseFromAddress(' hola@gmail.com ')).toEqual({ email: 'hola@gmail.com' });
    expect(parseFromAddress('<hola@gmail.com>')).toEqual({ email: 'hola@gmail.com' });
  });
});

describe('buildProviderRequest', () => {
  it('Brevo: api-key y sender separado', () => {
    const req = buildProviderRequest({ provider: 'brevo', apiKey: 'k', from: 'Resuelve <a@b.com>' }, message);
    expect(req.url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(req.headers['api-key']).toBe('k');
    expect(req.body).toEqual({
      sender: { name: 'Resuelve', email: 'a@b.com' },
      to: [{ email: 'ana@example.com' }],
      subject: 'Código',
      htmlContent: '<b>123456</b>',
      textContent: '123456',
    });
  });

  it('Resend: bearer y from tal cual', () => {
    const req = buildProviderRequest({ provider: 'resend', apiKey: 'k', from: 'Resuelve <a@b.com>' }, message);
    expect(req.url).toBe('https://api.resend.com/emails');
    expect(req.headers.authorization).toBe('Bearer k');
    expect(req.body).toMatchObject({ from: 'Resuelve <a@b.com>', to: ['ana@example.com'] });
  });
});

describe('HttpEmailSender', () => {
  afterEach(() => jest.restoreAllMocks());

  it('un error del proveedor se propaga con el detalle', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response('{"message":"sender not valid"}', { status: 400 }));
    const sender = new HttpEmailSender({ provider: 'brevo', apiKey: 'k', from: 'a@b.com' });
    await expect(sender.send(message)).rejects.toThrow('brevo respondió 400: {"message":"sender not valid"}');
  });

  it('2xx resuelve', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 201 }));
    await new HttpEmailSender({ provider: 'resend', apiKey: 'k', from: 'a@b.com' }).send(message);
    expect(fetchMock).toHaveBeenCalledWith('https://api.resend.com/emails', expect.objectContaining({ method: 'POST' }));
  });
});

describe('createEmailSender', () => {
  const config = (env: Record<string, unknown>) => new ConfigService(env);

  it('API HTTPS antes que SMTP (Render bloquea SMTP)', () => {
    expect(createEmailSender(config({ BREVO_API_KEY: 'k', SMTP_HOST: 'smtp.gmail.com' }))).toBeInstanceOf(HttpEmailSender);
    expect(createEmailSender(config({ RESEND_API_KEY: 'k' }))).toBeInstanceOf(HttpEmailSender);
  });

  it('SMTP solo con SMTP_HOST; sin nada, Noop', () => {
    expect(createEmailSender(config({ SMTP_HOST: 'smtp.gmail.com' }))).toBeInstanceOf(SmtpEmailSender);
    expect(createEmailSender(config({}))).toBeInstanceOf(NoopEmailSender);
  });
});
