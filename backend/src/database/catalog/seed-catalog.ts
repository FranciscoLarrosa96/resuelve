import type { EntityManager } from 'typeorm';
import { CATALOG_CATEGORIES, CATALOG_CITIES, CatalogCategory, CatalogCity } from './catalog.data';

export interface CatalogSeedResult {
  cities: { inserted: number; updated: number };
  zones: { inserted: number; updated: number };
  categories: { inserted: number; updated: number };
  services: { inserted: number; updated: number };
}

type Counter = { inserted: number; updated: number };

/**
 * Carga (o actualiza) el catálogo de referencia. Idempotente y seguro en
 * producción:
 *
 * - Upsert por slug (`INSERT … ON CONFLICT … DO UPDATE`), apoyado en los
 *   índices únicos que ya crea la migración inicial: correrlo N veces deja
 *   exactamente los mismos registros, con los mismos ids.
 * - Actualiza nombre, orden, categoría y `requiresLicense` para que el
 *   catálogo coincida con `catalog.data.ts`.
 * - NO toca `active` de filas existentes: si alguien desactiva un servicio en
 *   la base, volver a correr el script no lo reactiva. Única excepción: un
 *   barrio marcado `active: false` en los datos se desactiva (baja sin borrar).
 * - NO borra nada que no esté en la lista, y NO crea usuarios,
 *   profesionales, pedidos, presupuestos ni reseñas.
 *
 * Debe ejecutarse dentro de una transacción (lo hace `run-seed-catalog.ts`).
 */
export async function seedCatalog(
  m: EntityManager,
  cities: CatalogCity[] = CATALOG_CITIES,
  categories: CatalogCategory[] = CATALOG_CATEGORIES,
): Promise<CatalogSeedResult> {
  const result: CatalogSeedResult = {
    cities: { inserted: 0, updated: 0 },
    zones: { inserted: 0, updated: 0 },
    categories: { inserted: 0, updated: 0 },
    services: { inserted: 0, updated: 0 },
  };

  for (const city of cities) {
    const cityId = await upsert(
      m,
      result.cities,
      `INSERT INTO cities (name, slug, province, active)
       VALUES ($1, $2, $3, true)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, province = EXCLUDED.province
       RETURNING id, (xmax = 0) AS inserted`,
      [city.name, city.slug, city.province],
    );
    for (const [sortOrder, zone] of city.zones.entries()) {
      await upsert(
        m,
        result.zones,
        `INSERT INTO zones (city_id, name, slug, sort_order, active)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (city_id, slug) DO UPDATE SET name = EXCLUDED.name, sort_order = EXCLUDED.sort_order,
           active = CASE WHEN EXCLUDED.active THEN zones.active ELSE false END
         RETURNING id, (xmax = 0) AS inserted`,
        [cityId, zone.name, zone.slug, sortOrder, zone.active ?? true],
      );
    }
  }

  for (const [categoryOrder, category] of categories.entries()) {
    const categoryId = await upsert(
      m,
      result.categories,
      `INSERT INTO categories (name, slug, sort_order, active)
       VALUES ($1, $2, $3, true)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, sort_order = EXCLUDED.sort_order
       RETURNING id, (xmax = 0) AS inserted`,
      [category.name, category.slug, categoryOrder],
    );
    for (const [serviceOrder, service] of category.services.entries()) {
      await upsert(
        m,
        result.services,
        `INSERT INTO services (category_id, name, slug, requires_license, sort_order, active)
         VALUES ($1, $2, $3, $4, $5, true)
         ON CONFLICT (slug) DO UPDATE SET
           category_id = EXCLUDED.category_id,
           name = EXCLUDED.name,
           requires_license = EXCLUDED.requires_license,
           sort_order = EXCLUDED.sort_order
         RETURNING id, (xmax = 0) AS inserted`,
        [categoryId, service.name, service.slug, service.requiresLicense, serviceOrder],
      );
    }
  }

  return result;
}

/** Ejecuta un upsert con RETURNING y cuenta si insertó (xmax = 0) o actualizó. */
async function upsert(m: EntityManager, counter: Counter, sql: string, params: unknown[]): Promise<string> {
  const rows: { id: string; inserted: boolean }[] = await m.query(sql, params);
  if (rows[0].inserted) counter.inserted++;
  else counter.updated++;
  return rows[0].id;
}
