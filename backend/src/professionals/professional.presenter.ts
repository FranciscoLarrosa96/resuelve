import { businessMonthStart, businessToday } from '../common/time';
import type { ProfessionalProfile } from './professional-profile.entity';
import { VerificationStatus, VerificationType } from './professional.enums';

/** "Disponible hoy" vence solo: vale únicamente el día en que se marcó. */
export function isAvailableToday(
  p: Pick<ProfessionalProfile, 'availableToday' | 'availableOn'>,
  today = businessToday(),
): boolean {
  return p.availableToday && p.availableOn === today;
}

function verificationSummary(p: ProfessionalProfile) {
  const now = new Date();
  const valid = (p.verifications ?? []).filter(
    (v) => v.status === VerificationStatus.VERIFIED && (!v.expiresAt || v.expiresAt > now),
  );
  const licenses = valid.filter((v) => v.type === VerificationType.LICENSE);
  return {
    identity: valid.some((v) => v.type === VerificationType.IDENTITY),
    phone: valid.some((v) => v.type === VerificationType.PHONE),
    license: licenses.length > 0,
    licenses: licenses.map((v) => ({ serviceId: v.serviceId, reference: v.reference })),
  };
}

/**
 * Perfil público (búsqueda y ficha). Nunca incluye email, teléfono ni datos
 * del plan: eso es privado del profesional.
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
    averageRating: p.reviewsCount > 0 ? p.averageRating : null,
    reviewsCount: p.reviewsCount,
    completedJobsCount: p.completedJobsCount,
    services: (p.services ?? [])
      .filter((s) => s.service)
      .map((s) => ({ id: s.service.id, name: s.service.name, slug: s.service.slug })),
    zones: (p.serviceAreas ?? [])
      .filter((a) => a.zone)
      .map((a) => ({ id: a.zone.id, name: a.zone.name, slug: a.zone.slug })),
    verifications: verificationSummary(p),
  };
}

/** Lo que ve el propio profesional en /pro/me: lo público + plan, uso y estado de verificaciones. */
export function presentOwnProfessional(p: ProfessionalProfile, freeMonthlyLimit: number) {
  return {
    ...presentPublicProfessional(p),
    planTier: p.planTier,
    // El contador se reinicia al cambiar de mes (se persiste al próximo presupuesto).
    monthlyRequestUsage: p.usagePeriodStart === businessMonthStart() ? p.monthlyRequestUsage : 0,
    monthlyRequestLimit: p.planTier === 'FREE' ? freeMonthlyLimit : null,
    verificationRequests: (p.verifications ?? []).map((v) => ({
      id: v.id,
      type: v.type,
      status: v.status,
      serviceId: v.serviceId,
      reference: v.reference,
      reviewedAt: v.reviewedAt,
    })),
  };
}
