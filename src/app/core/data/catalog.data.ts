import { PortfolioItem } from '../models/professional';
import { ServiceRequestDraft } from '../models/service-request';

/*
 * Datos del prototipo. El catálogo (nombres, ids, categorías, matrícula)
 * viene SOLO del backend (CatalogStore): acá no se repiten nombres de
 * servicios, únicamente slugs para elegir qué mostrar y textos de apoyo que
 * la API no tiene.
 */

export const CITY = 'Tandil';

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

/** MOCK: portfolio de ejemplo por servicio (hasta integrar profesionales). */
export const PORTFOLIO_BY_SERVICE: Record<string, PortfolioItem[]> = {
  electricidad: [
    { title: 'Tablero nuevo con disyuntor', zone: 'Centro' },
    { title: 'Iluminación LED de cocina', zone: 'Villa Italia' },
    { title: 'Ventilador de techo', zone: 'Uncas' },
    { title: 'Tomas en oficina', zone: 'Villa Aguirre' },
  ],
  plomeria: [
    { title: 'Cambio de sifón y flexibles', zone: 'Villa Italia' },
    { title: 'Grifería de baño', zone: 'Centro' },
    { title: 'Reparación de cañería', zone: 'Uncas' },
    { title: 'Instalación de termotanque', zone: 'La Movediza' },
  ],
};

export const DEFAULT_PORTFOLIO: PortfolioItem[] = [
  { title: 'Trabajo terminado', zone: 'Centro' },
  { title: 'Reparación', zone: 'Villa Italia' },
  { title: 'Instalación', zone: 'Uncas' },
  { title: 'Mantenimiento', zone: 'Villa Aguirre' },
];

export const NEIGHBORHOODS = ['Centro', 'Villa Italia', 'Uncas', 'Villa Aguirre', 'La Movediza', 'Otro barrio'];

export const REQUEST_EXAMPLES = [
  'Me pierde agua abajo de la pileta',
  'Saltan las térmicas con el horno',
  'Me quedé afuera de casa',
  'Necesito un gasista matriculado',
  'Quiero pintar dos habitaciones',
];

export const DEFAULT_REQUEST_TEXT = 'Tengo una pérdida abajo de la pileta de la cocina';

/** Frase que "escucha" el botón Hablar (simulación). */
export const SPOKEN_EXAMPLE = 'El termotanque pierde agua desde esta mañana';

export const INITIAL_DRAFT: ServiceRequestDraft = {
  id: 'draft-inicial',
  description: DEFAULT_REQUEST_TEXT,
  service: { id: null, slug: 'plomeria', name: '' },
  title: 'Pérdida bajo mesada',
  urgency: 'today',
  zone: 'Villa Italia',
  when: 'Hoy',
  photos: 2,
};

export const URGENCY_LABELS = {
  wait: 'Puede esperar',
  today: 'Para hoy',
  urgent: 'Urgente',
} as const;

/** Profesionales con disponibilidad inmediata (dato del prototipo). */
export const URGENT_AVAILABLE_NOW = 7;

/** "Por qué confiar". `short*` = copy desktop, `long*` = copy mobile. */
export const TRUST_POINTS = [
  {
    title: 'Identidad verificada',
    longTitle: 'Identidad verificada',
    text: 'Validamos DNI y una selfie antes de publicar cada perfil.',
    longText: 'Validamos DNI y una selfie antes de publicar cada perfil.',
  },
  {
    title: 'Matrícula cuando corresponde',
    longTitle: 'Matrícula verificada cuando corresponde',
    text: 'Gas y electricidad exigen matrícula. La chequeamos con el ente que la emite.',
    longText: 'Gas y electricidad exigen matrícula. La chequeamos con el colegio o ente que la emite.',
  },
  {
    title: 'Solo opinan clientes reales',
    longTitle: 'Solo opinan clientes reales',
    text: 'Una reseña solo se deja después de un trabajo pedido por Resuelve.',
    longText: 'Una reseña solo se puede dejar después de un trabajo pedido por Resuelve.',
  },
  {
    title: 'Disponibilidad actualizada',
    longTitle: 'Disponibilidad actualizada',
    text: 'Cada profesional indica si puede trabajar hoy. Sin llamar a cinco números.',
    longText: 'Cada profesional indica si puede trabajar hoy. Sin llamar a cinco números.',
  },
];

export const CLIENT_USER = {
  name: 'María González',
  initials: 'MG',
  zone: 'Villa Italia',
  headerInitial: 'M',
};

/** Fecha de referencia del prototipo: jueves 24/09/2026. */
export const TODAY = new Date(2026, 8, 24);
