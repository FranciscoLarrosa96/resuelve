/**
 * Catálogo productivo de referencia: ciudades, zonas, categorías y servicios.
 *
 * Es la ÚNICA fuente de este catálogo: lo usan `npm run seed:catalog`
 * (producción) y el seed de desarrollo. No contiene usuarios, profesionales,
 * pedidos, presupuestos ni reseñas.
 *
 * Los slugs son estables: son la clave del upsert. Cambiar el nombre visible
 * de algo es seguro; cambiar su slug crearía un registro nuevo.
 */

export interface CatalogCity {
  slug: string;
  name: string;
  province: string;
  /** Barrios en orden de presentación (el `sortOrder` sale de la posición). */
  zones: { slug: string; name: string }[];
}

export interface CatalogCategory {
  slug: string;
  name: string;
  services: { slug: string; name: string; requiresLicense: boolean }[];
}

export const CATALOG_CITIES: CatalogCity[] = [
  {
    slug: 'tandil',
    name: 'Tandil',
    province: 'Buenos Aires',
    // Mismos barrios que usa el frontend (NEIGHBORHOODS). "Otro barrio" es una
    // opción de la interfaz, no una zona real, y no se carga.
    zones: [
      { slug: 'centro', name: 'Centro' },
      { slug: 'villa-italia', name: 'Villa Italia' },
      { slug: 'uncas', name: 'Uncas' },
      { slug: 'villa-aguirre', name: 'Villa Aguirre' },
      { slug: 'la-movediza', name: 'La Movediza' },
    ],
  },
];

export const CATALOG_CATEGORIES: CatalogCategory[] = [
  {
    slug: 'hogar-y-reparaciones',
    name: 'Hogar y reparaciones',
    services: [
      // Gas y Electricidad requieren matrícula: es la regla que ya aplican el
      // backend (verificación LICENSE) y el frontend (services.data.ts).
      { slug: 'electricidad', name: 'Electricidad', requiresLicense: true },
      { slug: 'gas', name: 'Gas', requiresLicense: true },
      { slug: 'plomeria', name: 'Plomería', requiresLicense: false },
      { slug: 'cerrajeria', name: 'Cerrajería', requiresLicense: false },
      { slug: 'aire-acondicionado', name: 'Aire acondicionado', requiresLicense: false },
      { slug: 'pintura', name: 'Pintura', requiresLicense: false },
      { slug: 'albanileria', name: 'Albañilería', requiresLicense: false },
      { slug: 'carpinteria', name: 'Carpintería', requiresLicense: false },
      { slug: 'herreria', name: 'Herrería', requiresLicense: false },
      {
        slug: 'reparacion-de-electrodomesticos',
        name: 'Reparación de electrodomésticos',
        requiresLicense: false,
      },
    ],
  },
  {
    slug: 'exterior',
    name: 'Exterior',
    services: [
      { slug: 'corte-de-pasto', name: 'Corte de pasto', requiresLicense: false },
      { slug: 'jardineria', name: 'Jardinería', requiresLicense: false },
      { slug: 'poda', name: 'Poda', requiresLicense: false },
      { slug: 'limpieza-de-terrenos', name: 'Limpieza de terrenos', requiresLicense: false },
    ],
  },
  {
    slug: 'transporte',
    name: 'Transporte',
    services: [
      { slug: 'fletes', name: 'Fletes', requiresLicense: false },
      { slug: 'mudanzas', name: 'Mudanzas', requiresLicense: false },
      { slug: 'retiro-de-muebles', name: 'Retiro de muebles', requiresLicense: false },
    ],
  },
  {
    slug: 'tecnologia',
    name: 'Tecnología',
    services: [
      { slug: 'camaras-y-alarmas', name: 'Cámaras y alarmas', requiresLicense: false },
      { slug: 'redes', name: 'Redes', requiresLicense: false },
      { slug: 'reparacion-de-pc', name: 'Reparación de PC', requiresLicense: false },
    ],
  },
];
