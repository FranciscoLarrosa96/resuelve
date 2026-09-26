import { OwnPlan, QuoteUsage } from './pro-analytics';
import { ProfessionalSummary, ZoneSummary } from './professional';

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

export interface OwnProfessional extends ProfessionalSummary {
  status: ProfessionalStatus;
  offeredServices: OfferedService[];
  /** Zonas guardadas aunque cubra todo Tandil (para volver a "Solo algunos barrios"). */
  savedZones: ZoneSummary[];
  /** Plan efectivo (igual a `plan.tier`). */
  planTier: 'FREE' | 'PRO';
  plan: OwnPlan;
  /** Presupuestos del mes (solicitudes distintas). limit null = sin límite. */
  quoteUsage: QuoteUsage;
  /** Más reciente primero; los rechazos viejos quedan como historial. */
  verificationRequests: OwnVerification[];
}

export interface CreateProfessionalProfile {
  headline: string;
  bio?: string;
  yearsExperience: number;
  serviceIds: string[];
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
