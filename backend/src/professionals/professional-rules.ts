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
 * - `requestIneligibility` decide si puede recibir (invitación) o responder
 *   (presupuesto) una solicitud concreta. La búsqueda aplica el mismo criterio
 *   en SQL (`OFFERS_PUBLICLY_SQL` + cobertura en professionals.service).
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

// ---- Elegibilidad para una solicitud ----------------------------------------

/** Lo que hace falta del perfil para decidir la elegibilidad (ya con sus relaciones). */
export interface EligibilityProfile extends Pick<ProfessionalProfile, 'status' | 'coversEntireCity' | 'verifications'> {
  /** Servicios que ofrece (professional_services). */
  serviceIds: readonly string[];
  /** Barrios guardados (professional_service_areas). Se ignoran con `coversEntireCity`. */
  zoneIds: readonly string[];
}

/**
 * Motivo por el que no puede recibir una solicitud. Una matrícula faltante,
 * pendiente o vencida cuenta como "no ofrece el servicio": es lo mismo que ve
 * el público y no revela el estado interno de la verificación.
 */
export type IneligibilityReason = 'PROFILE_PAUSED' | 'SERVICE_NOT_OFFERED' | 'ZONE_NOT_COVERED';

/** "Todo Tandil" cubre cualquier barrio; si no, tiene que tenerlo guardado. */
export function coversZone(profile: Pick<EligibilityProfile, 'coversEntireCity' | 'zoneIds'>, zoneId: string): boolean {
  return profile.coversEntireCity || profile.zoneIds.includes(zoneId);
}

/**
 * canReceiveRequest: perfil activo, ofrece el servicio (con matrícula aprobada
 * y vigente si el servicio la requiere) y cubre el barrio. Devuelve el primer
 * motivo que falla, o null si es elegible.
 *
 * `checkCoverage: false` se usa al presupuestar: la cobertura se evalúa al
 * invitar; si después el profesional cambia sus barrios, la invitación que ya
 * recibió sigue valiendo (no se invalida trabajo en curso).
 */
export function requestIneligibility(
  profile: EligibilityProfile,
  target: { service: { id: string; requiresLicense: boolean }; zoneId: string },
  opts: { checkCoverage?: boolean; now?: Date } = {},
): IneligibilityReason | null {
  if (!isPublicProfile(profile)) return 'PROFILE_PAUSED';
  if (!profile.serviceIds.includes(target.service.id) || !canOfferService(profile, target.service, opts.now)) {
    return 'SERVICE_NOT_OFFERED';
  }
  if ((opts.checkCoverage ?? true) && !coversZone(profile, target.zoneId)) return 'ZONE_NOT_COVERED';
  return null;
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
