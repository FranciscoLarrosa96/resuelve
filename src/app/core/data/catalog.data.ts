import { Category, CategoryName } from '../models/category';
import { PortfolioItem } from '../models/professional';
import { ServiceRequestDraft } from '../models/service-request';
import { SERVICES } from './services.data';

export const CITY = 'Tandil';

export const CATEGORIES: Category[] = [
  { name: 'Electricidad', count: '38 profesionales', defaultProblem: 'Problema eléctrico' },
  { name: 'Gas', count: '21 matriculados', defaultProblem: 'Revisión de gas' },
  { name: 'Plomería', count: '34 profesionales', defaultProblem: 'Pérdida de agua' },
  { name: 'Cerrajería', count: '12 profesionales', defaultProblem: 'Apertura de puerta' },
  { name: 'Aire acondicionado', count: '17 profesionales', defaultProblem: 'Instalación de equipo' },
  { name: 'Pintura', count: '26 profesionales', defaultProblem: 'Pintura de ambientes' },
  { name: 'Albañilería', count: '29 profesionales', defaultProblem: 'Arreglos de albañilería' },
];

export const ALL_CATEGORIES_TILE = { name: 'Ver todos', count: `${SERVICES.length} servicios` };

export const URGENT_CATEGORIES: CategoryName[] = [
  'Cerrajería',
  'Plomería',
  'Electricidad',
  'Gas',
  'Destapaciones',
];

export const SERVICES_BY_CATEGORY: Partial<Record<CategoryName, string[]>> = {
  Electricidad: ['Instalaciones eléctricas', 'Tableros', 'Cortocircuitos', 'Ventiladores', 'Tomas', 'Iluminación'],
  Plomería: ['Pérdidas y filtraciones', 'Griferías', 'Termotanques', 'Destapaciones', 'Sanitarios', 'Cañerías'],
  Gas: ['Instalaciones de gas', 'Calefactores', 'Calefones y termotanques', 'Pruebas de hermeticidad', 'Detección de fugas'],
  Cerrajería: ['Aperturas', 'Cambio de cerraduras', 'Copias de llaves', 'Cerraduras de seguridad'],
  Pintura: ['Interiores', 'Exteriores', 'Impermeabilización', 'Enduido y reparaciones'],
  'Aire acondicionado': ['Instalación de equipos', 'Carga de gas', 'Limpieza y mantenimiento', 'Reparaciones'],
  Albañilería: ['Humedad', 'Revoques', 'Contrapisos', 'Pequeñas reformas'],
};

export const PORTFOLIO_BY_CATEGORY: Partial<Record<CategoryName, PortfolioItem[]>> = {
  Electricidad: [
    { title: 'Tablero nuevo con disyuntor', zone: 'Centro' },
    { title: 'Iluminación LED de cocina', zone: 'Villa Italia' },
    { title: 'Ventilador de techo', zone: 'Uncas' },
    { title: 'Tomas en oficina', zone: 'Villa Aguirre' },
  ],
  Plomería: [
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
  text: DEFAULT_REQUEST_TEXT,
  category: 'Plomería',
  problem: 'Pérdida bajo mesada',
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
