import 'reflect-metadata';

/**
 * Profesionales DE PRUEBA para validar la integración de profesionales en
 * staging/producción, sin tocar el seed de desarrollo (que nunca corre en
 * producción).
 *
 * `create` usa SOLO la API pública real (registro + "Modo profesional"),
 * igual que lo haría una persona: POST /auth/register (o /auth/login si ya
 * existe), POST /pro/profile y PATCH /pro/availability. No escribe SQL ni
 * inventa métricas, verificaciones, reseñas ni portfolio.
 *
 * `remove` borra esas cuentas de la base (DATABASE_URL). Solo toca los
 * emails de TEST_PROFESSIONALS (dominio reservado .test); el borrado en
 * cascada se lleva perfil, servicios, zonas, verificaciones, portfolio y
 * sesiones.
 *
 * Uso (desde backend/, después de `npm run build`):
 *   TEST_PRO_PASSWORD='…' node dist/database/fixtures/test-professionals.js create --api https://resuelve-k3k5.onrender.com/api/v1 [--count 2]
 *   node dist/database/fixtures/test-professionals.js remove
 */

interface TestProfessional {
  email: string;
  firstName: string;
  lastName: string;
  headline: string;
  bio: string;
  yearsExperience: number;
  serviceSlugs: string[];
  zoneSlugs: string[];
  availableToday: boolean;
}

export const TEST_PROFESSIONALS: TestProfessional[] = [
  {
    email: 'prueba.profesional.1@resuelve.test',
    firstName: 'Profesional',
    lastName: 'de prueba 1',
    headline: 'Perfil de prueba · Electricidad y Plomería',
    bio: 'Perfil de prueba creado para validar Resuelve. No es un profesional real: no lo contrates.',
    yearsExperience: 1,
    serviceSlugs: ['electricidad', 'plomeria'],
    zoneSlugs: ['centro', 'villa-italia'],
    availableToday: true,
  },
  {
    email: 'prueba.profesional.2@resuelve.test',
    firstName: 'Profesional',
    lastName: 'de prueba 2',
    headline: 'Perfil de prueba · Plomería y Gas',
    bio: 'Segundo perfil de prueba, solo para validar la comparación. No es un profesional real.',
    yearsExperience: 1,
    serviceSlugs: ['plomeria', 'gas'],
    zoneSlugs: ['centro', 'uncas'],
    availableToday: false,
  },
];

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};

async function call<T>(
  api: string,
  method: string,
  path: string,
  body?: unknown,
  token?: string,
): Promise<T> {
  const res = await fetch(`${api}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = new Error(`${method} ${path} → ${res.status} ${json?.code ?? ''}`) as Error & {
      status: number;
    };
    err.status = res.status;
    throw err;
  }
  return json as T;
}

async function create(): Promise<void> {
  const api = (arg('api') ?? 'http://localhost:3000/api/v1').replace(/\/$/, '');
  const count = Math.min(Math.max(Number(arg('count') ?? 1), 1), TEST_PROFESSIONALS.length);
  const password = process.env.TEST_PRO_PASSWORD;
  if (!password || password.length < 10) {
    throw new Error('Definí TEST_PRO_PASSWORD (mínimo 10 caracteres). No se guarda en ningún lado.');
  }

  const services = await call<{ id: string; slug: string }[]>(api, 'GET', '/services');
  const zones = await call<{ id: string; slug: string }[]>(api, 'GET', '/zones?city=tandil');
  const idsOf = (list: { id: string; slug: string }[], slugs: string[], what: string) =>
    slugs.map((slug) => {
      const found = list.find((x) => x.slug === slug);
      if (!found) throw new Error(`No existe ${what} "${slug}". ¿Corriste seed:catalog?`);
      return found.id;
    });

  for (const pro of TEST_PROFESSIONALS.slice(0, count)) {
    let tokens: { accessToken: string };
    try {
      tokens = await call(api, 'POST', '/auth/register', {
        firstName: pro.firstName,
        lastName: pro.lastName,
        email: pro.email,
        password,
      });
    } catch (e) {
      if ((e as { status?: number }).status !== 409) throw e;
      tokens = await call(api, 'POST', '/auth/login', { email: pro.email, password });
    }
    const me = await call<{ professionalProfileId: string | null }>(
      api,
      'GET',
      '/auth/me',
      undefined,
      tokens.accessToken,
    );
    const profile = {
      headline: pro.headline,
      bio: pro.bio,
      yearsExperience: pro.yearsExperience,
      serviceIds: idsOf(services, pro.serviceSlugs, 'el servicio'),
      zoneIds: idsOf(zones, pro.zoneSlugs, 'la zona'),
    };
    const saved = me.professionalProfileId
      ? await call<{ id: string }>(api, 'PATCH', '/pro/profile', profile, tokens.accessToken)
      : await call<{ id: string }>(api, 'POST', '/pro/profile', profile, tokens.accessToken);
    await call(api, 'PATCH', '/pro/availability', { availableToday: pro.availableToday }, tokens.accessToken);
    console.log(`✓ ${pro.firstName} ${pro.lastName} · ${pro.email} · perfil ${saved.id}`);
  }
  console.log(
    '"Disponible hoy" vence a medianoche (hora de Argentina): volvé a correr create para renovarlo.',
  );
}

async function remove(): Promise<void> {
  const { default: dataSource } = await import('../data-source');
  await dataSource.initialize();
  try {
    const emails = TEST_PROFESSIONALS.map((p) => p.email);
    // Con Postgres, TypeORM devuelve [filas, cantidad] para DELETE … RETURNING.
    const [deleted] = (await dataSource.query(
      'DELETE FROM users WHERE lower(email) = ANY($1) RETURNING email',
      [emails],
    )) as [{ email: string }[], number];
    console.log(
      deleted.length
        ? `Eliminados: ${deleted.map((d) => d.email).join(', ')}`
        : 'No había profesionales de prueba para eliminar.',
    );
  } finally {
    await dataSource.destroy();
  }
}

const command = process.argv[2];
(command === 'create'
  ? create()
  : command === 'remove'
    ? remove()
    : Promise.reject(new Error('Uso: create | remove'))
).catch((err: unknown) => {
  console.error('Error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
