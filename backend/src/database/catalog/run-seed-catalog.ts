import 'reflect-metadata';
import dataSource from '../data-source';
import { seedCatalog } from './seed-catalog';

/**
 * `npm run seed:catalog`: inicializa el catálogo productivo (ciudades, zonas,
 * categorías y servicios). Seguro de correr en producción y las veces que
 * haga falta. Requiere que las migraciones ya estén aplicadas.
 */
async function main(): Promise<void> {
  await dataSource.initialize();
  try {
    const pending = await dataSource.showMigrations();
    if (pending) {
      throw new Error(
        'Hay migraciones pendientes. Corré primero las migraciones (migration:run / migration:run:prod).',
      );
    }
    const result = await dataSource.transaction((m) => seedCatalog(m));
    const line = (label: string, c: { inserted: number; updated: number }) =>
      `  ${label.padEnd(11)} ${c.inserted} creados · ${c.updated} ya existían (actualizados)`;
    console.log(
      [
        'Catálogo listo:',
        line('Ciudades', result.cities),
        line('Zonas', result.zones),
        line('Categorías', result.categories),
        line('Servicios', result.services),
      ].join('\n'),
    );
  } finally {
    await dataSource.destroy();
  }
}

main().catch((err: unknown) => {
  console.error('No se pudo cargar el catálogo:', err instanceof Error ? err.message : err);
  process.exit(1);
});
