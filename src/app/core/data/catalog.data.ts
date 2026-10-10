import { ServiceRequestDraft } from '../models/service-request';

/*
 * Datos del prototipo. El catálogo (nombres, ids, categorías, matrícula)
 * viene SOLO del backend (CatalogStore): acá no se repiten nombres de
 * servicios, únicamente slugs para elegir qué mostrar y textos de apoyo que
 * la API no tiene.
 */

/**
 * Servicios destacados en el Home ("Servicios más pedidos"). Es una selección
 * editorial del frontend: los datos de cada uno salen de la API y los que no
 * existan en el catálogo simplemente no se muestran.
 */
export const FEATURED_SERVICE_SLUGS = [
  'electricidad',
  'gas',
  'plomeria',
  'cerrajeria',
  'aire-acondicionado',
  'pintura',
  'albanileria',
];

/** Rubros que se ofrecen en /urgencias (el catálogo no tiene Destapaciones: va por Plomería). */
export const URGENT_SERVICE_SLUGS = ['cerrajeria', 'plomeria', 'electricidad', 'gas'];

/** Título que se asume al elegir un servicio directamente (si no hay, se usa el nombre). */
export const DEFAULT_PROBLEM_BY_SERVICE: Record<string, string> = {
  electricidad: 'Problema eléctrico',
  gas: 'Revisión de gas',
  plomeria: 'Pérdida de agua',
  cerrajeria: 'Apertura de puerta',
  'aire-acondicionado': 'Instalación de equipo',
  pintura: 'Pintura de ambientes',
  albanileria: 'Arreglos de albañilería',
};

/** Trabajos típicos de cada servicio (texto de apoyo; la API no los tiene). */
export const TYPICAL_JOBS_BY_SERVICE: Record<string, string[]> = {
  electricidad: ['Instalaciones eléctricas', 'Tableros', 'Cortocircuitos', 'Ventiladores', 'Tomas', 'Iluminación'],
  plomeria: ['Pérdidas y filtraciones', 'Griferías', 'Termotanques', 'Destapaciones', 'Sanitarios', 'Cañerías'],
  gas: ['Instalaciones de gas', 'Calefactores', 'Calefones y termotanques', 'Pruebas de hermeticidad', 'Detección de fugas'],
  cerrajeria: ['Aperturas', 'Cambio de cerraduras', 'Copias de llaves', 'Cerraduras de seguridad'],
  pintura: ['Interiores', 'Exteriores', 'Impermeabilización', 'Enduido y reparaciones'],
  'aire-acondicionado': ['Instalación de equipos', 'Carga de gas', 'Limpieza y mantenimiento', 'Reparaciones'],
  albanileria: ['Humedad', 'Revoques', 'Contrapisos', 'Pequeñas reformas'],
};

export const REQUEST_EXAMPLES = [
  'Me pierde agua abajo de la pileta',
  'Saltan las térmicas con el horno',
  'Me quedé afuera de casa',
  'Necesito un gasista matriculado',
  'Quiero pintar dos habitaciones',
];

/** Un ejemplo de pedido por servicio, para los atajos del inicio cuando hay "más pedidos" reales. */
export const REQUEST_EXAMPLE_BY_SERVICE: Record<string, string> = {
  plomeria: 'Me pierde agua abajo de la pileta',
  electricidad: 'Saltan las térmicas con el horno',
  cerrajeria: 'Me quedé afuera de casa',
  gas: 'Necesito un gasista matriculado',
  pintura: 'Quiero pintar dos habitaciones',
  'aire-acondicionado': 'Mi aire acondicionado no enfría',
  albanileria: 'Tengo humedad en una pared',
};

/**
 * Ejemplos del inicio: primero los de los servicios más pedidos (si el backend
 * ya tiene volumen) y se completa con la lista fija hasta `max`.
 */
export function homeExamples(popularSlugs: readonly string[], max = 4): string[] {
  const picked = popularSlugs.map((s) => REQUEST_EXAMPLE_BY_SERVICE[s]).filter((e): e is string => !!e);
  return [...new Set([...picked, ...REQUEST_EXAMPLES])].slice(0, max);
}

/**
 * Borrador inicial: VACÍO. Nada de un pedido de ejemplo que después aparezca
 * como "Tu pedido": servicio, título y descripción los pone el cliente. Sin
 * barrio (se elige uno real de GET /zones) ni fecha (sale de urgencia o "Cuándo").
 */
export const INITIAL_DRAFT: ServiceRequestDraft = {
  id: 'draft-inicial',
  description: '',
  service: { id: null, slug: '', name: '' },
  title: '',
  urgency: 'FLEXIBLE',
  locality: null,
  zone: null,
  desiredDate: null,
};

/** "Por qué confiar". `short*` = copy desktop, `long*` = copy mobile. */
/*
 * Solo lo que el sistema hace de verdad (no hay validación de DNI ni selfie:
 * no se promete). Íconos del set de la app.
 */
export const TRUST_POINTS = [
  {
    icon: 'clock',
    when: 'Al buscar',
    title: 'Disponibilidad actualizada',
    longTitle: 'Disponibilidad actualizada',
    text: 'Cada profesional indica si puede trabajar hoy. Sin llamar a cinco números.',
    longText: 'Cada profesional indica si puede trabajar hoy. Sin llamar a cinco números.',
  },
  {
    icon: 'shield',
    when: 'Al comparar',
    title: 'Matrícula verificada por número',
    longTitle: 'Matrícula verificada por número',
    text: 'En gas y electricidad chequeamos el número en el registro oficial.',
    longText: 'En gas y electricidad chequeamos el número de matrícula en el registro oficial antes de mostrarlos.',
  },
  {
    icon: 'lock',
    when: 'Al elegir',
    title: 'Tus datos, cuando elegís',
    longTitle: 'Tus datos, cuando elegís',
    text: 'Tu dirección y teléfono solo los ve el profesional que elegís.',
    longText: 'Tu dirección y teléfono solo los ve el profesional cuyo presupuesto aceptás.',
  },
  {
    icon: 'star',
    when: 'Después del trabajo',
    title: 'Solo opinan clientes reales',
    longTitle: 'Solo opinan clientes reales',
    text: 'Una reseña solo se deja después de un trabajo pedido por Resuelve.',
    longText: 'Una reseña solo se puede dejar después de un trabajo pedido por Resuelve.',
  },
] as const;

