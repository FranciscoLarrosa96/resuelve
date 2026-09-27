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
}

/** Lo que hace falta del perfil para resolver el plan. */
export type PlanFields = Pick<ProfessionalProfile, 'planTier' | 'planExpiresAt'> & {
  billingProUntil?: Date | null;
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
  };
}

/**
 * Única fuente de entitlements de un profesional (PRO manual + billing).
 * Todo el backend pregunta por esto; el frontend recibe el resultado.
 */
export function resolveProfessionalEntitlements(p: PlanFields, now = new Date()): Entitlements {
  return entitlementsFor(effectivePlan(p, now));
}

/** SQL equivalente a `effectivePlan(p) === PRO` para el alias `p` (professional_profiles). */
export const EFFECTIVE_PRO_SQL = `((p.plan_tier = 'PRO' AND (p.plan_expires_at IS NULL OR p.plan_expires_at > now())) OR p.billing_pro_until > now())`;

/** Lo que ve el propio profesional de su plan (GET /pro/me → `plan`). */
export function presentPlan(p: PlanFields, now = new Date()) {
  const source = planSource(p, now);
  const tier = source ? PlanTier.PRO : PlanTier.FREE;
  return {
    tier,
    /** MANUAL (plan:set) | BILLING (Mercado Pago) | null = Free. El detalle del cobro: GET /billing/pro/status. */
    source,
    /** Solo si el PRO vigente es manual con vencimiento (PRO temporal). */
    expiresAt: source === 'MANUAL' ? p.planExpiresAt : null,
    entitlements: entitlementsFor(tier),
  };
}
