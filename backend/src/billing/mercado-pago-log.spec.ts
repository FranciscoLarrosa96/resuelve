import { Logger } from '@nestjs/common';
import { BillingProviderError } from './billing-provider';
import { maskEmail, summarizeMercadoPagoError, summarizePreapprovalPayload } from './mercado-pago-log';
import { MercadoPagoBillingProvider } from './mercado-pago.provider';

const TOKEN = 'APP_USR-1234567890123456-092712-abcdefabcdefabcdefabcdefabcdef12-123456789';

describe('logs sanitizados de Mercado Pago', () => {
  it('enmascara emails conservando el dominio', () => {
    expect(maskEmail('juan.perez@gmail.com')).toBe('ju***@gmail.com');
    expect(maskEmail('test_user_123@testuser.com')).toBe('te***@testuser.com');
    expect(maskEmail('sin-arroba')).toBe('[redacted]');
    expect(maskEmail(undefined)).toBeNull();
  });

  it('resume status, message, error y cause[] del 400', () => {
    const raw = JSON.stringify({
      message: 'Both payer and collector must be real or test users',
      error: 'bad_request',
      status: 400,
      cause: [{ code: 'invalid_users', description: 'payer juan@gmail.com is not a test user', data: null }],
    });
    const summary = summarizeMercadoPagoError(400, raw);
    expect(summary).toMatchObject({
      status: 400,
      message: 'Both payer and collector must be real or test users',
      error: 'bad_request',
      cause: [{ code: 'invalid_users', description: 'payer ju***@gmail.com is not a test user' }],
    });
  });

  it('acepta cause como objeto y body no JSON', () => {
    expect(summarizeMercadoPagoError(400, JSON.stringify({ cause: { code: 123, description: 'x' } })).cause).toEqual([
      { code: '123', description: 'x' },
    ]);
    const text = summarizeMercadoPagoError(502, 'Bad gateway');
    expect(text).toMatchObject({ status: 502, message: null, body: 'Bad gateway' });
  });

  it('tapa secretos, tarjetas y datos personales del body', () => {
    const raw = JSON.stringify({
      message: `token ${TOKEN} y Bearer abc.def`,
      payer_email: 'juan@gmail.com',
      access_token: 'x',
      card_number: '4509953566233704',
      nested: { note: 'tarjeta 4509 9535 6623 3704', identification: { number: '30111222' } },
    });
    const summary = summarizeMercadoPagoError(400, raw, [TOKEN]);
    const text = JSON.stringify(summary);
    expect(text).not.toContain(TOKEN);
    expect(text).not.toContain('abc.def');
    expect(text).not.toContain('juan@gmail.com');
    expect(text).not.toContain('4509');
    expect(text).not.toContain('30111222');
    expect(summary.body).toMatchObject({
      payer_email: 'ju***@gmail.com',
      access_token: '[redacted]',
      card_number: '[redacted]',
      nested: { identification: '[redacted]' },
    });
  });

  it('resume el payload de /preapproval con el email enmascarado', () => {
    expect(
      summarizePreapprovalPayload({
        reason: 'Resuelve PRO',
        external_reference: 'sub-1',
        payer_email: 'juan@gmail.com',
        auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: 15200, currency_id: 'ARS' },
        back_url: 'https://resuelve.test/pro/plan/resultado',
        status: 'pending',
      }),
    ).toEqual({
      reason: 'Resuelve PRO',
      external_reference: 'sub-1',
      payer_email: 'ju***@gmail.com',
      auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: 15200, currency_id: 'ARS' },
      back_url: 'https://resuelve.test/pro/plan/resultado',
      status: 'pending',
    });
  });

  describe('MercadoPagoBillingProvider ante un 400 en POST /preapproval', () => {
    const originalFetch = global.fetch;
    let warn: jest.SpyInstance;

    beforeEach(() => {
      warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      global.fetch = jest.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            message: 'Invalid users involved',
            error: 'bad_request',
            status: 400,
            cause: [{ code: 'invalid_users', description: 'invalid users' }],
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    });

    afterEach(() => {
      global.fetch = originalFetch;
      warn.mockRestore();
    });

    it('loguea error y payload sanitizados, sin token, y lanza el error genérico', async () => {
      const provider = new MercadoPagoBillingProvider({ accessToken: TOKEN, timeoutMs: 1000 });
      const error = await provider
        .createSubscription({
          externalReference: 'sub-1',
          payerEmail: 'juan@gmail.com',
          reason: 'Resuelve PRO',
          amount: 15200,
          currency: 'ARS',
          backUrl: 'https://resuelve.test/pro/plan/resultado',
        })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BillingProviderError);
      expect((error as Error).message).toBe('Mercado Pago respondió 400');

      const line = String(warn.mock.calls[0][0]);
      expect(line).toContain('mp POST /preapproval → 400');
      expect(line).toContain('"message":"Invalid users involved"');
      expect(line).toContain('"error":"bad_request"');
      expect(line).toContain('"code":"invalid_users"');
      expect(line).toContain('"payer_email":"ju***@gmail.com"');
      expect(line).toContain('"transaction_amount":15200');
      expect(line).toContain('"frequency_type":"months"');
      expect(line).not.toContain(TOKEN);
      expect(line).not.toContain('juan@gmail.com');
      expect(line).not.toContain('Authorization');
    });
  });
});
