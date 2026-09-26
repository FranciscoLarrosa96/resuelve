import { WeekIncome } from '../models/pro';

/**
 * MOCK de desarrollo: números de ejemplo. Solo los usa "Tu mes"
 * (/pro/estadisticas), una pantalla demo con aviso, fuera de la navegación
 * y detrás de professionalGuard. Nunca como respaldo de una pantalla real.
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
  { label: 'Búsqueda', pct: 58, color: '#1A5C4D' },
  { label: 'Urgencias', pct: 24, color: '#B8651A' },
  { label: 'Perfil compartido', pct: 18, color: '#315E82' },
];
