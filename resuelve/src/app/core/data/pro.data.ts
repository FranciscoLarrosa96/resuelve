import {
  ActivityItem,
  AgendaEvent,
  IncomingRequest,
  ProSettings,
  QuoteDraft,
  WeekIncome,
} from '../models/pro';

export const INCOMING_REQUESTS: IncomingRequest[] = [
  {
    id: 'r1', title: 'Saltan las térmicas', zone: 'Villa Italia', distanceKm: 2.4, when: 'Hoy después de las 16',
    description: 'Cuando prendo el horno eléctrico salta la térmica de la cocina. Pasa desde ayer a la noche.',
    urgency: 'Para hoy', photos: 2, client: 'María', clientInitial: 'M', receivedAgo: 'hace 12 min', status: 'new', others: 2,
  },
  {
    id: 'r2', title: 'Se cortó la luz en media casa', zone: 'Centro', distanceKm: 1.1, when: 'Lo antes posible',
    description: 'Se apagaron los tomas del living y la cocina. El disyuntor no sube.',
    urgency: 'Urgente', photos: 1, client: 'Graciela', clientInitial: 'G', receivedAgo: 'hace 25 min', status: 'new', others: 1,
  },
  {
    id: 'r3', title: 'Instalar ventilador de techo', zone: 'Uncas', distanceKm: 3.2, when: 'Esta semana',
    description: 'Tengo el ventilador comprado, falta instalarlo en el dormitorio. Ya hay caja en el techo.',
    urgency: 'Puede esperar', photos: 1, client: 'Federico', clientInitial: 'F', receivedAgo: 'hace 1 h', status: 'new', others: 2,
  },
  {
    id: 'r4', title: 'Agregar tomas en oficina', zone: 'Villa Aguirre', distanceKm: 4.0, when: 'Mañana a la mañana',
    description: 'Necesito sumar 4 tomas dobles en una oficina chica, con cablecanal.',
    urgency: 'Puede esperar', photos: 3, client: 'Lucas', clientInitial: 'L', receivedAgo: 'hace 3 h', status: 'new', others: 0,
  },
  {
    id: 'r5', title: 'Cambio de tablero', zone: 'Centro', distanceKm: 1.8, when: 'Próxima semana',
    description: 'Tablero viejo con fusibles, quiero pasar a térmicas y disyuntor.',
    urgency: 'Puede esperar', photos: 2, client: 'Ana', clientInitial: 'A', receivedAgo: 'ayer', status: 'quoted', quoteAmount: 185000, others: 2,
  },
  {
    id: 'r6', title: 'Luces del patio', zone: 'La Movediza', distanceKm: 5.1, when: 'Lunes',
    description: 'Instalar dos apliques exteriores con fotocélula.',
    urgency: 'Puede esperar', photos: 0, client: 'Jorge', clientInitial: 'J', receivedAgo: 'ayer', status: 'quoted', quoteAmount: 64000, others: 1,
  },
  {
    id: 'r7', title: 'Cambio de térmica', zone: 'Centro', distanceKm: 1.3, when: 'Hoy 09:00',
    description: 'Térmica de 20A que calienta.',
    urgency: 'Para hoy', photos: 1, client: 'Rosa', clientInitial: 'R', receivedAgo: 'hace 2 días', status: 'accepted', others: 0,
  },
];

/** Semana del 21 al 27 de septiembre. Hoy = jueves (día 3). */
export const AGENDA_EVENTS: AgendaEvent[] = [
  { id: 'e1', day: 3, start: 9, duration: 1, title: 'Cambio de térmica', zone: 'Centro', client: 'Rosa', address: 'Pinto 842' },
  { id: 'e2', day: 3, start: 11.5, duration: 1.5, title: 'Instalación ventilador', zone: 'Uncas', client: 'Pedro', address: 'Av. Colón 1530' },
  { id: 'e3', day: 3, start: 17, duration: 1.5, title: 'Revisión tablero', zone: 'Villa Aguirre', client: 'Esteban', address: 'Sarmiento 310' },
  { id: 'e4', day: 4, start: 10, duration: 2, title: 'Tomas en cocina', zone: 'Villa Italia', client: 'Claudia', address: 'Alem 455' },
  { id: 'e5', day: 4, start: 15.5, duration: 1, title: 'Presupuesto en obra', zone: 'Centro', client: 'Martín', address: '9 de Julio 780' },
  { id: 'e6', day: 0, start: 8.5, duration: 2, title: 'Iluminación LED local', zone: 'Centro', client: 'Kiosco Pinto', address: 'Pinto 1020' },
  { id: 'e7', day: 1, start: 14, duration: 3, title: 'Tablero nuevo', zone: 'La Movediza', client: 'Hugo', address: 'Quintana 210' },
  { id: 'e8', day: 2, start: 9, duration: 1.5, title: 'Cortocircuito baño', zone: 'Uncas', client: 'Silvia', address: 'Rivadavia 1400' },
  { id: 'e9', day: 2, start: 16, duration: 1, title: 'Ventilador', zone: 'Centro', client: 'Pablo', address: 'Belgrano 560' },
  { id: 'e10', day: 5, start: 9.5, duration: 2, title: 'Cambio de tablero', zone: 'Centro', client: 'Ana', address: 'Mitre 330', tentative: true },
];

export const AGENDA_WEEK = {
  label: '21 al 27 de septiembre',
  month: 'Septiembre 2026',
  firstDayNumber: 21,
  todayIndex: 3,
  /** 13:20 */
  now: 13.33,
  firstHour: 8,
  lastHour: 19,
};

export const WEEK_DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export const INITIAL_QUOTE_DRAFT: QuoteDraft = {
  description: 'Revisión del circuito de cocina, cambio de térmica y ajuste de conexiones del horno.',
  labor: 38000,
  materials: 12500,
  slot: 'Hoy 16 a 18 h',
  validity: '7 días',
  notes: '',
};

export const QUOTE_SLOTS = ['Hoy 16 a 18 h', 'Mañana 9 a 12 h', 'Mañana 14 a 17 h'];
export const QUOTE_VALIDITIES = ['3 días', '7 días', '15 días'];

export const INITIAL_PRO_SETTINGS: ProSettings = {
  name: 'Juan Martín',
  trade: 'Electricista matriculado',
  years: '11',
  description:
    'Electricista matriculado con 11 años en Tandil. Trabajo prolijo, presupuesto sin cargo y garantía por escrito.',
  categories: ['Electricidad'],
  services: ['Instalaciones eléctricas', 'Tableros', 'Cortocircuitos', 'Tomas', 'Iluminación'],
  zones: ['Centro', 'Uncas', 'Villa Aguirre'],
  hours: 'Lun a vie 8 a 18 h · Sáb 9 a 13 h',
};

export const VERIFICATION_ROWS = [
  { title: 'Identidad', detail: 'DNI y selfie validados el 12/03/2026', status: 'Verificada', ok: true },
  { title: 'Matrícula de electricista', detail: 'N.º 4.218 · vigente hasta 2027', status: 'Verificada', ok: true },
  { title: 'Teléfono', detail: '+54 249 ••• 3321', status: 'Verificado', ok: true },
  { title: 'Seguro de responsabilidad civil', detail: 'Opcional · suma confianza en trabajos grandes', status: 'Sin cargar', ok: false },
];

export const PRO_PORTFOLIO = ['Tablero nuevo con disyuntor', 'Iluminación LED de cocina', 'Ventilador de techo', 'Tomas en oficina'];

export const PRO_STATS = {
  month: 'septiembre',
  income: 487000,
  incomeDelta: '+18% vs. agosto',
  jobsDone: 14,
  jobsDelta: '3 más que en agosto',
  jobsFromResuelve: 8,
  responseRate: '96%',
  avgResponse: '12 min',
  acceptance: '62%',
  acceptanceDetail: '8 de 13 enviados',
  rating: '4,9',
  reviewsCount: 98,
  newReviews: 3,
  monthReviews: 9,
  winRate: '57%',
  categoryWinRate: '41%',
  medianResponse: '7 min',
  weekJobs: 7,
  planUsed: 7,
  planLimit: 10,
};

export const WEEK_INCOME: WeekIncome[] = [
  { label: 'Sem 1', amount: 92000, previousAmount: 80000 },
  { label: 'Sem 2', amount: 138000, previousAmount: 96000 },
  { label: 'Sem 3', amount: 104000, previousAmount: 120000 },
  { label: 'Sem 4', amount: 153000, previousAmount: 110000 },
];

export const FUNNEL = [
  { label: 'Visualizaciones del perfil', value: 281, pct: 100, accent: false },
  { label: 'Solicitudes recibidas', value: 19, pct: 62, accent: false },
  { label: 'Presupuestos enviados', value: 14, pct: 48, accent: false },
  { label: 'Trabajos conseguidos', value: 8, pct: 32, accent: true },
];

export const DISCOVERY_SOURCES = [
  { label: 'Búsqueda', pct: 58, color: '#1E5B4B' },
  { label: 'Urgencias', pct: 24, color: '#C9711F' },
  { label: 'Perfil compartido', pct: 18, color: '#2F4B6E' },
];

export const RECENT_ACTIVITY: ActivityItem[] = [
  { text: 'Ana abrió tu presupuesto de $ 185.000', time: 'hace 20 min', color: '#2F4B6E' },
  { text: 'Rosa te dejó 5 estrellas', time: 'hace 2 h', color: '#C9711F' },
  { text: 'Nueva solicitud de María en Villa Italia', time: 'hace 12 min', color: '#1E5B4B' },
  { text: 'Jorge todavía no respondió tu presupuesto', time: 'ayer', color: '#8A918C' },
];

export const PLAN_PRICE = 14900;

export const PLAN_ROWS = [
  { feature: 'Perfil público y reseñas verificadas', free: '✓', pro: '✓' },
  { feature: 'Solicitudes por mes', free: '10', pro: 'Ilimitadas' },
  { feature: 'Disponibilidad diaria', free: '✓', pro: '✓' },
  { feature: 'Portfolio', free: '6 fotos', pro: 'Completo' },
  { feature: 'Zonas de cobertura', free: '2', pro: 'Hasta 5' },
  { feature: 'Categorías', free: '1', pro: 'Hasta 3' },
  { feature: 'Agenda de trabajos', free: '—', pro: '✓' },
  { feature: 'Presupuestos con plantillas', free: '—', pro: '✓' },
  { feature: 'Estadísticas de tu mes', free: '—', pro: '✓' },
];

export const FREE_FEATURES = [
  'Perfil público',
  'Reseñas verificadas',
  'Hasta 10 solicitudes por mes',
  'Disponibilidad diaria',
  'Portfolio básico (6 fotos)',
];

export const PRO_FEATURES = [
  'Solicitudes ilimitadas',
  'Agenda de trabajos',
  'Estadísticas de tu mes',
  'Presupuestos con plantillas',
  'Portfolio completo',
  'Hasta 5 zonas de cobertura',
  'Hasta 3 categorías',
  'Herramientas de gestión',
];

export const CLIENT_SUMMARY = { since: 'Cliente desde 2025 · 3 pedidos', trust: 'Teléfono verificado · siempre dejó reseña' };
