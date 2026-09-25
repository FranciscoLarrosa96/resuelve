import {
  ActivityItem,
  AgendaEvent,
  ProSettings,
  WeekIncome,
} from '../models/pro';

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

export const INITIAL_PRO_SETTINGS: ProSettings = {
  name: 'Juan Martín',
  trade: 'Electricista matriculado',
  years: '11',
  description:
    'Electricista matriculado con 11 años en Tandil. Trabajo prolijo, presupuesto sin cargo y garantía por escrito.',
  serviceSlugs: ['electricidad'],
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

/**
 * MOCK de desarrollo: números propios del profesional de ejemplo.
 * Al integrar la API deben venir de datos reales o no mostrarse.
 * No incluir comparaciones con otros profesionales ("promedio en tu rubro")
 * hasta tener volumen real suficiente para calcularlas.
 */
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
  { text: 'Rosa te dejó 5 estrellas', time: 'hace 2 h', color: '#C9711F' },
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

