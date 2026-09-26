import { ProfessionalReview } from './professional';

/**
 * "Tu mes" (GET /pro/analytics/month): espejo de AnalyticsService del backend.
 * Todo es actividad REAL del profesional autenticado en un mes calendario de
 * Argentina. `advanced` solo llega con el entitlement `advancedAnalytics`.
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
}

export type PlanTier = 'FREE' | 'PRO';

/** Qué habilita el plan. La UI pregunta por esto, nunca por `tier === 'PRO'`. */
export interface Entitlements {
  advancedAnalytics: boolean;
  featuredPlacement: boolean;
  quoteTemplates: boolean;
}

/** GET /pro/me → plan (efectivo: un PRO vencido ya es FREE). */
export interface OwnPlan {
  tier: PlanTier;
  expiresAt: string | null;
  entitlements: Entitlements;
}

/** GET /plans: condiciones configurables en el backend. */
export interface PlansInfo {
  free: { monthlyQuoteLimit: number | null };
  pro: { monthlyPriceArs: number | null; selfServe: boolean; features: { quoteTemplates: boolean } };
}
