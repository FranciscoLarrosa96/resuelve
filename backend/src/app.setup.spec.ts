import { corsOrigins } from './app.setup';

describe('corsOrigins', () => {
  it('permite localhost durante desarrollo y test', () => {
    expect(corsOrigins('https://resuelve.example', 'development')).toEqual([
      'https://resuelve.example',
      'http://localhost:4200',
    ]);
    expect(corsOrigins('https://resuelve.example', 'test')).toContain('http://localhost:4200');
  });

  it('no agrega localhost a los orígenes de producción', () => {
    expect(corsOrigins('https://resuelve.example, https://www.resuelve.example', 'production')).toEqual([
      'https://resuelve.example',
      'https://www.resuelve.example',
    ]);
  });

  it('tolera un dominio sin esquema o con barra final (el Origin del navegador siempre trae https://)', () => {
    expect(corsOrigins('https://resuelve-pearl.vercel.app,resuelve.com.ar', 'production')).toEqual([
      'https://resuelve-pearl.vercel.app',
      'https://resuelve.com.ar',
    ]);
    expect(corsOrigins('https://resuelve.com.ar/, http://localhost:4200', 'production')).toEqual([
      'https://resuelve.com.ar',
      'http://localhost:4200',
    ]);
  });
});
