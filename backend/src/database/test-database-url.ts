const LOCAL_DATABASE_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export interface TestDatabaseTarget {
  host: string;
  port: string;
  database: string;
}

/**
 * E2E vacía y recrea el esquema completo. Aceptamos solo una DB local y
 * descartable para evitar que TEST_DATABASE_URL pueda apuntar a producción.
 */
export function assertSafeTestDatabaseUrl(value: string): TestDatabaseTarget {
  let target: URL;
  try {
    target = new URL(value);
  } catch {
    throw new Error('TEST_DATABASE_URL debe ser una URL PostgreSQL local válida.');
  }

  const host = target.hostname.toLowerCase();
  const port = target.port || '5432';
  const database = decodeURIComponent(target.pathname.replace(/^\/+/, ''));
  if (!LOCAL_DATABASE_HOSTS.has(host) || !/(test|e2e)/i.test(database)) {
    throw new Error(
      `E2E bloqueado: TEST_DATABASE_URL debe apuntar a loopback y a una base cuyo nombre incluya test o e2e (host=${host}, port=${port}, database=${database || '<vacía>'}). No se conectó ni modificó la base.`,
    );
  }
  return { host, port, database };
}
