import type { ProfessionalProfile } from '../professionals/professional-profile.entity';
import { PlanTier } from '../professionals/professional.enums';

/**
 * Planes y entitlements. Única fuente de qué habilita cada plan: el resto del
 * código pregunta por un entitlement (`canSendUnlimitedQuotes`, `canBeFeatured`…),
 * nunca por `planTier === 'PRO'`.
 *
 * Fuentes de PRO que conviven sin pisarse:
 * - MANUAL: `professional_profiles.plan_tier` (+ `plan_expires_at` opcional
 *   para PRO temporal: fundadores, QA). Lo cambian `npm run plan:set` y "Dar PRO" del panel admin.
 * - BILLING: `professional_profiles.billing_pro_until`, derivado de la
 *   suscripción de Mercado Pago (`billing/billing-rules.ts`). Solo lo escribe
 *   la reconciliación de billing.
 * - TRANSFER: `transfer_pro_until`, PRO pagado por transferencia y confirmado
 *   por un admin (`billing/transfer/`). Prepago, sin renovación automática.
 * - BONUS: `bonus_pro_until`, días de PRO de referidos o de la prueba de PRO, separados del cobro.
 * Plan EFECTIVO = PRO manual, billing, transferencia o bonus vigente. Al vencer vuelve a
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
  /** Responde sin el tope total de Free (`FREE_QUOTE_LIMIT`). */
  canSendUnlimitedQuotes: boolean;
  /** Puede ocupar un espacio "Destacado" en resultados (si cumple todas las reglas normales). */
  canBeFeatured: boolean;
  /** "Tu mes" completo: valor aceptado, tasa, comparación, semanas, servicios, barrios. */
  canUseAdvancedAnalytics: boolean;
  /** Apariciones en búsquedas, visitas al perfil y embudo. */
  canSeeExposureAnalytics: boolean;
  /** Plantillas de presupuesto (flag apagado: todavía no existe). */
  canUseQuoteTemplates: boolean;
  /** Trabajos activos en "Trabajos realizados" (cada uno con hasta 5 fotos, `work-photo-rules.ts`). */
  portfolioWorkLimit: 0 | 10 | 30;
  canPinWorks: boolean;
  canUseBeforeAfter: boolean;
  canExportQuotePdf: boolean;
  canExportAnalytics: boolean;
  /** Foto de portada en el perfil público. */
  canUseCoverPhoto: boolean;
}

export type CommercialLifecycle = 'PRE_FIRST_SUCCESS' | 'POST_FIRST_SUCCESS';
export type EntitlementSource =
  'FREE' | 'FIRST_SUCCESS_TRIAL' | 'MANUAL_PRO' | 'MERCADO_PAGO_PRO' | 'TRANSFER_PRO' | 'BONUS_PRO';

export interface AccessResolution {
  billingPlan: PlanTier;
  lifecycle: CommercialLifecycle;
  source: EntitlementSource;
  /** Acceso inicial sin demora; no exime del cupo Free ni equivale a PRO. */
  trialActive: boolean;
  entitlements: Entitlements;
}

/** Lo que hace falta del perfil para resolver el plan. */
export type PlanFields = Pick<ProfessionalProfile, 'planTier' | 'planExpiresAt'> & {
  billingProUntil?: Date | null;
  billingPlusUntil?: Date | null;
  transferPlusFrom?: Date | null;
  transferPlusUntil?: Date | null;
  transferProUntil?: Date | null;
  bonusProUntil?: Date | null;
  firstSuccessAt?: Date | null;
};

/**
 * De dónde sale el PRO vigente (null = Free). Si hay varias, manda el manual
 * (no se cobra por él), después lo pagado (Mercado Pago, transferencia) y al final el bonus.
 */
export type PlanSource = 'MANUAL' | 'BILLING' | 'TRANSFER' | 'BONUS';

/** Highest active tier wins; for equal tiers, keep manual > billing > transfer > bonus. */
function activePlan(p: PlanFields, now: Date): { tier: PlanTier; source: PlanSource | null } {
  const candidates: { tier: PlanTier; source: PlanSource }[] = [];
  if ((p.planTier === PlanTier.PRO || p.planTier === PlanTier.PRO_PLUS) && (!p.planExpiresAt || p.planExpiresAt > now))
    candidates.push({ tier: p.planTier, source: 'MANUAL' });
  if (p.billingProUntil && p.billingProUntil > now)
    candidates.push({ tier: p.billingPlusUntil && p.billingPlusUntil > now ? PlanTier.PRO_PLUS : PlanTier.PRO, source: 'BILLING' });
  if (p.transferProUntil && p.transferProUntil > now)
    candidates.push({ tier: p.transferPlusFrom && p.transferPlusFrom <= now && p.transferPlusUntil && p.transferPlusUntil > now ? PlanTier.PRO_PLUS : PlanTier.PRO, source: 'TRANSFER' });
  if (p.bonusProUntil && p.bonusProUntil > now) candidates.push({ tier: PlanTier.PRO, source: 'BONUS' });
  return candidates.find((c) => c.tier === PlanTier.PRO_PLUS) ?? candidates[0] ?? { tier: PlanTier.FREE, source: null };
}

export function planSource(p: PlanFields, now = new Date()): PlanSource | null {
  return activePlan(p, now).source;
}

export function effectivePlan(p: PlanFields, now = new Date()): PlanTier {
  return activePlan(p, now).tier;
}

export function entitlementsFor(plan: PlanTier): Entitlements {
  const pro = plan === PlanTier.PRO || plan === PlanTier.PRO_PLUS;
  const plus = plan === PlanTier.PRO_PLUS;
  return {
    canSendUnlimitedQuotes: pro,
    canBeFeatured: pro,
    canUseAdvancedAnalytics: pro,
    canSeeExposureAnalytics: pro,
    canUseQuoteTemplates: pro && PRO_FEATURE_FLAGS.quoteTemplates,
    portfolioWorkLimit: plus ? 30 : pro ? 10 : 0,
    canPinWorks: plus,
    canUseBeforeAfter: plus,
    canExportQuotePdf: plus,
    canExportAnalytics: plus,
    canUseCoverPhoto: pro,
  };
}

/**
 * Único resolver de acceso comercial. Billing y lifecycle permanecen
 * separados: el acceso inicial conserva la excepción de demora, pero el cupo
 * Free cuenta desde el primer presupuesto. Nunca crea un PRO ficticio.
 */
export function resolveProfessionalAccess(
  p: PlanFields,
  options: { firstSuccessTrialEnabled?: boolean } = {},
  now = new Date(),
): AccessResolution {
  const source = planSource(p, now);
  const billingPlan = effectivePlan(p, now);
  const lifecycle: CommercialLifecycle = p.firstSuccessAt ? 'POST_FIRST_SUCCESS' : 'PRE_FIRST_SUCCESS';
  const trialActive = !source && !!options.firstSuccessTrialEnabled && lifecycle === 'PRE_FIRST_SUCCESS';
  const entitlementSource: EntitlementSource = source
    ? source === 'BONUS'
      ? 'BONUS_PRO'
      : source === 'BILLING'
        ? 'MERCADO_PAGO_PRO'
        : source === 'TRANSFER'
          ? 'TRANSFER_PRO'
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
    entitlements: entitlementsFor(billingPlan),
  };
}

/**
 * Única fuente de entitlements de un profesional (PRO manual + billing + bonus).
 * Todo el backend pregunta por esto; el frontend recibe el resultado.
 */
export function resolveProfessionalEntitlements(
  p: PlanFields,
  now = new Date(),
  options: { firstSuccessTrialEnabled?: boolean } = {},
): Entitlements {
  return resolveProfessionalAccess(p, options, now).entitlements;
}

/** SQL equivalente a un plan pago vigente (PRO o PRO_PLUS) para el alias `p` (professional_profiles). */
export const EFFECTIVE_PRO_SQL = `((p.plan_tier IN ('PRO', 'PRO_PLUS') AND (p.plan_expires_at IS NULL OR p.plan_expires_at > now())) OR p.billing_pro_until > now() OR p.transfer_pro_until > now() OR p.bonus_pro_until > now())`;

/** Lo que ve el propio profesional de su plan (GET /pro/me → `plan`). */
export function presentPlan(
  p: PlanFields,
  now = new Date(),
  options: { firstSuccessTrialEnabled?: boolean } = {},
) {
  const source = planSource(p, now);
  const tier = effectivePlan(p, now);
  const access = resolveProfessionalAccess(p, options, now);
  return {
    tier,
    /** MANUAL (plan:set) | BILLING (Mercado Pago) | TRANSFER (transferencia) | BONUS (referidos o prueba de PRO) | null = Free. */
    source,
    /** Vencimiento del acceso manual, por transferencia o del bonus; Mercado Pago aparte en /billing/pro/status. */
    expiresAt:
      source === 'BONUS'
        ? p.bonusProUntil
        : source === 'TRANSFER'
          ? p.transferProUntil
          : source === 'MANUAL'
            ? p.planExpiresAt
            : null,
    entitlements: access.entitlements,
    lifecycle: access.lifecycle,
    entitlementSource: access.source,
    trialActive: access.trialActive,
  };
}
