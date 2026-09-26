import { ProfessionalReview } from './professional';

/**
 * "Tu mes" (GET /pro/analytics/month): espejo de AnalyticsService del backend.
 * Todo es actividad REAL del profesional autenticado en un mes calendario de
 * Argentina. `advanced` solo llega con `canUseAdvancedAnalytics` y `exposure`
 * con `canSeeExposureAnalytics` (PRO vigente).
 */
export interface MonthRef {
  year: number;
  /** 1 = enero. */
  month: number;
}

export interface MonthCounts {
  requestsReceived: number;
  quotesSent: number;
  quotesAccepted: number;
  scheduledJobs: number;
  completedJobs: number;
  reviewsReceived: number;
}

export interface WeekActivity {
  fromDay: number;
  toDay: number;
  requestsReceived: number;
  quotesSent: number;
  completedJobs: number;
}

export interface BreakdownRow {
  id: string;
  name: string;
  requestsReceived: number;
  quotesSent: number;
  quotesAccepted: number;
}

export interface AdvancedAnalytics {
  /** Suma de presupuestos aceptados ("1840000.00"). No es lo que cobró. */
  acceptedQuotesValue: string;
  /** Base: presupuestos enviados este mes. `rate` null = sin enviados. */
  acceptance: { sent: number; accepted: number; rate: number | null };
  /** null = el mes anterior no tuvo actividad (sin base para comparar). */
  previous: (MonthRef & MonthCounts & { acceptedQuotesValue: string }) | null;
  weekly: WeekActivity[];
  byService: BreakdownRow[];
  byZone: BreakdownRow[];
}

export interface MonthAnalytics {
  period: MonthRef & { start: string; end: string; isCurrent: boolean; earliest: MonthRef };
  plan: PlanTier;
  entitlements: Entitlements;
  basic: MonthCounts & { currentRating: number | null; reviewCount: number };
  /** Hasta 3 reseñas del mes, más recientes primero. */
  recentReviews: ProfessionalReview[];
  advanced: AdvancedAnalytics | null;
  exposure: ExposureAnalytics | null;
}

/**
 * Exposición REAL del mes: apariciones de la tarjeta en búsquedas (≥ 50 %
 * visible durante ≥ 500 ms, una por búsqueda y sesión) y visitas al perfil
 * (una por sesión cada 30 min). Son conteos, no personas únicas.
 */
export interface ExposureAnalytics {
  impressions: number;
  /** De esas apariciones, cuántas fueron en un espacio "Destacado". */
  featuredImpressions: number;
  profileViews: number;
  /** En % con un decimal; null = sin base o el paso siguiente superó al anterior (la UI muestra "—"). */
  rates: { viewsPerImpression: number | null; requestsPerView: number | null; acceptance: number | null };
  /** null = el mes anterior no tuvo apariciones ni visitas registradas. */
  previous: { impressions: number; profileViews: number } | null;
}

export type PlanTier = 'FREE' | 'PRO';

/** Qué habilita el plan. La UI pregunta por esto, nunca por `tier === 'PRO'`. */
export interface Entitlements {
  canSendUnlimitedQuotes: boolean;
  canBeFeatured: boolean;
  canUseAdvancedAnalytics: boolean;
  canSeeExposureAnalytics: boolean;
  canUseQuoteTemplates: boolean;
}

/** Cupo de presupuestos del mes (GET /pro/me → quoteUsage). limit/remaining null = sin límite. */
export interface QuoteUsage {
  period: MonthRef;
  used: number;
  limit: number | null;
  remaining: number | null;
}

/** GET /pro/me → plan (efectivo: un PRO vencido ya es FREE). */
export interface OwnPlan {
  tier: PlanTier;
  expiresAt: string | null;
  entitlements: Entitlements;
}

/** GET /plans: condiciones configurables en el backend. */
export interface PlansInfo {
  /** null = sin límite. */
  free: { monthlyQuoteLimit: number | null };
  /** `selfServe` false = todavía no se contrata online. */
  pro: { monthlyPriceArs: number; selfServe: boolean; features: { quoteTemplates: boolean } };
}
