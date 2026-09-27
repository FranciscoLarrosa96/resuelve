/** Minúsculas, sin tildes ni signos. */
const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * Barrio nombrado en una dirección escrita a mano ("Alem 455, Villa Italia").
 * Palabras completas y UNA sola coincidencia; si no, null (nunca se adivina
 * por cercanía: no hay límites de barrios).
 */
export function zoneFromText<Z extends { name: string }>(text: string, zones: readonly Z[]): Z | null {
  const t = ` ${norm(text)} `;
  if (t.trim().length < 4) return null;
  const hits = zones.filter((z) => {
    const n = norm(z.name);
    return !!n && t.includes(` ${n} `);
  });
  return hits.length === 1 ? hits[0] : null;
}
