/**
 * Datos ficticios de desarrollo, alineados con los mocks del frontend
 * (src/app/core/data). Nada de esto se usa en producción.
 */

export const CITY = { name: 'Tandil', slug: 'tandil', province: 'Buenos Aires' };

export const ZONES = [
  'Centro',
  'Villa Italia',
  'Uncas',
  'Villa Aguirre',
  'La Movediza',
  'Cerro Leones',
  'Don Bosco',
];

export const CATEGORIES = [
  { name: 'Hogar y reparaciones', slug: 'hogar-y-reparaciones' },
  { name: 'Exterior', slug: 'exterior' },
  { name: 'Transporte', slug: 'transporte' },
  { name: 'Tecnología', slug: 'tecnologia' },
];

export const SERVICES: { name: string; slug: string; category: string; requiresLicense?: boolean }[] = [
  { name: 'Electricidad', slug: 'electricidad', category: 'hogar-y-reparaciones', requiresLicense: true },
  { name: 'Gas', slug: 'gas', category: 'hogar-y-reparaciones', requiresLicense: true },
  { name: 'Plomería', slug: 'plomeria', category: 'hogar-y-reparaciones' },
  { name: 'Cerrajería', slug: 'cerrajeria', category: 'hogar-y-reparaciones' },
  { name: 'Aire acondicionado', slug: 'aire-acondicionado', category: 'hogar-y-reparaciones' },
  { name: 'Pintura', slug: 'pintura', category: 'hogar-y-reparaciones' },
  { name: 'Albañilería', slug: 'albanileria', category: 'hogar-y-reparaciones' },
  { name: 'Fletes', slug: 'fletes', category: 'transporte' },
  { name: 'Mudanzas', slug: 'mudanzas', category: 'transporte' },
  { name: 'Corte de pasto', slug: 'corte-de-pasto', category: 'exterior' },
  { name: 'Jardinería', slug: 'jardineria', category: 'exterior' },
  { name: 'Poda', slug: 'poda', category: 'exterior' },
  { name: 'Reparación de PC', slug: 'reparacion-de-pc', category: 'tecnologia' },
];

/** Contraseña de todas las cuentas de desarrollo. */
export const DEV_PASSWORD = 'resuelve-dev-2026';

export interface SeedProfessional {
  key: string;
  firstName: string;
  lastName: string;
  headline: string;
  services: string[];
  zones: string[];
  years: number;
  availableToday: boolean;
  responseMinutes: number;
  licensed: boolean;
  /** Calificaciones de trabajos ya cerrados (generan reviews reales). */
  pastRatings: number[];
  highlight: string;
}

export const PROFESSIONALS: SeedProfessional[] = [
  {
    key: 'carlos',
    firstName: 'Carlos',
    lastName: 'Fernández',
    headline: 'Electricista matriculado',
    services: ['electricidad', 'aire-acondicionado'],
    zones: ['Centro', 'Villa Italia', 'Uncas'],
    years: 14,
    availableToday: true,
    responseMinutes: 5,
    licensed: true,
    pastRatings: [5, 5, 5, 4, 5],
    highlight: 'Vino en el día, cambió el disyuntor y me explicó qué estaba fallando.',
  },
  {
    key: 'juan',
    firstName: 'Juan',
    lastName: 'Martín',
    headline: 'Electricista matriculado',
    services: ['electricidad'],
    zones: ['Centro', 'Uncas', 'Villa Aguirre'],
    years: 11,
    availableToday: true,
    responseMinutes: 10,
    licensed: true,
    pastRatings: [5, 5, 4, 5],
    highlight: 'Llegó puntual, encontró el problema enseguida y explicó todo.',
  },
  {
    key: 'nicolas',
    firstName: 'Nicolás',
    lastName: 'Herrera',
    headline: 'Electricista',
    services: ['electricidad'],
    zones: ['La Movediza', 'Centro'],
    years: 6,
    availableToday: false,
    responseMinutes: 25,
    licensed: false,
    pastRatings: [5, 4, 5],
    highlight: 'Muy prolijo con los cables, dejó todo ordenado.',
  },
  {
    key: 'martin',
    firstName: 'Martín',
    lastName: 'Gómez',
    headline: 'Plomero y gasista matriculado',
    services: ['plomeria', 'gas'],
    zones: ['Villa Italia', 'Centro', 'Villa Aguirre'],
    years: 18,
    availableToday: true,
    responseMinutes: 15,
    licensed: true,
    pastRatings: [5, 5, 5, 5, 4],
    highlight: 'Cambió el flexible del termotanque en media hora. Impecable.',
  },
  {
    key: 'luciano',
    firstName: 'Luciano',
    lastName: 'Rodríguez',
    headline: 'Plomero',
    services: ['plomeria'],
    zones: ['Villa Italia', 'Uncas'],
    years: 9,
    availableToday: true,
    responseMinutes: 10,
    licensed: false,
    pastRatings: [5, 5, 4],
    highlight: 'Encontró la pérdida sin romper nada. Súper recomendable.',
  },
  {
    key: 'marcelo',
    firstName: 'Marcelo',
    lastName: 'Ríos',
    headline: 'Plomería y destapaciones',
    services: ['plomeria'],
    zones: ['Centro', 'La Movediza', 'Villa Italia'],
    years: 12,
    availableToday: true,
    responseMinutes: 3,
    licensed: false,
    pastRatings: [5, 5, 5],
    highlight: 'Lo llamé a las 23 y a los 20 minutos estaba en casa.',
  },
  {
    key: 'hernan',
    firstName: 'Hernán',
    lastName: 'Castro',
    headline: 'Gasista matriculado',
    services: ['gas'],
    zones: ['Centro', 'Uncas'],
    years: 15,
    availableToday: true,
    responseMinutes: 8,
    licensed: true,
    pastRatings: [5, 4, 5, 5],
    highlight: 'Hizo la prueba de hermeticidad y me dejó el certificado.',
  },
  {
    key: 'diego',
    firstName: 'Diego',
    lastName: 'Sosa',
    headline: 'Cerrajero',
    services: ['cerrajeria'],
    zones: ['Centro', 'Villa Italia', 'Uncas', 'Villa Aguirre', 'La Movediza'],
    years: 10,
    availableToday: true,
    responseMinutes: 4,
    licensed: false,
    pastRatings: [5, 5, 4, 5],
    highlight: 'Me abrió la puerta sin dañar la cerradura. Rapidísimo.',
  },
  {
    key: 'laura',
    firstName: 'Laura',
    lastName: 'Pérez',
    headline: 'Pintora de interiores',
    services: ['pintura'],
    zones: ['Centro', 'Villa Italia', 'Uncas'],
    years: 8,
    availableToday: false,
    responseMinutes: 30,
    licensed: false,
    pastRatings: [5, 5, 5],
    highlight: 'Cumplió los plazos y cuidó cada mueble. Quedó hermoso.',
  },
  {
    key: 'pablo',
    firstName: 'Pablo',
    lastName: 'Acosta',
    headline: 'Técnico en aire acondicionado',
    services: ['aire-acondicionado'],
    zones: ['Centro', 'Villa Italia'],
    years: 10,
    availableToday: false,
    responseMinutes: 15,
    licensed: false,
    pastRatings: [5, 4, 5],
    highlight: 'Instaló el split en tres horas y dejó todo limpio.',
  },
  {
    key: 'ramon',
    firstName: 'Ramón',
    lastName: 'Quiroga',
    headline: 'Albañil',
    services: ['albanileria'],
    zones: ['Centro', 'Villa Italia', 'Uncas', 'Villa Aguirre', 'La Movediza'],
    years: 22,
    availableToday: false,
    responseMinutes: 40,
    licensed: false,
    pastRatings: [5, 4, 5],
    highlight: 'Arregló la humedad del muro y no volvió a aparecer.',
  },
  {
    key: 'raul',
    firstName: 'Raúl',
    lastName: 'Medina',
    headline: 'Fletes y mudanzas',
    services: ['fletes', 'mudanzas'],
    zones: ['Centro', 'Villa Italia'],
    years: 9,
    availableToday: true,
    responseMinutes: 8,
    licensed: false,
    pastRatings: [5, 5, 4],
    highlight: 'Llegó a horario y cuidó todos los muebles.',
  },
  {
    key: 'oscar',
    firstName: 'Óscar',
    lastName: 'Sosa',
    headline: 'Jardinería, corte de pasto y poda',
    services: ['corte-de-pasto', 'jardineria', 'poda'],
    zones: ['Centro', 'Uncas'],
    years: 12,
    availableToday: false,
    responseMinutes: 5,
    licensed: false,
    pastRatings: [5, 5, 5],
    highlight: 'Dejó el jardín impecable y retiró los restos.',
  },
];

export const CLIENT = {
  firstName: 'María',
  lastName: 'González',
  email: 'maria@resuelve.dev',
  zone: 'Villa Italia',
  phone: '+54 249 400 1234',
};
