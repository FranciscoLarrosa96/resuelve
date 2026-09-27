import type { GeoPlace } from './location-provider';

/** Minúsculas, sin tildes ni signos: "Villa Italia" ≈ "villa italia". */
export function normalizePlaceText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** ¿`needle` aparece como palabra(s) completa(s) en `haystack`? ("centro" no matchea "concentro"). */
function containsWords(haystack: string, needle: string): boolean {
  return !!needle && ` ${haystack} `.includes(` ${needle} `);
}

export interface ZoneCandidate {
  id: string;
  name: string;
}

/**
 * Barrio interno de Resuelve a partir de lo que devolvió el proveedor:
 * 1) el barrio del proveedor coincide con el nombre de una zona;
 * 2) la dirección formateada nombra UNA sola zona.
 * Si no hay coincidencia (o hay más de una en el texto), null: la UI pide
 * elegir el más cercano. Nunca se adivina por cercanía (no hay límites de barrios).
 */
export function inferZone<Z extends ZoneCandidate>(place: GeoPlace, zones: readonly Z[]): Z | null {
  const named = zones.map((z) => ({ zone: z, name: normalizePlaceText(z.name) }));
  if (place.neighbourhood) {
    const n = normalizePlaceText(place.neighbourhood);
    const exact = named.find((z) => z.name === n);
    if (exact) return exact.zone;
  }
  const text = normalizePlaceText([place.neighbourhood, place.formattedAddress].filter(Boolean).join(' '));
  const hits = named.filter((z) => containsWords(text, z.name));
  return hits.length === 1 ? hits[0].zone : null;
}

/** ¿La dirección es de la ciudad donde opera la app? (sin localidad: no se afirma que no). */
export function isInCity(place: GeoPlace, city: string): boolean {
  if (!place.locality) return true;
  return normalizePlaceText(place.locality) === normalizePlaceText(city);
}

/** "Alem 455" (lo que se precarga en "Dirección"). */
export function shortAddress(place: GeoPlace): string {
  if (place.street) return [place.street, place.number].filter(Boolean).join(' ');
  return place.formattedAddress.split(',')[0]?.trim() ?? place.formattedAddress;
}
