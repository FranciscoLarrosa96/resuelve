/**
 * Estados de una solicitud. Equivalencia con las etapas del frontend
 * ("Mis solicitudes"):
 *
 *   DRAFT                  — (armando el pedido, todavía no enviado)
 *   WAITING_QUOTES         — 0 Esperando respuestas
 *   QUOTES_RECEIVED        — 1 Presupuestos recibidos
 *   PROFESSIONAL_SELECTED  — 2 Profesional elegido (coordinando fecha)
 *   SCHEDULED              — 3 Trabajo agendado (hay una cita confirmada)
 *   COMPLETED              — 4 Trabajo realizado (lo confirmó el cliente o el profesional)
 *   CANCELLED              — cancelado por el cliente
 *
 * Legacy (solo lectura, ya no se escriben):
 *   AWAITING_REVIEW — "terminado, pendiente de reseña". La migración
 *                     AppointmentsAgenda pasó esas filas a COMPLETED.
 *   CLOSED          — "terminado y reseñado" en el flujo anterior. Se lee
 *                     como un trabajo realizado; una reseña ya no cambia el estado.
 */
export enum RequestStatus {
  DRAFT = 'DRAFT',
  WAITING_QUOTES = 'WAITING_QUOTES',
  QUOTES_RECEIVED = 'QUOTES_RECEIVED',
  PROFESSIONAL_SELECTED = 'PROFESSIONAL_SELECTED',
  SCHEDULED = 'SCHEDULED',
  COMPLETED = 'COMPLETED',
  AWAITING_REVIEW = 'AWAITING_REVIEW',
  CLOSED = 'CLOSED',
  CANCELLED = 'CANCELLED',
}

/** Parte de un trabajo: quién canceló un horario o quién confirmó que el trabajo se realizó. */
export enum Party {
  CLIENT = 'CLIENT',
  PROFESSIONAL = 'PROFESSIONAL',
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
