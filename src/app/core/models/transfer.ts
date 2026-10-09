/** Pago de Resuelve PRO por transferencia (estado interno del backend). */
export type TransferStatus = 'AWAITING_PROOF' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'WITHDRAWN';

/** Datos bancarios que publica el admin. */
export interface TransferAccount {
  holder: string;
  alias: string;
  cbu: string | null;
  bank: string | null;
  cuit: string | null;
}

/** Período que se puede pagar: el monto lo decide el backend (nunca viaja desde acá). */
export interface TransferOption {
  months: 1 | 3 | 6;
  days: number;
  amountArs: number;
  basePriceArs: number;
  /** Primer mes con la oferta de bienvenida (null = precio normal). */
  discountedFirstMonthArs: number | null;
  offerCode: string | null;
}

export interface TransferPayment {
  id: string;
  /** Código para el concepto de la transferencia (`RES-7F3K9Q`). */
  reference: string;
  status: TransferStatus;
  months: number;
  amountArs: number;
  basePriceArs: number;
  offerCode: string | null;
  proofUploaded: boolean;
  /** Solo REJECTED: el motivo que escribió el admin. */
  rejectionReason: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  reviewedAt: string | null;
  withdrawnAt: string | null;
  refundedAt: string | null;
  createdAt: string;
}

/** GET /billing/transfer. */
export interface TransferOverview {
  /** false = el admin no cargó (o apagó) los datos bancarios: la opción no existe. */
  available: boolean;
  account: TransferAccount | null;
  /** Con Mercado Pago activo o PRO manual sin vencimiento no hay nada que pagar. */
  blocked: 'SUBSCRIPTION_ACTIVE' | 'MANUAL_PRO' | null;
  options: TransferOption[];
  pending: TransferPayment | null;
  last: TransferPayment | null;
  /** PRO por transferencia vigente hasta. */
  proUntil: string | null;
  withdrawal: { paymentId: string; amountArs: number; until: string } | null;
  refundPending: { amountArs: number; withdrawnAt: string } | null;
  /** Se puede adjuntar el comprobante. */
  proofUploads: boolean;
}
