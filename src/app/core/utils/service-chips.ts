import type { ProfessionalServiceSummary } from '../models/professional';

/** Cantidad máxima de servicios visibles como chip en un resultado. */
export const MAX_VISIBLE_SERVICE_CHIPS = 2;

export interface ServiceChipsView {
  visible: ProfessionalServiceSummary[];
  hidden: ProfessionalServiceSummary[];
}

/**
 * Qué servicios mostrar como chip: el que coincide con la búsqueda va primero
 * (por id del catálogo); el resto conserva el orden del modelo. Solo reordena
 * lo que el profesional ya tiene registrado y sin repetidos; no toca el orden
 * de los resultados.
 */
export function serviceChipsView(
  services: readonly ProfessionalServiceSummary[] | null | undefined,
  matchServiceId?: string | null,
  max = MAX_VISIBLE_SERVICE_CHIPS,
): ServiceChipsView {
  const seen = new Set<string>();
  const unique = (services ?? []).filter((s) => s?.id && !seen.has(s.id) && !!seen.add(s.id));
  const matched = matchServiceId ? unique.find((s) => s.id === matchServiceId) : undefined;
  const ordered = matched ? [matched, ...unique.filter((s) => s !== matched)] : unique;
  return { visible: ordered.slice(0, max), hidden: ordered.slice(max) };
}

const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim();

/** El título declarado solo aporta si no repite exactamente un servicio ya visible como chip. */
export function headlineRepeatsChips(headline: string | null | undefined, chips: ServiceChipsView): boolean {
  if (!headline) return false;
  const h = normalize(headline);
  return chips.visible.some((s) => normalize(s.name) === h);
}
