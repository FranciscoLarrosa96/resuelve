import type { ProfessionalProfile } from '../professionals/professional-profile.entity';
import { PlanTier } from '../professionals/professional.enums';

/**
 * Planes y entitlements. Única fuente de qué habilita cada plan: el resto del
 * código pregunta por un entitlement (`canSendUnlimitedQuotes`, `canBeFeatured`…),
 * nunca por `planTier === 'PRO'`.
 *
 * Dos fuentes de PRO que conviven sin pisarse:
 * - MANUAL: `professional_profiles.plan_tier` (+ `plan_expires_at` opcional
 *   para PRO temporal: fundadores, QA). Solo lo cambia `npm run plan:set`.
 * - BILLING: `professional_profiles.billing_pro_until`, derivado de la
 *   suscripción de Mercado Pago (`billing/billing-rules.ts`). Solo lo escribe
 *   la reconciliación de billing.
 * Plan EFECTIVO = PRO manual vigente O billing vigente. Al vencer vuelve a
 * FREE en el acto, sin borrar nada (no hay job: se calcula al leer). Un
 * webhook nunca baja un PRO manual y `plan:set --plan FREE` no corta una
 * suscripción paga.
 */

/**
 * Funcionalidades PRO todavía en desarrollo. En false no se ofrecen ni se
 * muestran como disponibles, aunque el plan las incluya.
 */
export const PRO_FEATURE_FLAGS = {
  quoteTemplates: false,
} as const;

export interface Entitlements {
  /** Presupuesta sin el tope mensual de FREE (`FREE_MONTHLY_QUOTE_LIMIT`). */
  canSendUnlimitedQuotes: boolean;
  /** Puede ocupar un espacio "Destacado" en resultados (si cumple todas las reglas normales). */
  canBeFeatured: boolean;
  /** "Tu mes" completo: valor aceptado, tasa, comparación, semanas, servicios, barrios. */
  canUseAdvancedAnalytics: boolean;
  /** Apariciones en búsquedas, visitas al perfil y embudo. */
  canSeeExposureAnalytics: boolean;
  /** Plantillas de presupuesto (flag apagado: todavía no existe). */
  canUseQuoteTemplates: boolean;
  /** Cantidad de fotos activas permitidas en el portfolio comercial. */
  portfolioPhotoLimit: 5 | 20;
}

export type CommercialLifecycle = 'PRE_FIRST_SUCCESS' | 'POST_FIRST_SUCCESS';
export type EntitlementSource =
  | 'FREE'
  | 'FIRST_SUCCESS_TRIAL'
  | 'MANUAL_PRO'
  | 'MERCADO_PAGO_PRO'
  | 'BONUS_PRO';

export interface AccessResolution {
  billingPlan: PlanTier;
  lifecycle: CommercialLifecycle;
  source: EntitlementSource;
  /** Trial privado de activación; nunca equivale al badge PRO público. */
  trialActive: boolean;
  entitlements: Entitlements;
}

/** Lo que hace falta del perfil para resolver el plan. */
export type PlanFields = Pick<ProfessionalProfile, 'planTier' | 'planExpiresAt'> & {
  billingProUntil?: Date | null;
  firstSuccessAt?: Date | null;
};

/** De dónde sale el PRO vigente (null = Free). Si hay ambos, manda el manual (no se cobra por él). */
export type PlanSource = 'MANUAL' | 'BILLING';

export function planSource(p: PlanFields, now = new Date()): PlanSource | null {
  if (p.planTier === PlanTier.PRO && (!p.planExpiresAt || p.planExpiresAt > now)) return 'MANUAL';
  if (p.billingProUntil && p.billingProUntil > now) return 'BILLING';
  return null;
}

export function effectivePlan(p: PlanFields, now = new Date()): PlanTier {
  return planSource(p, now) ? PlanTier.PRO : PlanTier.FREE;
}

export function entitlementsFor(plan: PlanTier): Entitlements {
  const pro = plan === PlanTier.PRO;
  return {
    canSendUnlimitedQuotes: pro,
    canBeFeatured: pro,
    canUseAdvancedAnalytics: pro,
    canSeeExposureAnalytics: pro,
    canUseQuoteTemplates: pro && PRO_FEATURE_FLAGS.quoteTemplates,
    portfolioPhotoLimit: pro ? 20 : 5,
  };
}

const trialEntitlements = (): Entitlements => ({
  ...entitlementsFor(PlanTier.FREE),
  canSendUnlimitedQuotes: true,
});

/**
 * Único resolver de acceso comercial. Billing y lifecycle permanecen
 * separados: el trial habilita solo capacidades de activación y nunca vuelve
 * al profesional PRO público ni crea una suscripción ficticia.
 */
export function resolveProfessionalAccess(
  p: PlanFields,
  options: { firstSuccessTrialEnabled?: boolean } = {},
  now = new Date(),
): AccessResolution {
  const source = planSource(p, now);
  const billingPlan = source ? PlanTier.PRO : PlanTier.FREE;
  const lifecycle: CommercialLifecycle = p.firstSuccessAt ? 'POST_FIRST_SUCCESS' : 'PRE_FIRST_SUCCESS';
  const trialActive = !source && !!options.firstSuccessTrialEnabled && lifecycle === 'PRE_FIRST_SUCCESS';
  const entitlementSource: EntitlementSource = source
    ? source === 'BILLING'
      ? 'MERCADO_PAGO_PRO'
      : p.planExpiresAt
        ? 'BONUS_PRO'
        : 'MANUAL_PRO'
    : trialActive
      ? 'FIRST_SUCCESS_TRIAL'
      : 'FREE';
  return {
    billingPlan,
    lifecycle,
    source: entitlementSource,
    trialActive,
    entitlements: trialActive ? trialEntitlements() : entitlementsFor(billingPlan),
  };
}

/**
 * Única fuente de entitlements de un profesional (PRO manual + billing).
 * Todo el backend pregunta por esto; el frontend recibe el resultado.
 */
export function resolveProfessionalEntitlements(
  p: PlanFields,
  now = new Date(),
  options: { firstSuccessTrialEnabled?: boolean } = {},
): Entitlements {
  return resolveProfessionalAccess(p, options, now).entitlements;
}

/** SQL equivalente a `effectivePlan(p) === PRO` para el alias `p` (professional_profiles). */
export const EFFECTIVE_PRO_SQL = `((p.plan_tier = 'PRO' AND (p.plan_expires_at IS NULL OR p.plan_expires_at > now())) OR p.billing_pro_until > now())`;

/** Lo que ve el propio profesional de su plan (GET /pro/me → `plan`). */
export function presentPlan(
  p: PlanFields,
  now = new Date(),
  options: { firstSuccessTrialEnabled?: boolean } = {},
) {
  const source = planSource(p, now);
  const tier = source ? PlanTier.PRO : PlanTier.FREE;
  const access = resolveProfessionalAccess(p, options, now);
  return {
    tier,
    /** MANUAL (plan:set) | BILLING (Mercado Pago) | null = Free. El detalle del cobro: GET /billing/pro/status. */
    source,
    /** Solo si el PRO vigente es manual con vencimiento (PRO temporal). */
    expiresAt: source === 'MANUAL' ? p.planExpiresAt : null,
    entitlements: access.entitlements,
    lifecycle: access.lifecycle,
    entitlementSource: access.source,
    trialActive: access.trialActive,
  };
}
