import type { ProfessionalProfile } from './professional-profile.entity';
import type { ProfessionalVerification } from './professional-verification.entity';
import { ProfessionalStatus, VerificationStatus, VerificationType } from './professional.enums';

/**
 * Reglas del núcleo profesional. Son la ÚNICA fuente: las usan el presenter
 * (qué es público), la búsqueda (SQL equivalente) y las invitaciones.
 *
 * - Un servicio con `requiresLicense` solo se ofrece públicamente con una
 *   matrícula LICENSE de ese servicio en VERIFIED y sin vencer.
 * - El perfil puede ser público aunque tenga matrículas pendientes: aparece
 *   por sus otros servicios.
 * - PAUSED no aparece en búsquedas, ficha pública ni invitaciones nuevas.
 */

/** Estado que ve el profesional: VERIFIED con vencimiento pasado ya es EXPIRED. */
export function effectiveVerificationStatus(
  v: Pick<ProfessionalVerification, 'status' | 'expiresAt'>,
  now = new Date(),
): VerificationStatus {
  if (v.status === VerificationStatus.VERIFIED && v.expiresAt && v.expiresAt <= now) {
    return VerificationStatus.EXPIRED;
  }
  return v.status;
}

export function isValidVerification(v: Pick<ProfessionalVerification, 'status' | 'expiresAt'>, now = new Date()): boolean {
  return effectiveVerificationStatus(v, now) === VerificationStatus.VERIFIED;
}

/** Matrícula vigente y aprobada para ese servicio. */
export function hasValidLicense(
  verifications: ProfessionalVerification[] | undefined,
  serviceId: string,
  now = new Date(),
): boolean {
  return (verifications ?? []).some(
    (v) => v.type === VerificationType.LICENSE && v.serviceId === serviceId && isValidVerification(v, now),
  );
}

/** ¿Puede ofrecer públicamente este servicio? */
export function canOfferService(
  profile: Pick<ProfessionalProfile, 'verifications'>,
  service: { id: string; requiresLicense: boolean },
  now = new Date(),
): boolean {
  return !service.requiresLicense || hasValidLicense(profile.verifications, service.id, now);
}

export function isPublicProfile(profile: Pick<ProfessionalProfile, 'status'>): boolean {
  return profile.status === ProfessionalStatus.ACTIVE;
}

/** Estado de matrícula de un servicio ofrecido, para el propio profesional. */
export type LicenseState = 'NOT_REQUIRED' | 'NOT_SUBMITTED' | VerificationStatus;

/** La verificación más reciente de ese servicio (las anteriores son historial). */
export function latestLicense(
  verifications: ProfessionalVerification[] | undefined,
  serviceId: string,
): ProfessionalVerification | undefined {
  return (verifications ?? [])
    .filter((v) => v.type === VerificationType.LICENSE && v.serviceId === serviceId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
}

export function licenseState(
  verifications: ProfessionalVerification[] | undefined,
  service: { id: string; requiresLicense: boolean },
  now = new Date(),
): LicenseState {
  if (!service.requiresLicense) return 'NOT_REQUIRED';
  if (hasValidLicense(verifications, service.id, now)) return VerificationStatus.VERIFIED;
  const latest = latestLicense(verifications, service.id);
  return latest ? effectiveVerificationStatus(latest, now) : 'NOT_SUBMITTED';
}

// ---- SQL equivalente (búsqueda) ---------------------------------------------

/** Matrícula vigente para el servicio `serviceExpr` del profesional `p`. */
export const VALID_LICENSE_SQL = (serviceExpr: string) => `EXISTS (
  SELECT 1 FROM professional_verifications v
   WHERE v.professional_id = p.id AND v.type = 'LICENSE' AND v.service_id = ${serviceExpr}
     AND v.status = 'VERIFIED' AND (v.expires_at IS NULL OR v.expires_at > now()))`;

/** El servicio `s` (fila de services) lo puede ofrecer públicamente `p`. */
export const OFFERS_PUBLICLY_SQL = `(NOT s.requires_license OR ${VALID_LICENSE_SQL('s.id')})`;
