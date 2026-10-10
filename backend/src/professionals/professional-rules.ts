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
 *   en SQL (servicio activo + `COVERS_LOCALITY_SQL`).
 * - Cobertura: primero la LOCALIDAD del trabajo, después el barrio (`coverageGap`).
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

// ---- Cobertura y elegibilidad para una solicitud ----------------------------

/** Localidades que puede cubrir un perfil (un solo perfil, plan y reputación para todas). */
export const MAX_COVERAGE_LOCALITIES = 20;

/** Una localidad que cubre: toda la ciudad o solo los barrios guardados de esa ciudad. */
export interface CoveredLocality {
  cityId: string;
  coversEntireCity: boolean;
}

/** Lo que hace falta del perfil para decidir la elegibilidad (ya con sus relaciones). */
export interface EligibilityProfile extends Pick<ProfessionalProfile, 'status'> {
  /** Servicios que ofrece (professional_services). */
  serviceIds: readonly string[];
  /** Localidades que cubre (professional_localities). */
  localities: readonly CoveredLocality[];
  /** Barrios guardados (professional_service_areas); cuentan solo en localidades sin "toda la ciudad". */
  zoneIds: readonly string[];
}

/** Dónde es el trabajo: la localidad siempre; el barrio, si la localidad tiene barrios. */
export interface WorkLocation {
  cityId: string;
  zoneId: string | null;
}

/** Motivo por el que no puede recibir una solicitud. La matrícula no es un motivo. */
export type IneligibilityReason = 'PROFILE_PAUSED' | 'SERVICE_NOT_OFFERED' | 'LOCALITY_NOT_COVERED' | 'ZONE_NOT_COVERED';

/**
 * Primero la localidad, después el barrio: cubre la localidad del trabajo y,
 * en ella, toda la ciudad o ese barrio. Sin barrio (localidad sin barrios
 * cargados) solo alcanza "toda la ciudad". El barrio de una solicitud siempre
 * es de su localidad (FK compuesta), así que un barrio guardado de otra ciudad
 * nunca cubre.
 */
export function coverageGap(
  profile: Pick<EligibilityProfile, 'localities' | 'zoneIds'>,
  where: WorkLocation,
): 'LOCALITY_NOT_COVERED' | 'ZONE_NOT_COVERED' | null {
  const locality = profile.localities.find((l) => l.cityId === where.cityId);
  if (!locality) return 'LOCALITY_NOT_COVERED';
  if (locality.coversEntireCity) return null;
  return where.zoneId && profile.zoneIds.includes(where.zoneId) ? null : 'ZONE_NOT_COVERED';
}

export function coversLocation(profile: Pick<EligibilityProfile, 'localities' | 'zoneIds'>, where: WorkLocation): boolean {
  return coverageGap(profile, where) === null;
}

/**
 * canReceiveRequest: perfil activo, ofrece el servicio y cubre la localidad (y el
 * barrio). Devuelve el primer motivo que falla, o null si es elegible.
 *
 * `checkCoverage: false` se usa al presupuestar: la cobertura se evalúa al
 * invitar; si después el profesional cambia su cobertura, la invitación que ya
 * recibió sigue valiendo (no se invalida trabajo en curso).
 */
export function requestIneligibility(
  profile: EligibilityProfile,
  target: { service: { id: string } } & WorkLocation,
  opts: { checkCoverage?: boolean } = {},
): IneligibilityReason | null {
  if (!isPublicProfile(profile)) return 'PROFILE_PAUSED';
  if (!profile.serviceIds.includes(target.service.id)) return 'SERVICE_NOT_OFFERED';
  if (opts.checkCoverage ?? true) return coverageGap(profile, target);
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

/**
 * Cubre ALGUNA localidad activa (toda la ciudad, o un barrio activo de una ciudad que
 * cubre). Alias `p` = professional_profiles. Lo usan destacados, sitemap y el embudo.
 */
export const HAS_COVERAGE_SQL = `EXISTS (
  SELECT 1 FROM professional_localities cpl JOIN cities cc ON cc.id = cpl.city_id AND cc.active
   WHERE cpl.professional_id = p.id
     AND (cpl.covers_entire_city OR EXISTS (
           SELECT 1 FROM professional_service_areas cpsa JOIN zones cz ON cz.id = cpsa.zone_id
            WHERE cpsa.professional_id = p.id AND cz.city_id = cpl.city_id AND cz.active)))`;

/**
 * SQL equivalente a `coversLocation` para el alias `p`. `cityParam` es el
 * parámetro de la localidad; `zoneParam`, el del barrio (null = cualquiera de sus
 * barrios activos: "trabaja en esta ciudad").
 */
export const COVERS_LOCALITY_SQL = (cityParam: string, zoneParam: string | null) => `EXISTS (
  SELECT 1 FROM professional_localities lpl
   WHERE lpl.professional_id = p.id AND lpl.city_id = ${cityParam}
     AND (lpl.covers_entire_city OR EXISTS (
           SELECT 1 FROM professional_service_areas lpsa JOIN zones lz ON lz.id = lpsa.zone_id
            WHERE lpsa.professional_id = p.id AND lz.city_id = lpl.city_id AND lz.active
              ${zoneParam ? `AND lz.id = ${zoneParam}` : ''})))`;

// ---- Espacios destacados (PRO) ---------------------------------------------

/**
 * Por qué un perfil NO puede ocupar un espacio "Destacado" (resultados y
 * vitrina del inicio). PRO no alcanza: tiene que cumplir las mismas reglas
 * públicas que el resto — perfil activo, al menos un servicio activo y cobertura.
 * La búsqueda aplica lo mismo en SQL (`FEATURED_ELIGIBLE_SQL`), y además solo
 * destaca dentro de la localidad buscada (nunca un PRO de otra ciudad).
 */
export type FeaturedIneligibility = 'NOT_PRO' | 'PROFILE_PAUSED' | 'NO_PUBLIC_SERVICE' | 'NO_COVERAGE';

/** ¿Cubre alguna localidad activa? (mismo criterio que `HAS_COVERAGE_SQL`). */
export function hasCoverage(profile: {
  localities?: { cityId: string; coversEntireCity: boolean; city?: { active: boolean } | null }[];
  serviceAreas?: { zone?: { active: boolean; cityId: string } | null }[];
}): boolean {
  return (profile.localities ?? []).some(
    (l) =>
      l.city?.active !== false &&
      (l.coversEntireCity || (profile.serviceAreas ?? []).some((a) => a.zone?.active && a.zone.cityId === l.cityId)),
  );
}

export function featuredIneligibility(
  profile: Pick<ProfessionalProfile, 'status'> & {
    services?: { service?: { active: boolean } | null }[];
    localities?: { cityId: string; coversEntireCity: boolean; city?: { active: boolean } | null }[];
    serviceAreas?: { zone?: { active: boolean; cityId: string } | null }[];
  },
  canBeFeatured: boolean,
): FeaturedIneligibility | null {
  if (!canBeFeatured) return 'NOT_PRO';
  if (!isPublicProfile(profile)) return 'PROFILE_PAUSED';
  if (!(profile.services ?? []).some((s) => !!s.service?.active)) return 'NO_PUBLIC_SERVICE';
  if (!hasCoverage(profile)) return 'NO_COVERAGE';
  return null;
}

/** SQL equivalente a `featuredIneligibility(p, true) === null` (sin el plan) para el alias `p`. */
export const FEATURED_ELIGIBLE_SQL = `(p.status = 'ACTIVE'
  AND EXISTS (SELECT 1 FROM professional_services fps JOIN services s ON s.id = fps.service_id
               WHERE fps.professional_id = p.id AND s.active)
  AND ${HAS_COVERAGE_SQL})`;
