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
  response?: {
    opportunities: number;
    answered: number;
    rate: number | null;
    medianMinutes: number | null;
    previous: { opportunities: number; answered: number; rate: number | null; medianMinutes: number | null };
  };
  attribution?: {
    earlyAccessOpportunities: number;
    featuredAttributedRequests: number;
    featuredAttributedAccepted: number;
  };
  benchmark?: {
    available: boolean;
    periodDays: number;
    serviceName?: string;
    cohortSize?: number;
    medianResponseMinutes?: number | null;
    responseRate?: number | null;
    acceptanceRate?: number | null;
  };
  /** Base: presupuestos enviados este mes. `rate` null = sin enviados. */
  acceptance: { sent: number; accepted: number; rate: number | null };
  /** null = el mes anterior no tuvo actividad (sin base para comparar). */
  previous: (MonthRef & MonthCounts & { acceptedQuotesValue: string }) | null;
  weekly: WeekActivity[];
  byService: BreakdownRow[];
  byZone: BreakdownRow[];
}

export interface MonthAnalytics {
  period: MonthRef & { start: string; end: string; isCurrent: boolean; earliest: MonthRef; comparisonThroughDay?: number | null };
  plan: PlanTier;
  entitlements: Entitlements;
  /** `acceptedQuotesValue`: suma de presupuestos aceptados del mes (todos los planes; no es lo cobrado). */
  basic: MonthCounts & { currentRating: number | null; reviewCount: number; acceptedQuotesValue?: string };
  /** Hasta 5 reseñas del mes, más recientes primero. Incluye las de clientes invitados (`invited`), que no cuentan en el puntaje. */
  recentReviews: ProfessionalReview[];
  advanced: AdvancedAnalytics | null;
  exposure: ExposureAnalytics | null;
  /** Sin exposición PRO: totales del mes y lo que pasó por no tener PRO (null con PRO). */
  proPreview?: ProPreview | null;
  /** "La demanda en tu zona" (Free y PRO). null/ausente = sin base suficiente: no se muestra. */
  demand?: LocalDemand | null;
}

/**
 * Pedidos del mes de SUS servicios en SU ciudad principal, agregados y anónimos (mínimo
 * de muestra en el backend). Nunca quién pidió ni a quién.
 */
export interface LocalDemand {
  locality: string;
  services: string[];
  /** Pedidos publicados en el mes (de cualquier cliente, a cualquier profesional). */
  requests: number;
  received?: number;
  /** De esos, cuántos ya tenían presupuesto antes de que los perfiles Free pudieran verlos. */
  answeredBeforeFree: number;
  /** Otros perfiles PRO que hoy pueden ocupar Destacados en esos servicios y esa ciudad. */
  otherProProfiles: number;
}

/**
 * Lo que un perfil sin PRO puede ver de su mes: los TOTALES de apariciones, visitas y toques en
 * WhatsApp y Llamar (el desglose y la comparación son de PRO) y hechos registrados:
 * solicitudes nuevas que le llegaron después que a PRO (y cuántas ya tenían un
 * presupuesto de otro) y las que vio sin poder responder por el cupo.
 */
export interface ProPreview {
  impressions: number;
  profileViews: number;
  /**
   * Totales de toques del período (no conversaciones ni trabajos). Ausentes en un backend anterior:
   * ausente = no se sabe (no se muestra), distinto de 0 (cero real).
   */
  whatsappClicks?: number;
  phoneClicks?: number;
  delayedOpportunities: number;
  delayedAfterOtherQuote: number;
  blockedOpportunities: number;
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
  /**
   * Toques en "WhatsApp" y "Llamar" (una vez por sesión y canal cada 30 min). Un toque NO es
   * una conversación ni un trabajo. Pueden faltar en un backend anterior.
   */
  whatsappClicks?: number;
  phoneClicks?: number;
  /** En % con un decimal; null = sin base o el paso siguiente superó al anterior (la UI muestra "—"). */
  rates: { viewsPerImpression: number | null; requestsPerView: number | null; acceptance: number | null };
  /** null = el mes anterior no tuvo apariciones ni visitas registradas. */
  previous: { impressions: number; profileViews: number; whatsappClicks?: number; phoneClicks?: number } | null;
}

export type PlanTier = 'FREE' | 'PRO' | 'PRO_PLUS';

/** Qué habilita el plan. La UI pregunta por esto, nunca por `tier === 'PRO'`. */
export interface Entitlements {
  canSendUnlimitedQuotes: boolean;
  canBeFeatured: boolean;
  canUseAdvancedAnalytics: boolean;
  canSeeExposureAnalytics: boolean;
  canUseQuoteTemplates: boolean;
  /** Trabajos activos en "Trabajos realizados" (Free 0 / PRO 10 / Plus 30, con 5 fotos cada uno). */
  portfolioWorkLimit: 0 | 10 | 30;
  canPinWorks?: boolean;
  canUseBeforeAfter?: boolean;
  canExportQuotePdf?: boolean;
  canExportAnalytics?: boolean;
  /** Foto de portada en el perfil público (PRO). Puede faltar en un backend anterior. */
  canUseCoverPhoto?: boolean;
}

/** Oportunidades Free respondidas en total (GET /pro/me → quoteUsage). limit/remaining null = sin límite. */
export interface QuoteUsage {
  /** Oportunidades discovery distintas consumidas durante Free post-trial. */
  used: number;
  limit: number | null;
  remaining: number | null;
  compatibleReceived?: number;
  blockedOpportunities?: number;
}

/** GET /pro/me → plan (efectivo: un PRO vencido ya es FREE). */
export interface OwnPlan {
  tier: PlanTier;
  /** MANUAL (activado a mano) | BILLING (Mercado Pago) | null = Free. */
  source?: 'MANUAL' | 'BILLING' | 'TRANSFER' | 'BONUS' | null;
  /** Solo PRO manual con vencimiento. */
  expiresAt: string | null;
  entitlements: Entitlements;
  lifecycle?: 'PRE_FIRST_SUCCESS' | 'POST_FIRST_SUCCESS';
  entitlementSource?: 'FREE' | 'FIRST_SUCCESS_TRIAL' | 'MANUAL_PRO' | 'MERCADO_PAGO_PRO' | 'TRANSFER_PRO' | 'BONUS_PRO';
  /** Beneficio privado de activación; no habilita el badge PRO público. */
  trialActive?: boolean;
}

/** GET /plans: condiciones configurables en el backend. */
export interface PlansInfo {
  /** null = sin límite. */
  free: { quoteLimit: number | null };
  /** `selfServe` true = se contrata online con Mercado Pago; false = solo activación manual. */
  pro: { monthlyPriceArs: number; selfServe: boolean; features: { quoteTemplates: boolean } };
  /** Condición general de la oferta de bienvenida (null = apagada). Quién la tiene: `/pro/me`. */
  proPlus?: { monthlyPriceArs: number; selfServe: boolean };
  introOffer?: { code: string; discountPercent: number; cycles: number; discountedPriceArs: number } | null;
}
