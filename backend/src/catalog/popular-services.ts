/**
 * "Lo más pedido" para ordenar los atajos del inicio. Sale de pedidos reales
 * (nunca de búsquedas ni de textos escritos) y solo se usa con volumen: con
 * poco tráfico un "ranking" sería ruido o un solo usuario.
 */
export const POPULAR_WINDOW_DAYS = 90;
export const POPULAR_MAX = 4;
/** Pedidos mínimos en la ventana, en total, para que haya ranking. */
export const POPULAR_MIN_TOTAL_REQUESTS = 20;
/** Pedidos mínimos de un servicio para figurar. */
export const POPULAR_MIN_PER_SERVICE = 3;

export interface ServiceRequestCount {
  slug: string;
  count: number;
}

/** Slugs más pedidos, de mayor a menor (empates por slug). Vacío si no hay volumen suficiente. */
export function selectPopularSlugs(rows: readonly ServiceRequestCount[]): string[] {
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  if (total < POPULAR_MIN_TOTAL_REQUESTS) return [];
  return [...rows]
    .filter((r) => r.count >= POPULAR_MIN_PER_SERVICE)
    .sort((a, b) => b.count - a.count || a.slug.localeCompare(b.slug))
    .slice(0, POPULAR_MAX)
    .map((r) => r.slug);
}
