/**
 * Tipos comunes de la API. Los contratos de cada recurso viven en
 * core/models (catálogo, auth, profesionales) y copian los presenters del backend.
 */

/** Formato único de error del backend. */
export interface ApiError {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
}

/** Listados paginados del backend. */
export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}
