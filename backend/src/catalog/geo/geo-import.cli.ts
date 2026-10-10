import 'reflect-metadata';
import { readFileSync } from 'fs';
import { parseArgs } from '../../common/cli';
import dataSource from '../../database/data-source';
import { GEOREF_CENSUS_LOCALITIES_URL, importGeorefLocalities, parseGeorefCensusLocalities } from './georef';

/**
 * `npm run geo:import [-- --file localidades-censales.json | --url URL] [--dry-run]`
 *
 * Carga el catálogo nacional de localidades desde Georef (por defecto, el JSON
 * oficial de localidades censales). Idempotente: se puede volver a correr para
 * actualizar el catálogo. Requiere las migraciones aplicadas. `--dry-run`
 * muestra lo que haría y revierte.
 */
async function main(): Promise<void> {
  const { flags } = parseArgs(['import', ...process.argv.slice(2)]);
  const file = typeof flags.file === 'string' ? flags.file : null;
  const url = typeof flags.url === 'string' ? flags.url : GEOREF_CENSUS_LOCALITIES_URL;
  let raw: unknown;
  if (file) raw = JSON.parse(readFileSync(file, 'utf8'));
  else {
    console.log(`Descargando ${url}…`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Georef respondió ${res.status}`);
    raw = await res.json();
    const page = raw as { total?: number; cantidad?: number };
    if (page.total && page.cantidad && page.cantidad < page.total)
      throw new Error(`La respuesta está incompleta (${page.cantidad} de ${page.total}): bajá el archivo completo y usá --file.`);
  }
  const { items, skipped } = parseGeorefCensusLocalities(raw);
  console.log(`${items.length} localidades en el archivo (${skipped} descartadas por formato).`);

  await dataSource.initialize();
  try {
    if (await dataSource.showMigrations())
      throw new Error('Hay migraciones pendientes: corré migration:run primero.');
    const runner = dataSource.createQueryRunner();
    await runner.startTransaction();
    try {
      const result = await importGeorefLocalities(runner.manager, items);
      console.log(
        `Nuevas: ${result.inserted} · actualizadas: ${result.updated} · vinculadas a una ciudad existente: ${result.linked}` +
          (result.unknownProvince
            ? ` · con provincia desconocida (omitidas): ${result.unknownProvince}`
            : ''),
      );
      if (flags['dry-run']) {
        await runner.rollbackTransaction();
        console.log('--dry-run: no se guardó nada.');
      } else await runner.commitTransaction();
    } catch (error) {
      await runner.rollbackTransaction();
      throw error;
    } finally {
      await runner.release();
    }
  } finally {
    await dataSource.destroy();
  }
}

main().catch((err: unknown) => {
  console.error('No se pudo importar el catálogo de localidades:', err instanceof Error ? err.message : err);
  process.exit(1);
});
