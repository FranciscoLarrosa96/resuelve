/**
 * Estados de una solicitud. Equivalencia con las etapas del frontend
 * ("Mis solicitudes"):
 *
 *   DRAFT                  — (armando el pedido, todavía no enviado)
 *   WAITING_QUOTES         — 0 Esperando respuestas
 *   QUOTES_RECEIVED        — 1 Presupuestos recibidos
 *   PROFESSIONAL_SELECTED  — 2 Profesional seleccionado
 *   SCHEDULED              — 3 Trabajo programado
 *   AWAITING_REVIEW        — 4 Pendiente de reseña (el trabajo se completó)
 *   CLOSED                 — 5 Cerrado
 *   CANCELLED              — cancelado por el cliente
 */
export enum RequestStatus {
  DRAFT = 'DRAFT',
  WAITING_QUOTES = 'WAITING_QUOTES',
  QUOTES_RECEIVED = 'QUOTES_RECEIVED',
  PROFESSIONAL_SELECTED = 'PROFESSIONAL_SELECTED',
  SCHEDULED = 'SCHEDULED',
  AWAITING_REVIEW = 'AWAITING_REVIEW',
  CLOSED = 'CLOSED',
  CANCELLED = 'CANCELLED',
}

/** "Puede esperar" / "Para hoy" / "Urgente". Una urgencia es una solicitud más. */
export enum RequestUrgency {
  FLEXIBLE = 'FLEXIBLE',
  TODAY = 'TODAY',
  URGENT = 'URGENT',
}

export enum InvitationStatus {
  PENDING = 'PENDING',
  QUOTED = 'QUOTED',
  DECLINED = 'DECLINED',
  SELECTED = 'SELECTED',
  NOT_SELECTED = 'NOT_SELECTED',
}

/** Igual que el frontend: se pide presupuesto a 3 profesionales como máximo. */
export const MAX_INVITATIONS_PER_REQUEST = 3;
