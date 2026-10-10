import type { ProfessionalProfile } from './professional-profile.entity';
import type { ProfessionalVerification } from './professional-verification.entity';
import { ProfessionalStatus, VerificationStatus, VerificationType } from './professional.enums';

/**
 * Reglas del núcleo profesional. Son la ÚNICA fuente: las usan el presenter
 * (qué es público), la búsqueda (SQL equivalente) y las invitaciones.
 *
 * - La matrícula NO restringe: todo servicio activo que el profesional ofrece
 *   se publica. En un servicio con `requiresLicense`, una matrícula LICENSE en
 *   VERIFIED y sin vencer solo suma el sello "Matrícula verificada" (y el
 *   filtro `licenseVerified`).
 * - PAUSED no aparece en búsquedas, ficha pública ni invitaciones nuevas.
 * - `requestIneligibility` decide si puede recibir (invitación) o responder
 *   (presupuesto) una solicitud concreta. La búsqueda aplica el mismo criterio
 *   en SQL (servicio activo + cobertura en professionals.service).
 */

/**
 * "Tomo urgencias": el profesional lo prende y vale `URGENT_AVAILABILITY_HOURS`
 * desde ese momento (a cualquier hora: una urgencia puede ser de noche). Vence
 * solo, sin cron; prenderlo de nuevo lo extiende desde ahora. En la API sigue
 * llamándose `availableToday` (nombre histórico).
 */
export const URGENT_AVAILABILITY_HOURS = 12;

export function urgentAvailabilityUntil(now = new Date()): Date {
  return new Date(now.getTime() + URGENT_AVAILABILITY_HOURS * 3600_000);
}

export function isTakingUrgencies(p: Pick<ProfessionalProfile, 'availableUntil'>, now = new Date()): boolean {
  return !!p.availableUntil && p.availableUntil.getTime() > now.getTime();
}

/** Mismo criterio que `isTakingUrgencies`, en SQL (alias `p` = professional_profiles). */
export const TAKING_URGENCIES_SQL = '(p.available_until IS NOT NULL AND p.available_until > now())';

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

export function isPublicProfile(profile: Pick<ProfessionalProfile, 'status'>): boolean {
  return profile.status === ProfessionalStatus.ACTIVE;
}

// ---- Elegibilidad para una solicitud ----------------------------------------

/** Lo que hace falta del perfil para decidir la elegibilidad (ya con sus relaciones). */
export interface EligibilityProfile extends Pick<ProfessionalProfile, 'status' | 'coversEntireCity'> {
  /** Servicios que ofrece (professional_services). */
  serviceIds: readonly string[];
  /** Barrios guardados (professional_service_areas). Se ignoran con `coversEntireCity`. */
  zoneIds: readonly string[];
}

/** Motivo por el que no puede recibir una solicitud. La matrícula no es un motivo. */
export type IneligibilityReason = 'PROFILE_PAUSED' | 'SERVICE_NOT_OFFERED' | 'ZONE_NOT_COVERED';

/** "Todo Tandil" cubre cualquier barrio; si no, tiene que tenerlo guardado. */
export function coversZone(profile: Pick<EligibilityProfile, 'coversEntireCity' | 'zoneIds'>, zoneId: string): boolean {
  return profile.coversEntireCity || profile.zoneIds.includes(zoneId);
}

/**
 * canReceiveRequest: perfil activo, ofrece el servicio y cubre el barrio. Devuelve el primer
 * motivo que falla, o null si es elegible.
 *
 * `checkCoverage: false` se usa al presupuestar: la cobertura se evalúa al
 * invitar; si después el profesional cambia sus barrios, la invitación que ya
 * recibió sigue valiendo (no se invalida trabajo en curso).
 */
export function requestIneligibility(
  profile: EligibilityProfile,
  target: { service: { id: string }; zoneId: string },
  opts: { checkCoverage?: boolean } = {},
): IneligibilityReason | null {
  if (!isPublicProfile(profile)) return 'PROFILE_PAUSED';
  if (!profile.serviceIds.includes(target.service.id)) return 'SERVICE_NOT_OFFERED';
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

/** Matrícula vigente para el servicio `serviceExpr` del profesional `p` (sello y filtro, no restringe). */
export const VALID_LICENSE_SQL = (serviceExpr: string) => `EXISTS (
  SELECT 1 FROM professional_verifications v
   WHERE v.professional_id = p.id AND v.type = 'LICENSE' AND v.service_id = ${serviceExpr}
     AND v.status = 'VERIFIED' AND (v.expires_at IS NULL OR v.expires_at > now()))`;

// ---- Espacios destacados (PRO) ---------------------------------------------

/**
 * Por qué un perfil NO puede ocupar un espacio "Destacado" (resultados y
 * vitrina del inicio). PRO no alcanza: tiene que cumplir las mismas reglas
 * públicas que el resto — perfil activo, al menos un servicio activo y cobertura.
 * La búsqueda aplica lo mismo en SQL (`FEATURED_ELIGIBLE_SQL`).
 */
export type FeaturedIneligibility = 'NOT_PRO' | 'PROFILE_PAUSED' | 'NO_PUBLIC_SERVICE' | 'NO_COVERAGE';

export function featuredIneligibility(
  profile: Pick<ProfessionalProfile, 'status' | 'coversEntireCity'> & {
    services?: { service?: { active: boolean } | null }[];
    serviceAreas?: { zone?: { active: boolean } | null }[];
  },
  canBeFeatured: boolean,
): FeaturedIneligibility | null {
  if (!canBeFeatured) return 'NOT_PRO';
  if (!isPublicProfile(profile)) return 'PROFILE_PAUSED';
  if (!(profile.services ?? []).some((s) => !!s.service?.active)) return 'NO_PUBLIC_SERVICE';
  if (!profile.coversEntireCity && !(profile.serviceAreas ?? []).some((a) => a.zone?.active)) return 'NO_COVERAGE';
  return null;
}

/** SQL equivalente a `featuredIneligibility(p, true) === null` (sin el plan) para el alias `p`. */
export const FEATURED_ELIGIBLE_SQL = `(p.status = 'ACTIVE'
  AND EXISTS (SELECT 1 FROM professional_services fps JOIN services s ON s.id = fps.service_id
               WHERE fps.professional_id = p.id AND s.active)
  AND (p.covers_entire_city OR EXISTS (
        SELECT 1 FROM professional_service_areas fpsa JOIN zones fz ON fz.id = fpsa.zone_id
         WHERE fpsa.professional_id = p.id AND fz.active)))`;
