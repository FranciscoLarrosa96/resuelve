/**
 * Profesionales: espejo exacto del contrato público del backend
 * (backend/src/professionals/professional.presenter.ts → presentPublicProfessional
 * y ProfessionalsService.getPublic). Nunca incluye email, teléfono, dirección,
 * uso/vencimiento del plan ni estados internos de verificación: el backend no los expone.
 */

export interface ProfessionalServiceSummary {
  /** Declaradas por el profesional; no son rubros ni verificaciones adicionales. */
  specialties?: string[];
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

/**
 * Cómo se lo puede contactar (`contact-rules.ts` del backend). Solo dice QUÉ canales hay:
 * el número se pide al tocar el botón (POST /professionals/:id/contact).
 */
export interface ContactChannels {
  whatsapp: boolean;
  phone: boolean;
  /** Solicitudes y presupuestos por Resuelve. */
  requests: boolean;
}

export type ContactChannel = 'WHATSAPP' | 'PHONE';

/** POST /professionals/:id/contact */
export interface ContactReveal {
  channel: ContactChannel;
  /** `https://wa.me/549…?text=…` o `tel:+549…`. */
  href: string;
  /** E.164, para copiar. */
  number: string;
  /** "+54 9 249 412-3456". */
  display: string;
}

/** Puede faltar en un backend anterior: entonces solo hay solicitudes por Resuelve. */
export function contactChannelsOf(p: Pick<ProfessionalSummary, 'contactChannels' | 'acceptingRequests'>): ContactChannels {
  return p.contactChannels ?? { whatsapp: false, phone: false, requests: p.acceptingRequests !== false };
}

/** GET /professionals (cada ítem). */
export interface ProfessionalSummary {
  slug?: string;
  acceptingRequests?: boolean;
  id: string;
  firstName: string;
  lastName: string;
  displayName: string;
  avatarUrl: string | null;
  headline: string | null;
  bio: string | null;
  yearsExperience: number | null;
  /**
   * "Atiende urgencias" (nombre histórico de la API): preferencia permanente del profesional.
   * NO es "disponible ahora": el cliente igual confirma la disponibilidad con él.
   */
  availableToday: boolean;
  /** Canales de contacto habilitados. Ausente en un backend anterior (ver `contactChannelsOf`). */
  contactChannels?: ContactChannels;
  /**
   * "Suele responder en…": mediana real de sus últimas respuestas (cada presupuesto la
   * recalcula). null = pocas respuestas todavía: no se muestra nada.
   */
  averageResponseMinutes: number | null;
  /** Portada (beneficio PRO, 3:1). null/ausente = sin portada o sin PRO vigente. */
  coverUrl?: string | null;
  /** Alta del perfil profesional (ISO). Puede faltar en un backend anterior. */
  memberSince?: string | null;
  /** null = sin reseñas (nunca 0 como "sin datos"). Lo calcula el backend. */
  averageRating: number | null;
  reviewsCount: number;
  /**
   * Reseñas de clientes que el profesional invitó (QR o enlace): aparte, NUNCA en
   * `averageRating`/`reviewsCount`. Puede faltar en un backend anterior.
   */
  invitedReviewsCount?: number;
  /** Trabajos terminados por Resuelve (calculado por el backend). */
  completedJobsCount: number;
  /** Solo servicios que puede ofrecer (uno con matrícula sin aprobar no viene). */
  services: ProfessionalServiceSummary[];
  /** Ciudad principal. Ausente en un backend anterior; null = sin cobertura. */
  primaryLocality?: CoveredLocality | null;
  /** Dónde trabaja: cada localidad (la principal primero), toda la ciudad o sus barrios. */
  coverage?: CoverageEntry[];
  /** LEGACY (una ciudad): "toda la ciudad" de su ciudad principal; entonces `zones` viene vacío. */
  coversEntireCity: boolean;
  zones: ZoneSummary[];
  verifications: VerificationSummary;
  /**
   * Suscripción Resuelve PRO vigente (badge "PRO"). NO es mérito, verificación
   * ni matrícula: son señales independientes.
   */
  pro: boolean;
  /** Solo en GET /professionals: espacio destacado pago, siempre rotulado "Destacado". */
  isFeaturedPlacement?: boolean;
  /**
   * Solo en GET /professionals: portadas de hasta 3 trabajos realizados. Presentación de
   * PRO: llega vacío (o ausente) para Free.
   */
  workCovers?: { title: string; url: string }[];
}

/** Localidad pública de un profesional ("Tandil", provincia Buenos Aires). */
export interface CoveredLocality {
  id: string;
  name: string;
  slug: string;
  province: { name: string; slug: string } | null;
}

export interface CoverageEntry {
  locality: CoveredLocality;
  coversEntireCity: boolean;
  zones: ZoneSummary[];
}

/**
 * Dónde trabaja, en una línea. Con `localityId` (la ciudad que se está mirando):
 * "Todo Tandil" o "Centro, Villa Italia". Sin ella: sus localidades ("Tandil · Rauch").
 * Vacío si no hay dato. Nunca nombra una ciudad que el perfil no cubre.
 */
export function coverageText(
  p: Pick<ProfessionalSummary, 'coversEntireCity' | 'zones' | 'coverage' | 'primaryLocality'>,
  localityId?: string | null,
  /** Nombre de la ciudad que se está mirando (backend anterior sin `coverage`). */
  localityName?: string | null,
): string {
  const coverage = p.coverage ?? [];
  if (coverage.length) {
    const here = localityId ? coverage.find((c) => c.locality.id === localityId) : coverage.length === 1 ? coverage[0] : null;
    if (here) return here.coversEntireCity ? `Todo ${here.locality.name}` : here.zones.map((z) => z.name).join(', ');
    return coverage.map((c) => c.locality.name).join(' · ');
  }
  if (p.coversEntireCity) {
    const city = p.primaryLocality?.name ?? localityName;
    return city ? `Todo ${city}` : 'Toda la ciudad';
  }
  return (p.zones ?? []).map((z) => z.name).join(', ');
}

/** "Trabajos realizados": foto pública de un trabajo propio. Solo las activas se publican. */
export interface WorkPhoto {
  id: string;
  /** Entrega optimizada de Cloudinary (≤ 1600 px, q_auto, f_auto). */
  url: string;
  caption: string | null;
  /** Orden dentro del trabajo (0 = portada). */
  sortOrder: number;
  /** Presente únicamente en la respuesta privada del portfolio. */
  archivedByPlan?: boolean;
}

/**
 * Un trabajo ("Casa 1", "Departamento centro") con sus fotos. Free muestra 1
 * y PRO hasta 10, con hasta 5 fotos cada uno (`work-photo-rules.ts` del backend).
 */
export interface Work {
  pinned?: boolean;
  beforePhotoId?: string | null;
  afterPhotoId?: string | null;
  id: string;
  title: string;
  description: string | null;
  /** Mes y año: "2026-03". */
  doneOn: string;
  /** Presente únicamente en la respuesta privada (Mi perfil). */
  archivedByPlan?: boolean;
  photos: WorkPhoto[];
}

export interface RatingBucket {
  stars: number;
  count: number;
}

/** Reseña pública: solo el nombre de pila de quien la escribió (sin barrio, monto ni fecha del trabajo). */
export interface ProfessionalReview {
  id: string;
  /** Entero de 1 a 5. */
  rating: number;
  /** Texto plano (se muestra con interpolación, nunca como HTML). */
  comment: string | null;
  reviewerDisplayName: string;
  /** true = la dejó un cliente que el profesional invitó (no contrató por Resuelve). */
  invited?: boolean;
  /** ISO 8601 (se muestra como "septiembre 2026"). */
  createdAt: string;
  /** Respuesta pública del profesional (texto plano). Ausente en backends anteriores. */
  reply?: { text: string; repliedAt: string } | null;
}

/** GET /professionals/:id */
export interface ProfessionalDetail extends ProfessionalSummary {
  /** "Trabajos realizados", del más reciente al más viejo (solo con fotos). Vacío = no se muestra la sección. */
  works: Work[];
  ratingDistribution: RatingBucket[];
  /** Primera página, más recientes primero (el resto: GET /professionals/:id/reviews). */
  reviews: ProfessionalReview[];
  /** Promedio de los clientes invitados (aparte, nunca en `averageRating`). */
  invitedAverageRating?: number | null;
  invitedReviews?: ProfessionalReview[];
}

/** Motivos al reportar una reseña (el backend valida el mismo conjunto). */
export type ReviewReportReason = 'FAKE' | 'OFFENSIVE' | 'SPAM' | 'OTHER';

/** Por qué alguien no puede dejar una reseña por invitación (GET /professionals/:id/invited-review). */
export type InvitedReviewBlocker = 'OWN_PROFILE' | 'ALREADY_REVIEWED' | 'USE_JOB_REVIEW' | 'LIMIT_REACHED';

export interface InvitedReviewStatus {
  canReview: boolean;
  blocker: InvitedReviewBlocker | null;
  /** Con `USE_JOB_REVIEW`: la solicitud donde sí tiene que reseñar. */
  requestId: string | null;
  /** Su reseña, si ya la dejó. */
  review: { id: string; rating: number; comment: string | null; createdAt: string } | null;
}

/** Query params de GET /professionals (SearchProfessionalsDto). */
/** Órdenes del listado (`sort` de GET /professionals). */
export type ProfessionalSort = 'recommended' | 'rating' | 'reviews' | 'response';

export const PROFESSIONAL_SORT_OPTIONS: { value: ProfessionalSort; label: string }[] = [
  { value: 'recommended', label: 'Recomendados' },
  { value: 'rating', label: 'Mejor valorados' },
  { value: 'reviews', label: 'Más reseñas' },
  { value: 'response', label: 'Responden más rápido' },
];

export interface ProfessionalFilters {
  /** UUID (o slug) del servicio. El frontend manda siempre el UUID. */
  service?: string;
  /** UUID de la localidad (la ciudad elegida). */
  locality?: string;
  /** UUID (o slug) de la zona. */
  zone?: string;
  availableToday?: boolean;
  licenseVerified?: boolean;
  minRating?: number;
  /** Orden elegido por el cliente (default: recomendados). Ninguno mira el plan. */
  sort?: ProfessionalSort;
  /** Solo PRO vigente (vitrina del inicio). El backend rota el orden por día y no marca "Destacado". */
  pro?: boolean;
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
