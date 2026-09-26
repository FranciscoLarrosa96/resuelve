import { createHash } from 'crypto';

/**
 * Espacios "Destacado" en los resultados de búsqueda.
 *
 * Reglas (todas deterministas, sin tocar el orden orgánico entre sí):
 * - Solo compiten profesionales con PRO vigente que YA están en los
 *   resultados, o sea que cumplen todas las reglas normales (perfil activo,
 *   servicio con matrícula aprobada si corresponde, cobertura del barrio y
 *   los filtros elegidos). PRO nunca saltea esas reglas.
 * - Espacios: el 1.º arriba de todo; cada uno siguiente, `SLOT_GAP`
 *   posiciones más abajo, y solo se abre con volumen: hacen falta
 *   `resultsPerSlot` resultados por espacio. Con 0 o 1 resultado no hay
 *   destacados. Nunca más de `maxSlots`.
 * - Un destacado siempre SUBE: si su posición orgánica ya está a la altura
 *   del espacio (o mejor), no se lo marca como destacado y el espacio pasa al
 *   siguiente candidato. Así nunca se "destaca" hacia abajo.
 * - Rotación: los candidatos se ordenan por un hash estable de
 *   (semilla + id). La semilla es el día de negocio + la búsqueda, así que
 *   cada búsqueda rota entre los PRO elegibles día a día y un mismo listado
 *   no cambia mientras se pagina.
 * - Nadie desaparece: el destacado sale de su lugar orgánico (no se
 *   duplica) y el resto conserva su orden relativo, corrido a lo sumo
 *   tantas posiciones como destacados haya.
 */
export const SLOT_GAP = 5;

export interface FeaturedOptions {
  maxSlots: number;
  resultsPerSlot: number;
  seed: string;
}

export interface Arrangement {
  ids: string[];
  featured: Set<string>;
}

export function rotationKey(seed: string, id: string): string {
  return createHash('sha256').update(`${seed}|${id}`).digest('hex');
}

/** Cantidad de espacios que se abren con `total` resultados. */
export function openSlots(total: number, opts: Pick<FeaturedOptions, 'maxSlots' | 'resultsPerSlot'>): number {
  if (total < 2 || opts.maxSlots <= 0) return 0;
  return Math.min(opts.maxSlots, Math.ceil(total / opts.resultsPerSlot));
}

/**
 * @param organic ids en orden orgánico (disponibles hoy, rating, reseñas).
 * @param eligible ids con entitlement `featuredPlacement` (PRO vigente) dentro de `organic`.
 */
export function arrangeFeatured(
  organic: string[],
  eligible: ReadonlySet<string>,
  opts: FeaturedOptions,
): Arrangement {
  const slots = openSlots(organic.length, opts);
  const position = new Map(organic.map((id, i) => [id, i]));
  const candidates = organic
    .filter((id) => eligible.has(id))
    .sort((a, b) => rotationKey(opts.seed, a).localeCompare(rotationKey(opts.seed, b)));

  const placed: { id: string; at: number }[] = [];
  const used = new Set<string>();
  for (let k = 0; k < slots; k++) {
    const at = k * SLOT_GAP;
    if (at >= organic.length) break;
    const pick = candidates.find((id) => !used.has(id) && position.get(id)! > at);
    if (!pick) continue;
    used.add(pick);
    placed.push({ id: pick, at });
  }

  const ids = organic.filter((id) => !used.has(id));
  for (const { id, at } of placed) ids.splice(at, 0, id);
  return { ids, featured: used };
}
