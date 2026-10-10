import type { EntityManager } from 'typeorm';
import { geoSlug, normalizeGeoText } from './geo-text';

/**
 * Catálogo oficial de localidades: Georef Argentina (datos.gob.ar), recurso
 * "localidades censales" (INDEC). Se eligió sobre "localidades" (BAHRA, incluye
 * parajes y barrios: decenas de miles de entradas) y "municipios" (unidades de
 * gobierno, no lo que la gente busca): una localidad censal es una ciudad o
 * pueblo reconocible ("Tandil", "Mar del Plata", "Córdoba"). CABA es una sola.
 *
 * El archivo se descarga una vez por importación (nunca en una búsqueda) y se
 * normaliza en PostgreSQL. Reimportar es idempotente: actualiza por código
 * oficial, nunca cambia un slug ya publicado y nunca borra.
 */
export const GEOREF_CENSUS_LOCALITIES_URL = 'https://infra.datos.gob.ar/georef/localidades-censales.json';

export interface GeorefLocality {
  officialCode: string;
  name: string;
  provinceCode: string;
  departmentName: string | null;
  lat: number | null;
  lng: number | null;
}

interface RawGeorefLocality {
  id?: unknown;
  nombre?: unknown;
  provincia?: { id?: unknown } | null;
  departamento?: { nombre?: unknown } | null;
  centroide?: { lat?: unknown; lon?: unknown } | null;
}

const clean = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');
const coord = (v: unknown) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 1e6) / 1e6 : null;

/**
 * Acepta el JSON oficial (`{ localidades_censales: [...] }`) o un array con el
 * mismo formato. Descarta (y cuenta) entradas sin código de 8 dígitos o sin nombre.
 */
export function parseGeorefCensusLocalities(input: unknown): { items: GeorefLocality[]; skipped: number } {
  const list: RawGeorefLocality[] = Array.isArray(input)
    ? (input as RawGeorefLocality[])
    : ((input as { localidades_censales?: RawGeorefLocality[] })?.localidades_censales ?? []);
  if (!Array.isArray(list) || !list.length) throw new Error('El archivo no tiene localidades censales');
  const items: GeorefLocality[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const raw of list) {
    const code = clean(raw.id);
    const name = clean(raw.nombre);
    if (!/^\d{8}$/.test(code) || !name || seen.has(code)) {
      skipped++;
      continue;
    }
    seen.add(code);
    items.push({
      officialCode: code,
      name,
      provinceCode: clean(raw.provincia?.id) || code.slice(0, 2),
      departmentName: clean(raw.departamento?.nombre) || null,
      lat: coord(raw.centroide?.lat),
      lng: coord(raw.centroide?.lon),
    });
  }
  return { items: items.sort((a, b) => a.officialCode.localeCompare(b.officialCode)), skipped };
}

/**
 * Slugs nuevos, deterministas: el nombre; si el nombre se repite en la misma
 * provincia (homónimos, p. ej. "El Rincón" en Albardón y en Caucete) TODOS los
 * homónimos llevan el departamento, así ninguno "gana" la URL corta por orden de
 * carga. Si aun así choca con un slug existente, se agrega el código oficial.
 */
export function planSlugs(
  items: readonly GeorefLocality[],
  taken: ReadonlyMap<string, ReadonlySet<string>>,
): Map<string, string> {
  const homonyms = new Map<string, number>();
  for (const it of items) {
    const key = `${it.provinceCode}|${normalizeGeoText(it.name)}`;
    homonyms.set(key, (homonyms.get(key) ?? 0) + 1);
  }
  const used = new Map<string, Set<string>>();
  const result = new Map<string, string>();
  for (const it of items) {
    const usedHere = used.get(it.provinceCode) ?? new Set(taken.get(it.provinceCode) ?? []);
    used.set(it.provinceCode, usedHere);
    const base = geoSlug(it.name);
    const repeated = (homonyms.get(`${it.provinceCode}|${normalizeGeoText(it.name)}`) ?? 0) > 1;
    let slug = repeated && it.departmentName ? `${base}-${geoSlug(it.departmentName)}` : base;
    if (usedHere.has(slug)) slug = `${slug}-${it.officialCode}`;
    usedHere.add(slug);
    result.set(it.officialCode, slug);
  }
  return result;
}

export interface GeoImportResult {
  inserted: number;
  updated: number;
  linked: number;
  skipped: number;
  unknownProvince: number;
}

/**
 * Carga o actualiza el catálogo en una transacción (`m`).
 * - Por código oficial: actualiza nombre, departamento y centroide; conserva slug y `active`.
 * - Una localidad cargada a mano (sin código) en la misma provincia y con el mismo
 *   nombre normalizado (y única con ese nombre) se VINCULA: conserva id, slug,
 *   barrios, profesionales y solicitudes (así Tandil sigue siendo la misma fila).
 * - Lo nuevo se inserta activo. Nunca borra.
 */
export async function importGeorefLocalities(
  m: EntityManager,
  items: GeorefLocality[],
): Promise<GeoImportResult> {
  const result: GeoImportResult = { inserted: 0, updated: 0, linked: 0, skipped: 0, unknownProvince: 0 };
  const provinces: { id: string; official_code: string; name: string }[] = await m.query(
    `SELECT id, official_code, name FROM provinces`,
  );
  const provinceByCode = new Map(provinces.map((p) => [p.official_code, p]));
  const existing: {
    id: string;
    slug: string;
    official_code: string | null;
    search_name: string;
    official_code_province: string;
  }[] = await m.query(
    `SELECT c.id, c.slug, c.official_code, c.search_name, p.official_code AS official_code_province
       FROM cities c JOIN provinces p ON p.id = c.province_id`,
  );
  const byCode = new Map(existing.filter((c) => c.official_code).map((c) => [c.official_code!, c]));
  const manualByName = new Map<string, typeof existing>();
  for (const c of existing.filter((c) => !c.official_code)) {
    const key = `${c.official_code_province}|${c.search_name}`;
    manualByName.set(key, [...(manualByName.get(key) ?? []), c]);
  }

  const known = items.filter((it) => {
    if (provinceByCode.has(it.provinceCode)) return true;
    result.unknownProvince++;
    return false;
  });

  // Homónimos en el catálogo oficial: con más de uno, no se vincula una fila manual a ciegas.
  const officialNames = new Map<string, number>();
  for (const it of known) {
    const key = `${it.provinceCode}|${normalizeGeoText(it.name)}`;
    officialNames.set(key, (officialNames.get(key) ?? 0) + 1);
  }

  const toInsert: GeorefLocality[] = [];
  for (const it of known) {
    const province = provinceByCode.get(it.provinceCode)!;
    const searchName = normalizeGeoText(it.name);
    const current = byCode.get(it.officialCode);
    if (current) {
      await m.query(
        `UPDATE cities SET name = $2, search_name = $3, department_name = $4, centroid_lat = $5, centroid_lng = $6,
                province = $7, province_id = $8, source = 'GEOREF', updated_at = now()
          WHERE id = $1`,
        [current.id, it.name, searchName, it.departmentName, it.lat, it.lng, province.name, province.id],
      );
      result.updated++;
      continue;
    }
    const key = `${it.provinceCode}|${searchName}`;
    const manual = manualByName.get(key);
    if (manual?.length === 1 && officialNames.get(key) === 1) {
      await m.query(
        `UPDATE cities SET official_code = $2, name = $3, search_name = $4, department_name = $5,
                centroid_lat = $6, centroid_lng = $7, province = $8, source = 'GEOREF', updated_at = now()
          WHERE id = $1`,
        [
          manual[0].id,
          it.officialCode,
          it.name,
          searchName,
          it.departmentName,
          it.lat,
          it.lng,
          province.name,
        ],
      );
      manualByName.delete(key);
      result.linked++;
      continue;
    }
    toInsert.push(it);
  }

  const taken = new Map<string, Set<string>>();
  for (const c of existing) {
    const set = taken.get(c.official_code_province) ?? new Set<string>();
    set.add(c.slug);
    taken.set(c.official_code_province, set);
  }
  const slugs = planSlugs(toInsert, taken);
  for (let i = 0; i < toInsert.length; i += 500) {
    const chunk = toInsert.slice(i, i + 500);
    const params: unknown[] = [];
    const values = chunk.map((it) => {
      const province = provinceByCode.get(it.provinceCode)!;
      params.push(
        it.name,
        slugs.get(it.officialCode),
        province.name,
        province.id,
        it.officialCode,
        it.departmentName,
        normalizeGeoText(it.name),
        it.lat,
        it.lng,
      );
      const n = params.length - 9;
      return `($${n + 1}, $${n + 2}, $${n + 3}, $${n + 4}, $${n + 5}, $${n + 6}, $${n + 7}, $${n + 8}, $${n + 9}, 'GEOREF', true)`;
    });
    await m.query(
      `INSERT INTO cities (name, slug, province, province_id, official_code, department_name, search_name,
                           centroid_lat, centroid_lng, source, active)
       VALUES ${values.join(', ')}`,
      params,
    );
    result.inserted += chunk.length;
  }
  return result;
}
