import { assertSafeTestDatabaseUrl } from './test-database-url';

describe('assertSafeTestDatabaseUrl', () => {
  it('acepta una base de test loopback y devuelve el destino sin credenciales', () => {
    expect(assertSafeTestDatabaseUrl('postgresql://user:secret@localhost:5433/resuelve_test')).toEqual({
      host: 'localhost',
      port: '5433',
      database: 'resuelve_test',
    });
  });

  it('rechaza un host remoto incluso si la base se llama test', () => {
    expect(() => assertSafeTestDatabaseUrl('postgresql://user:secret@db.example.com/resuelve_test'))
      .toThrow(/debe apuntar a loopback/);
  });

  it('rechaza una base local que no parece descartable', () => {
    expect(() => assertSafeTestDatabaseUrl('postgresql://user:secret@localhost/resuelve'))
      .toThrow(/debe apuntar a loopback/);
  });
});
