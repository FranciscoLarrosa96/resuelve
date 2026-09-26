import { businessMonthStart, businessToday } from '../common/time';
import type { ProfessionalProfile } from './professional-profile.entity';
import { effectivePlan, presentPlan } from '../plans/plan';
import { PlanTier, VerificationType } from './professional.enums';
import {
  canOfferService,
  effectiveVerificationStatus,
  isValidVerification,
  licenseState,
} from './professional-rules';

/** "Disponible hoy" vence solo: vale únicamente el día en que se marcó. */
export function isAvailableToday(
  p: Pick<ProfessionalProfile, 'availableToday' | 'availableOn'>,
  today = businessToday(),
): boolean {
  return p.availableToday && p.availableOn === today;
}

/** Solo verificaciones aprobadas y vigentes; matrículas solo de servicios que sigue ofreciendo. */
function verificationSummary(p: ProfessionalProfile) {
  const now = new Date();
  const valid = (p.verifications ?? []).filter((v) => isValidVerification(v, now));
  const offered = new Set((p.services ?? []).map((s) => s.serviceId));
  const licenses = valid.filter(
    (v) => v.type === VerificationType.LICENSE && !!v.serviceId && offered.has(v.serviceId),
  );
  return {
    identity: valid.some((v) => v.type === VerificationType.IDENTITY),
    phone: valid.some((v) => v.type === VerificationType.PHONE),
    license: licenses.length > 0,
    licenses: licenses.map((v) => ({ serviceId: v.serviceId, reference: v.reference })),
  };
}

/** Rating público: sin reseñas es `null` (no 0). Se usa en todo lo que muestra un profesional a terceros. */
export function publicRating(p: Pick<ProfessionalProfile, 'averageRating' | 'reviewsCount'>): number | null {
  return p.reviewsCount > 0 ? p.averageRating : null;
}

/**
 * Perfil público (búsqueda y ficha). Nunca incluye email, teléfono, uso ni
 * vencimiento del plan: del plan solo se publica si tiene PRO vigente.
 */
export function presentPublicProfessional(p: ProfessionalProfile) {
  return {
    id: p.id,
    firstName: p.user.firstName,
    lastName: p.user.lastName,
    displayName: `${p.user.firstName} ${p.user.lastName}`,
    avatarUrl: p.user.avatarUrl,
    headline: p.headline,
    bio: p.bio,
    yearsExperience: p.yearsExperience,
    availableToday: isAvailableToday(p),
    averageResponseMinutes: p.averageResponseMinutes,
    // Sin reseñas no hay rating: null (no 0). Lo calcula recalculateProfessionalMetrics.
    averageRating: publicRating(p),
    reviewsCount: p.reviewsCount,
    completedJobsCount: p.completedJobsCount,
    // Solo los servicios que puede ofrecer: uno con matrícula pendiente no se publica.
    services: (p.services ?? [])
      .filter((s) => s.service?.active && canOfferService(p, s.service))
      .map((s) => ({ id: s.service.id, name: s.service.name, slug: s.service.slug })),
    /** true = trabaja en cualquier barrio activo de la ciudad (entonces `zones` va vacío). */
    coversEntireCity: p.coversEntireCity,
    zones: p.coversEntireCity ? [] : activeZones(p),
    verifications: verificationSummary(p),
    /**
     * Suscripción Resuelve PRO vigente (badge "PRO"). No es mérito, ni
     * verificación, ni matrícula: esas señales son independientes.
     */
    pro: effectivePlan(p) === PlanTier.PRO,
  };
}

function activeZones(p: ProfessionalProfile) {
  return (p.serviceAreas ?? [])
    .filter((a) => a.zone?.active)
    .sort((a, b) => a.zone.sortOrder - b.zone.sortOrder)
    .map((a) => ({ id: a.zone.id, name: a.zone.name, slug: a.zone.slug }));
}

/**
 * Lo que ve el propio profesional en /pro/me: lo público + estado del perfil,
 * todos sus servicios con el estado de matrícula, las zonas guardadas (aunque
 * cubra toda la ciudad), plan con entitlements, uso y sus verificaciones. Nunca: documento,
 * revisor ni URLs.
 */
export function presentOwnProfessional(p: ProfessionalProfile, freeMonthlyLimit: number | null) {
  const now = new Date();
  const plan = presentPlan(p, now);
  return {
    ...presentPublicProfessional(p),
    status: p.status,
    offeredServices: (p.services ?? [])
      .filter((s) => s.service)
      .sort((a, b) => a.service.sortOrder - b.service.sortOrder)
      .map((s) => ({
        id: s.service.id,
        name: s.service.name,
        slug: s.service.slug,
        requiresLicense: s.service.requiresLicense,
        licenseStatus: licenseState(p.verifications, s.service, now),
        /** false = no aparece en búsquedas de este servicio (matrícula sin aprobar o servicio dado de baja). */
        public: s.service.active && canOfferService(p, s.service, now),
      })),
    savedZones: activeZones(p),
    /** Plan EFECTIVO (un PRO vencido ya es FREE). */
    planTier: plan.tier,
    plan,
    // El contador se reinicia al cambiar de mes (se persiste al próximo presupuesto).
    monthlyRequestUsage: p.usagePeriodStart === businessMonthStart() ? p.monthlyRequestUsage : 0,
    /** null = sin tope (default mientras se observa el uso real). */
    monthlyRequestLimit: plan.tier === PlanTier.FREE ? freeMonthlyLimit : null,
    verificationRequests: [...(p.verifications ?? [])]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((v) => ({
        id: v.id,
        type: v.type,
        status: effectiveVerificationStatus(v, now),
        serviceId: v.serviceId,
        reference: v.reference,
        submittedAt: v.createdAt,
        reviewedAt: v.reviewedAt,
        expiresAt: v.expiresAt,
        rejectionReason: v.rejectionReason,
        hasDocument: !!v.documentPublicId && !v.documentDeletedAt,
      })),
  };
}
