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

export const PRO_PRICE_LIMITS = { min: 1, max: 10_000_000 } as const;

/** Debajo de este monto el precio es de prueba: cualquiera que se suscriba paga ese monto. */
export const PRO_PRICE_TEST_BELOW = 1000;

export interface AdminProPriceChange {
  priceArs: number;
  previousPriceArs: number;
  changedBy: string;
  createdAt: string;
}

/** `GET/PUT /admin/pricing`: precio de PRO para suscripciones nuevas. */
export interface AdminProPricing {
  monthlyPriceArs: number;
  /** ADMIN = lo fijó el panel; CONFIG = sigue el valor inicial del servidor. */
  source: 'ADMIN' | 'CONFIG';
  defaultPriceArs: number;
  introOffer: { code: string; discountPercent: number; cycles: number; discountedPriceArs: number } | null;
  /** false = sin cobro online (`BILLING_PROVIDER=none`): el precio solo se muestra. */
  selfServe: boolean;
  history: AdminProPriceChange[];
  /** Suscripciones vivas por monto que pagan hoy (no cambian con el precio nuevo). */
  inUse: { amountArs: number; subscriptions: number }[];
}

/** Filtro del listado de usuarios (`GET /admin/users?kind=`). */
export type AdminUserKind = 'active' | 'professionals' | 'clients' | 'admins' | 'deleted';

export interface AdminUserItem {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  createdAt: string;
  /** Dada de baja (anonimizada): "Usuario eliminado". */
  deletedAt: string | null;
  isAdmin: boolean;
  professional: { id: string; slug: string; status: 'ACTIVE' | 'PAUSED'; pro: boolean } | null;
}

export interface AdminUserList {
  items: AdminUserItem[];
  total: number;
  page: number;
  pageSize: number;
}

/** Lo que cuelga de la cuenta: lo que se borra con ella en un borrado definitivo. */
export interface AdminUserActivity {
  requests: number;
  quotes: number;
  jobs: number;
  reviewsWritten: number;
  reviewsReceived: number;
  /** Otras cuentas con las que tuvo solicitudes, presupuestos, invitaciones o reseñas. */
  counterparts: number;
  openSubscriptions: number;
}

export interface AdminUserDetail {
  user: AdminUserItem & {
    phone: string | null;
    emailVerifiedAt: string | null;
    termsAcceptedAt: string | null;
  };
  activity: AdminUserActivity;
  /** Lo que hoy impide "Dar de baja" (mismas reglas que la baja de cuenta). */
  blockers: { code: 'ACTIVE_JOBS' | 'OPEN_SUBSCRIPTION'; count: number }[];
}
