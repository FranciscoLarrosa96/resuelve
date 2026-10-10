/**
 * Catálogo productivo de referencia: barrios de las ciudades que los tienen
 * cargados, categorías y servicios. El catálogo NACIONAL de localidades no
 * vive acá: sale de Georef (`npm run geo:import`). Una ciudad sin barrios no
 * necesita estar en esta lista.
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
  /** Código oficial de la provincia (INDEC/Georef): "06" = Buenos Aires. Ver la migración multiciudad. */
  provinceCode: string;
  /**
   * Barrios en orden de presentación (el `sortOrder` sale de la posición).
   * `active: false` da de baja un barrio sin borrarlo (el historial sigue
   * apuntando a él); nunca borrar una entrada ya publicada.
   */
  zones: { slug: string; name: string; active?: boolean }[];
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
    provinceCode: '06',
    // Lista del producto: los barrios iniciales más los que cargó el equipo
    // (octubre 2026). NO hay un dataset oficial de barrios de Tandil en el repo:
    // ampliarla solo desde una fuente documentada (ver backend/README.md →
    // "Catálogo"). "Todo Tandil" no es una zona: es `coversEntireCity` en el
    // perfil. Tampoco existe "Otro barrio".
    zones: [
      { slug: 'centro', name: 'Centro' },
      { slug: 'villa-italia', name: 'Villa Italia' },
      { slug: 'uncas', name: 'Uncas' },
      { slug: 'villa-aguirre', name: 'Villa Aguirre' },
      { slug: 'la-movediza', name: 'La Movediza' },
      { slug: 'el-tropezon', name: 'El Tropezón' },
      { slug: 'mirage', name: 'Mirage' },
      { slug: 'villa-laza', name: 'Villa Laza' },
      { slug: 'barrio-falucho', name: 'Barrio Falucho' },
      { slug: 'palermo', name: 'Palermo' },
      { slug: 'arroyo-seco', name: 'Arroyo Seco' },
      { slug: 'cerro-leones', name: 'Cerro Leones' },
      { slug: 'parque-industrial', name: 'Parque Industrial' },
      { slug: 'de-los-cuarteles', name: 'De los Cuarteles' },
      { slug: 'villa-galicia', name: 'Villa Galicia' },
      { slug: 'barrio-arco-iris', name: 'Barrio Arco Iris (1era y 2da etapa)' },
      { slug: 'las-tunitas', name: 'Las Tunitas' },
      { slug: 'cuatroavenidas', name: 'Cuatroavenidas' },
      { slug: 'obras-sanitarias', name: 'Obras Sanitarias' },
      { slug: 'parque-calvario', name: 'Parque Calvario' },
      { slug: '17-de-agosto', name: '17 de Agosto' },
      { slug: 'centinela', name: 'Centinela' },
      { slug: 'universitario', name: 'Universitario' },
      { slug: 'terrabuela', name: 'Terrabuela' },
      { slug: 'don-bosco', name: 'Don Bosco' },
    ],
  },
];

export const CATALOG_CATEGORIES: CatalogCategory[] = [
  {
    slug: 'hogar-y-reparaciones',
    name: 'Hogar y reparaciones',
    services: [
      // Gas y Electricidad requieren matrícula (también Contador, Abogado y Martillero): la regla que ya aplican el
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
      { slug: 'limpieza-de-interior', name: 'Limpieza de interior', requiresLicense: false },
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
      { slug: 'desarrollador-freelance', name: 'Desarrollador freelancer', requiresLicense: false },
    ],
  },
  {
    slug: 'cuidado-de-personas',
    name: 'Cuidado de personas',
    services: [{ slug: 'ninera', name: 'Niñera', requiresLicense: false }],
  },
  {
    // Contador, abogado y martillero ejercen con matrícula de su colegio: se verifica por número.
    // Gestor no: no hay una matrícula única que lo habilite en general.
    slug: 'tramites-y-profesionales',
    name: 'Trámites y profesionales',
    services: [
      { slug: 'contador', name: 'Contador/a', requiresLicense: true },
      { slug: 'abogado', name: 'Abogado/a', requiresLicense: true },
      { slug: 'martillero', name: 'Martillero/a', requiresLicense: true },
      { slug: 'gestor', name: 'Gestor/a', requiresLicense: false },
    ],
  },
];
