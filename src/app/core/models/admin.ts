import { VerificationStatus } from './pro-profile';

/**
 * Panel de matrículas (backend: AdminVerificationsController). Solo responde a
 * cuentas con `isAdmin`; para el resto la API devuelve 404.
 */
export interface AdminVerification {
  id: string;
  type: 'IDENTITY' | 'PHONE' | 'LICENSE';
  status: VerificationStatus;
  professionalId: string;
  professional: string;
  /** El perfil está visible (ACTIVE): se puede enlazar el perfil público. */
  professionalActive: boolean;
  service: string | null;
  serviceSlug: string | null;
  reference: string | null;
  submittedAt: string;
  expiresAt: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  rejectionReason: string | null;
  document: { format: string | null; bytes: number | null } | null;
}

export interface AdminVerificationList {
  items: AdminVerification[];
  /** Total de pendientes, sea cual sea la vista. */
  pendingCount: number;
}

export interface AdminHistoryEntry {
  id: string;
  status: VerificationStatus;
  reference: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  rejectionReason: string | null;
}

export interface AdminVerificationDetail {
  item: AdminVerification;
  /** Link firmado y temporal (10 min) al documento privado; null si no hay. */
  documentUrl: string | null;
  /** Envíos anteriores del mismo profesional para el mismo servicio. */
  history: AdminHistoryEntry[];
}

export type AdminListView = 'pending' | 'reviewed';

export const REJECTION_REASON_LIMITS = { min: 5, max: 300 } as const;

/** Minutos que dura el link al documento. */
export const DOCUMENT_LINK_MINUTES = 10;

export type AdminReportView = 'open' | 'resolved';
export type AdminReportStatus = 'OPEN' | 'HIDDEN' | 'DISMISSED';

/** Un reporte de reseña (`GET /admin/reports`). El correo del reportante solo lo ve quien modera. */
export interface AdminReport {
  reportId: string;
  status: AdminReportStatus;
  reason: 'FAKE' | 'OFFENSIVE' | 'SPAM' | 'OTHER';
  details: string | null;
  reportedAt: string;
  reporterEmail: string;
  reviewId: string;
  rating: number;
  comment: string | null;
  kind: 'VERIFICADA' | 'INVITADA';
  reviewer: string;
  professional: string;
  professionalId: string;
  hidden: boolean;
  hiddenReason: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
}

export interface AdminReportList {
  items: AdminReport[];
  openCount: number;
}

export const HIDE_REASON_LIMITS = { min: 5, max: 300 } as const;
