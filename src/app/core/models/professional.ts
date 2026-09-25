/**
 * Profesionales: espejo exacto del contrato público del backend
 * (backend/src/professionals/professional.presenter.ts → presentPublicProfessional
 * y ProfessionalsService.getPublic). Nunca incluye email, teléfono, dirección,
 * plan ni estados internos de verificación: el backend no los expone.
 */

export interface ProfessionalServiceSummary {
  id: string;
  name: string;
  slug: string;
}

export interface ZoneSummary {
  id: string;
  name: string;
  slug: string;
}

/** Matrícula verificada (solo VERIFIED y vigentes). `reference` es el N.º público. */
export interface PublicLicense {
  serviceId: string | null;
  reference: string | null;
}

/** Resumen público de verificaciones: solo aprobadas y vigentes. */
export interface VerificationSummary {
  identity: boolean;
  phone: boolean;
  license: boolean;
  licenses: PublicLicense[];
}

/** GET /professionals (cada ítem). */
export interface ProfessionalSummary {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string;
  avatarUrl: string | null;
  headline: string | null;
  bio: string | null;
  yearsExperience: number;
  /** "Disponible hoy": lo marca el profesional y vence solo a medianoche. */
  availableToday: boolean;
  /** Existe en el contrato, pero hoy ningún proceso lo calcula: la UI no lo muestra. */
  averageResponseMinutes: number | null;
  /** null = sin reseñas (nunca 0 como "sin datos"). Lo calcula el backend. */
  averageRating: number | null;
  reviewsCount: number;
  /** Trabajos terminados por Resuelve (calculado por el backend). */
  completedJobsCount: number;
  services: ProfessionalServiceSummary[];
  zones: ZoneSummary[];
  verifications: VerificationSummary;
}

export interface PortfolioItem {
  id: string;
  title: string;
  imageUrl: string;
  zone: string | null;
  /** Foto de un trabajo pedido por Resuelve. */
  verifiedWork: boolean;
}

export interface RatingBucket {
  stars: number;
  count: number;
}

export interface ProfessionalReview {
  id: string;
  rating: number;
  comment: string | null;
  verifiedWork: boolean;
  /** "María G.": el backend ya abrevia el apellido. */
  author: string;
  zone: string | null;
  service: string | null;
  /** ISO 8601. */
  createdAt: string;
}

/** GET /professionals/:id */
export interface ProfessionalDetail extends ProfessionalSummary {
  portfolio: PortfolioItem[];
  ratingDistribution: RatingBucket[];
  /** Las 10 más recientes. */
  reviews: ProfessionalReview[];
}

/** Query params de GET /professionals (SearchProfessionalsDto). */
export interface ProfessionalFilters {
  /** UUID (o slug) del servicio. El frontend manda siempre el UUID. */
  service?: string;
  /** UUID (o slug) de la zona. */
  zone?: string;
  availableToday?: boolean;
  licenseVerified?: boolean;
  minRating?: number;
  page?: number;
  /** 1–50 (default del backend: 20). */
  pageSize?: number;
}

/**
 * Referencia mínima a un profesional real dentro de un pedido (destinatarios).
 * El id es el UUID del backend: lo va a necesitar la vertical de solicitudes.
 */
export interface ProfessionalRef {
  id: string;
  displayName: string;
  firstName: string;
  avatarUrl: string | null;
}

export function toProfessionalRef(p: Pick<ProfessionalSummary, 'id' | 'displayName' | 'firstName' | 'avatarUrl'>): ProfessionalRef {
  return { id: p.id, displayName: p.displayName, firstName: p.firstName, avatarUrl: p.avatarUrl };
}

/** ¿Tiene matrícula verificada para este servicio? (no alcanza con que el servicio la requiera). */
export function hasLicenseFor(p: ProfessionalSummary, serviceId: string | null | undefined): boolean {
  if (!p.verifications.license) return false;
  if (!serviceId) return true;
  return p.verifications.licenses.some((l) => l.serviceId === serviceId);
}
