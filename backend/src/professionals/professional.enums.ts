export enum PlanTier {
  FREE = 'FREE',
  PRO = 'PRO',
}

export enum VerificationType {
  IDENTITY = 'IDENTITY',
  PHONE = 'PHONE',
  LICENSE = 'LICENSE',
}

export enum VerificationStatus {
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
  REJECTED = 'REJECTED',
}

/** Pedidos que puede responder por mes un profesional en plan FREE. */
export const FREE_MONTHLY_REQUEST_LIMIT = 10;
