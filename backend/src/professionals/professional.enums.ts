export enum PlanTier {
  FREE = 'FREE',
  PRO = 'PRO',
}

export enum VerificationType {
  IDENTITY = 'IDENTITY',
  PHONE = 'PHONE',
  LICENSE = 'LICENSE',
}

/**
 * Estado persistido de una verificación. "Sin enviar" no es un estado: es la
 * ausencia de fila. Una VERIFIED con `expiresAt` vencido deja de contar en el
 * acto (ver `effectiveVerificationStatus`) y se persiste como EXPIRED cuando
 * se reenvía o se revisa.
 */
export enum VerificationStatus {
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED',
}

/**
 * Visibilidad del perfil que decide el profesional.
 * ACTIVE: aparece en búsquedas y se lo puede invitar.
 * PAUSED: oculto (búsquedas, ficha pública e invitaciones nuevas); conserva historial.
 */
export enum ProfessionalStatus {
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
}
