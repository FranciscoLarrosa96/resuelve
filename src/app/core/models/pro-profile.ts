import { OwnPlan, QuoteUsage } from './pro-analytics';
import { CoverageEntry, ProfessionalSummary, ZoneSummary } from './professional';

/**
 * Perfil propio del profesional (GET /pro/me → presentOwnProfessional).
 * Es lo público + lo que solo ve él. Nunca trae documento, revisor ni URLs.
 */

/** ACTIVE = visible en búsquedas · PAUSED = oculto (no borra historial). */
export type ProfessionalStatus = 'ACTIVE' | 'PAUSED';

/** Estado persistido; "sin enviar" es la ausencia de envío. */
export type VerificationStatus = 'PENDING' | 'VERIFIED' | 'REJECTED' | 'EXPIRED';

/** Matrícula de un servicio ofrecido, vista por el propio profesional. */
export type LicenseStatus = 'NOT_REQUIRED' | 'NOT_SUBMITTED' | VerificationStatus;

export interface OfferedService {
  id: string;
  name: string;
  slug: string;
  requiresLicense: boolean;
  licenseStatus: LicenseStatus;
  /** false = no aparece en búsquedas de este servicio (matrícula sin aprobar). */
  public: boolean;
}

export interface OwnVerification {
  id: string;
  type: 'IDENTITY' | 'PHONE' | 'LICENSE';
  status: VerificationStatus;
  serviceId: string | null;
  reference: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  expiresAt: string | null;
  /** Motivo legible cuando se rechaza. */
  rejectionReason: string | null;
  hasDocument: boolean;
}

/** Festejo de un premio por invitación (`/pro/me` → `referralCelebration`). */
export interface ReferralCelebration {
  rewardId: string;
  /** REFERRER = alguien usó tu enlace; REFERRED = te sumaste con el enlace de alguien. */
  role: 'REFERRER' | 'REFERRED';
  /** Nombre de pila del amigo. */
  friendName: string;
  days: number;
  accessUntil: string;
  /** Solo REFERRER: cuántos amigos más le suman días. */
  rewardsLeft: number | null;
}

export interface OwnProfessional extends ProfessionalSummary {
  status: ProfessionalStatus;
  /** Hasta cuándo toma urgencias ("Tomo urgencias", 12 h desde que lo prendió); null = no las toma. */
  availableUntil?: string | null;
  offeredServices: OfferedService[];
  /** Barrios guardados de la ciudad principal aunque cubra toda la ciudad (legacy). */
  savedZones: ZoneSummary[];
  /** Toda la cobertura con los barrios guardados (aunque cubra toda la ciudad), para editarla. */
  savedCoverage?: CoverageEntry[];
  /** Plan efectivo (igual a `plan.tier`). */
  planTier: 'FREE' | 'PRO';
  plan: OwnPlan;
  firstSuccessAt?: string | null;
  /** true hasta elegir "Continuar con PRO" o "Seguir con Free". */
  showFirstSuccessCelebration?: boolean;
  /** Premio de referidos todavía sin festejar: el panel lo muestra una vez. */
  referralCelebration?: ReferralCelebration | null;
  /** Oportunidades Free distintas respondidas desde el fin del trial. limit null = sin límite. */
  quoteUsage: QuoteUsage;
  /** Más reciente primero; los rechazos viejos quedan como historial. */
  verificationRequests: OwnVerification[];
  /**
   * ¿Puede ocupar espacios "Destacado"? Lo decide el backend con las mismas
   * reglas públicas (plan + perfil activo + servicio público + cobertura).
   * Elegible no significa que aparezca: depende de cada búsqueda.
   */
  featured: { eligible: boolean; reason: FeaturedIneligibility | null };
  /** Cuándo pidió PRO desde la app ("Quiero PRO"); null = nunca. No cambia el plan. */
  proInterestAt: string | null;
  /**
   * Oferta de bienvenida de PRO, decidida por el backend (plan, uso Free histórico,
   * historial, una sola vez). La UI solo elige cuándo mostrarla; los montos
   * vienen calculados. Opcional: respuestas previas a la oferta no la traen.
   */
  proIntroOffer?: ProIntroOffer;
}

export type ProIntroOffer = EligibleIntroOffer | { eligible: false; reason: string };

export interface EligibleIntroOffer {
  eligible: true;
  /** Código estable (`PRO_FIRST_MONTH_20`): lo único que la UI manda de vuelta. */
  offerCode: string;
  discountPercent: number;
  /** Meses con descuento; después, precio base. */
  appliesToCycles: number;
  basePriceArs: number;
  discountedPriceArs: number;
  /** La reservó al pedir PRO (sigue vigente al agotar el cupo total). */
  reserved: boolean;
}

/** Dónde se mostró la oferta (embudo `POST /pro/plan/offer-events`). */
export type OfferSurface = 'REQUESTS_USAGE' | 'LIMIT_MODAL' | 'PLAN_PAGE';

export type FeaturedIneligibility = 'NOT_PRO' | 'PROFILE_PAUSED' | 'NO_PUBLIC_SERVICE' | 'NO_COVERAGE';


/** Una localidad de la cobertura al crear o editar el perfil. */
export interface CoverageInput {
  localityId: string;
  /** Obligatorio si la localidad no tiene barrios cargados. */
  coversEntireCity: boolean;
  zoneIds?: string[];
}

export interface CreateProfessionalProfile {
  headline: string;
  bio?: string;
  yearsExperience: number;
  serviceIds: string[];
  /** Ciudad principal (una de `coverage`). */
  primaryLocalityId?: string;
  /** Localidades donde trabaja (reemplaza toda la cobertura). */
  coverage?: CoverageInput[];
  /** LEGACY (una ciudad). */
  coversEntireCity?: boolean;
  zoneIds?: string[];
  availableToday?: boolean;
}

/** PATCH /pro/profile: solo campos editables (métricas, plan y estado no). */
export interface UpdateProfessionalProfile {
  headline?: string;
  bio?: string;
  yearsExperience?: number;
  serviceIds?: string[];
  primaryLocalityId?: string;
  coverage?: CoverageInput[];
  /** LEGACY (una ciudad). */
  coversEntireCity?: boolean;
  zoneIds?: string[];
}

/** POST /pro/verifications/upload: firma temporal para subir directo al almacenamiento privado. */
export interface UploadTicket {
  uploadUrl: string;
  fields: Record<string, string>;
  publicId: string;
  allowedFormats: string[];
  maxBytes: number;
  expiresAt: string;
}

export interface LicenseSubmission {
  type: 'LICENSE';
  serviceId: string;
  reference: string;
  /** Opcional: respaldo del número. */
  documentPublicId?: string;
  /** YYYY-MM-DD */
  expiresAt?: string;
}

/** Tipos que se aceptan en el selector (el backend vuelve a validar el formato real). */
export const DOCUMENT_ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp';
export const DOCUMENT_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
