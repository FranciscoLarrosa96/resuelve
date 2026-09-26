import type { ProfessionalProfile } from '../professionals/professional-profile.entity';
import { PlanTier } from '../professionals/professional.enums';

/**
 * Planes y entitlements. Única fuente de qué habilita cada plan: el resto del
 * código pregunta por un entitlement (`canSendUnlimitedQuotes`, `canBeFeatured`…),
 * nunca por `planTier === 'PRO'`.
 *
 * - El plan se guarda en `professional_profiles.plan_tier` (+ `plan_expires_at`
 *   opcional para PRO temporal: fundadores, pruebas manuales).
 * - Plan EFECTIVO: PRO solo si no venció. Al vencer vuelve a FREE en el acto,
 *   sin borrar nada (no hay job: se calcula al leer).
 * - Ningún endpoint cambia el plan: solo `npm run plan:set` (terminal con
 *   acceso a la base) hasta que exista billing.
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

export function effectivePlan(
  p: Pick<ProfessionalProfile, 'planTier' | 'planExpiresAt'>,
  now = new Date(),
): PlanTier {
  if (p.planTier !== PlanTier.PRO) return PlanTier.FREE;
  return !p.planExpiresAt || p.planExpiresAt > now ? PlanTier.PRO : PlanTier.FREE;
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

/** SQL equivalente a `effectivePlan(p) === PRO` para el alias `p` (professional_profiles). */
export const EFFECTIVE_PRO_SQL = `(p.plan_tier = 'PRO' AND (p.plan_expires_at IS NULL OR p.plan_expires_at > now()))`;

/** Lo que ve el propio profesional de su plan (GET /pro/me → `plan`). */
export function presentPlan(p: Pick<ProfessionalProfile, 'planTier' | 'planExpiresAt'>, now = new Date()) {
  const tier = effectivePlan(p, now);
  return {
    tier,
    /** Solo si el PRO vigente tiene vencimiento (PRO temporal). */
    expiresAt: tier === PlanTier.PRO ? p.planExpiresAt : null,
    entitlements: entitlementsFor(tier),
  };
}
