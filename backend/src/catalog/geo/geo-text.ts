/**
 * Texto geográfico normalizado: minúsculas, sin tildes ni signos.
 * "Olavarría" ≈ "olavarria", "Mar del Plata" ≈ "MAR DEL PLATA". Es la misma
 * regla que `NORMALIZE` de la migración multiciudad (columna `search_name`).
 */
export function normalizeGeoText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** "Villa General San Martín - Campo Afuera" → "villa-general-san-martin-campo-afuera". */
export function geoSlug(text: string): string {
  return normalizeGeoText(text).replace(/ /g, '-').slice(0, 110);
}

/** Lo que escribió la persona → prefijo para `search_name LIKE …` (sin comodines propios). */
export function searchPrefix(query: string): string {
  return normalizeGeoText(query).slice(0, 80);
}
