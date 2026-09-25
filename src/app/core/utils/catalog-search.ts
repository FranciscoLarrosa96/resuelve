import { Category, Service } from '../models/category';

/** Minúsculas y sin tildes: "Plomería" y "plomeria" son lo mismo. */
export function normalizeText(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('es').trim();
}

/** Busca por nombre y slug del servicio y por nombre de su categoría. */
export function searchServices(
  services: readonly Service[],
  categories: readonly Category[],
  query: string,
): Service[] {
  const q = normalizeText(query);
  if (!q) return [...services];
  const categoryName = new Map(categories.map((c) => [c.id, normalizeText(c.name)]));
  return services.filter((s) =>
    [normalizeText(s.name), s.slug.replace(/-/g, ' '), categoryName.get(s.categoryId) ?? ''].some((text) =>
      text.includes(q),
    ),
  );
}
