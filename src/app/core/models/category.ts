/**
 * Catálogo de servicios. Espejo exacto de lo que devuelve el backend en
 * GET /api/v1/categories y GET /api/v1/services: el backend es la única
 * fuente de verdad. La API devuelve solo categorías y servicios activos, ya
 * ordenados por `sortOrder` (orden editorial, no de popularidad); por eso
 * estos modelos no tienen `active` ni `sortOrder`.
 */
export interface Service {
  /** UUID del backend. Es el que viaja en las solicitudes. */
  id: string;
  name: string;
  /** Identificador estable y legible; se usa en rutas y en los mocks. */
  slug: string;
  categoryId: string;
  requiresLicense: boolean;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  services: Service[];
}

/**
 * Servicio guardado dentro de un pedido: el id real del backend (null hasta
 * resolverlo contra el catálogo) y los datos para mostrarlo.
 */
export interface ServiceRef {
  id: string | null;
  slug: string;
  name: string;
}

/** Zona (barrio) de una ciudad: GET /api/v1/zones?city=tandil. */
export interface Zone {
  id: string;
  name: string;
  slug: string;
  cityId: string;
}
