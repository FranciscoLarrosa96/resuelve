import { DataSource } from 'typeorm';
import { CATALOG_CATEGORIES } from '../src/database/catalog/catalog.data';
import { seedCatalog } from '../src/database/catalog/seed-catalog';
import { buildDataSourceOptions } from '../src/database/typeorm.options';
import { describeE2E, TEST_DB_URL } from './app.harness';

/** `npm run seed:catalog` contra PostgreSQL real: crea el catálogo y es idempotente. */
describeE2E('seed:catalog (PostgreSQL real)', () => {
  let ds: DataSource;
  const count = async (table: string) =>
    Number((await ds.query(`SELECT COUNT(*)::int AS n FROM ${table}`))[0].n);
  const expectedServices = CATALOG_CATEGORIES.reduce((n, c) => n + c.services.length, 0);

  beforeAll(async () => {
    ds = new DataSource(buildDataSourceOptions({ DATABASE_URL: TEST_DB_URL! }));
    await ds.initialize();
    await ds.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await ds.runMigrations({ transaction: 'each' });
  });

  afterAll(async () => {
    await ds?.destroy();
  });

  it('la primera ejecución crea el catálogo completo (y nada más)', async () => {
    const result = await ds.transaction((m) => seedCatalog(m));
    expect(result.cities).toEqual({ inserted: 1, updated: 0 });
    expect(result.zones).toEqual({ inserted: 5, updated: 0 });
    expect(result.categories).toEqual({ inserted: 4, updated: 0 });
    expect(result.services).toEqual({ inserted: expectedServices, updated: 0 });
    for (const table of [
      'users',
      'professional_profiles',
      'service_requests',
      'quotes',
      'reviews',
      'appointments',
    ]) {
      expect(await count(table)).toBe(0);
    }
  });

  it('la segunda ejecución no duplica ni cambia ids', async () => {
    const before = await ds.query('SELECT id, slug FROM services ORDER BY slug');
    const result = await ds.transaction((m) => seedCatalog(m));
    expect(
      result.cities.inserted + result.zones.inserted + result.categories.inserted + result.services.inserted,
    ).toBe(0);
    expect(await count('cities')).toBe(1);
    expect(await count('zones')).toBe(5);
    expect(await count('categories')).toBe(4);
    expect(await count('services')).toBe(expectedServices);
    expect(await ds.query('SELECT id, slug FROM services ORDER BY slug')).toEqual(before);
  });

  it('cada servicio queda asociado a su categoría', async () => {
    const rows: { service: string; category: string; requires_license: boolean; active: boolean }[] =
      await ds.query(
        `SELECT s.slug AS service, c.slug AS category, s.requires_license, s.active
         FROM services s JOIN categories c ON c.id = s.category_id`,
      );
    expect(rows).toHaveLength(expectedServices);
    for (const category of CATALOG_CATEGORIES) {
      for (const service of category.services) {
        expect(rows.find((r) => r.service === service.slug)).toMatchObject({
          category: category.slug,
          requires_license: service.requiresLicense,
          active: true,
        });
      }
    }
  });

  it('las zonas quedan asociadas a Tandil', async () => {
    const rows: { zone: string; city: string; province: string }[] = await ds.query(
      `SELECT z.slug AS zone, c.slug AS city, c.province FROM zones z JOIN cities c ON c.id = z.city_id ORDER BY z.sort_order`,
    );
    expect(rows.map((r) => r.zone)).toEqual([
      'centro',
      'villa-italia',
      'uncas',
      'villa-aguirre',
      'la-movediza',
    ]);
    expect(rows.every((r) => r.city === 'tandil' && r.province === 'Buenos Aires')).toBe(true);
  });

  it('no reactiva lo que se desactivó a mano y respeta cambios del catálogo', async () => {
    await ds.query(`UPDATE services SET active = false WHERE slug = 'redes'`);
    await ds.query(`UPDATE services SET name = 'Nombre viejo' WHERE slug = 'poda'`);
    await ds.transaction((m) => seedCatalog(m));
    const [redes] = await ds.query(`SELECT active FROM services WHERE slug = 'redes'`);
    const [poda] = await ds.query(`SELECT name FROM services WHERE slug = 'poda'`);
    expect(redes.active).toBe(false);
    expect(poda.name).toBe('Poda');
  });
});
