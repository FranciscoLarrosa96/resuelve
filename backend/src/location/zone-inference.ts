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
  const formattedLine = place.formattedAddress.split(',')[0]?.trim();
  if (formattedLine && (!place.number || containsNumber(formattedLine, place.number))) return formattedLine;
  if (place.street) return [place.street, place.number].filter(Boolean).join(' ');
  return formattedLine ?? place.formattedAddress;
}

/**
 * Preserva la precisión de una sugerencia elegida cuando el geocode de su ID
 * devuelve una línea menos precisa. Solo la usa si la calle coincide y el
 * resultado no contradice un número explícito del proveedor.
 */
export function preserveSelectedAddressPrecision(place: GeoPlace, selectedAddress?: string): GeoPlace {
  const selectedLine = selectedAddress?.split(',')[0]?.trim();
  const resolvedLine = place.formattedAddress.split(',')[0]?.trim();
  const street = place.street?.trim() || resolvedLine;
  if (!selectedLine || !resolvedLine || !street) return place;

  const selectedNumber = numberAfterStreet(selectedLine, street);
  if (!selectedNumber) return place;

  const resolvedNumber = numberAfterStreet(resolvedLine, street);
  if (resolvedNumber) return place;
  if (place.number && normalizePlaceText(place.number) !== selectedNumber) return place;

  const suffix = place.formattedAddress.split(',').slice(1).map((part) => part.trim()).filter(Boolean);
  return {
    ...place,
    number: place.number ?? selectedNumber,
    formattedAddress: [selectedLine, ...suffix].join(', '),
  };
}

/** Si el proveedor confirmó el número como campo, incorpóralo también al formato completo. */
export function preserveFormattedHouseNumber(place: GeoPlace): GeoPlace {
  const parts = place.formattedAddress.split(',');
  const formattedLine = parts[0]?.trim();
  if (
    !formattedLine ||
    !place.street ||
    !place.number ||
    containsNumber(formattedLine, place.number) ||
    normalizePlaceText(formattedLine) !== normalizePlaceText(place.street)
  ) {
    return place;
  }
  return {
    ...place,
    formattedAddress: [`${place.street} ${place.number}`, ...parts.slice(1).map((part) => part.trim())].join(', '),
  };
}

function numberAfterStreet(line: string, street: string): string | null {
  const normalizedLine = normalizePlaceText(line);
  const normalizedStreet = normalizePlaceText(street);
  if (!normalizedLine.startsWith(`${normalizedStreet} `)) return null;
  const suffix = normalizedLine.slice(normalizedStreet.length).trim();
  return suffix.match(/^(\d+[a-z]?)(?:\s|$)/)?.[1] ?? null;
}

function containsNumber(line: string, number: string): boolean {
  const normalizedLine = normalizePlaceText(line);
  const normalizedNumber = normalizePlaceText(number);
  return ` ${normalizedLine} `.includes(` ${normalizedNumber} `);
}
