import { billingConfigError } from './env.validation';

const base = {
  NODE_ENV: 'production' as const,
  BILLING_PROVIDER: 'mercadopago' as const,
  MP_ENV: 'prod' as const,
  MP_ACCESS_TOKEN: 'APP_USR-x',
  MP_WEBHOOK_SECRET: 's',
  MP_BACK_URL: 'https://resuelve.test/pro/plan/resultado',
};

describe('billingConfigError', () => {
  it('producción completa es válida; none no exige nada', () => {
    expect(billingConfigError(base)).toBeNull();
    expect(billingConfigError({ ...base, BILLING_PROVIDER: 'none', MP_ACCESS_TOKEN: undefined })).toBeNull();
  });
  it('nunca Mercado Pago real en tests automáticos', () => {
    expect(billingConfigError({ ...base, NODE_ENV: 'test', MP_ENV: 'test' })).toMatch(/tests automáticos/);
  });
  it('credenciales productivas solo en producción', () => {
    expect(billingConfigError({ ...base, NODE_ENV: 'development' })).toMatch(/MP_ENV=prod/);
    expect(billingConfigError({ ...base, NODE_ENV: 'development', MP_ENV: 'test' })).toBeNull();
  });
  it('el proveedor falso nunca en producción', () => {
    expect(billingConfigError({ ...base, BILLING_PROVIDER: 'fake' })).toMatch(/fake/);
  });
  it('exige credenciales completas y back_url https', () => {
    expect(billingConfigError({ ...base, MP_WEBHOOK_SECRET: ' ' })).toMatch(/MP_WEBHOOK_SECRET/);
    expect(billingConfigError({ ...base, MP_BACK_URL: 'http://resuelve.test/x' })).toMatch(/https/);
  });
});
