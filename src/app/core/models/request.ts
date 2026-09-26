/**
 * Solicitudes reales. Espejo exacto de lo que devuelve el backend
 * (request.presenter.ts). Los nombres de estados son los del backend: el
 * frontend nunca decide un estado, siempre usa el de la última respuesta.
 */

export type RequestStatus =
  | 'DRAFT'
  | 'WAITING_QUOTES'
  | 'QUOTES_RECEIVED'
  | 'PROFESSIONAL_SELECTED'
  | 'SCHEDULED'
  | 'COMPLETED'
  /** Legacy (solo lectura): el backend ya no lo escribe. */
  | 'AWAITING_REVIEW'
  | 'CLOSED'
  | 'CANCELLED';

export type RequestUrgency = 'FLEXIBLE' | 'TODAY' | 'URGENT';

/** Filtros agrupados de "Mis solicitudes" (`?group=`, REQUEST_GROUPS del backend). */
export type RequestGroup = 'ACTIVE' | 'QUOTES' | 'COORDINATING' | 'SCHEDULED' | 'DONE' | 'CANCELLED';

/**
 * Cita de trabajo (appointment.presenter del backend). Solo la reciben el
 * cliente dueño y el profesional elegido; es la más reciente de la solicitud.
 */
export type AppointmentStatus = 'PROPOSED' | 'CONFIRMED' | 'DECLINED' | 'CANCELLED' | 'COMPLETED';

/** Una de las dos partes del trabajo. */
export type WorkParty = 'CLIENT' | 'PROFESSIONAL';

export interface Appointment {
  id: string;
  status: AppointmentStatus;
  /** ISO en UTC: se muestra en hora de Argentina (core/utils/business-time). */
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  note: string | null;
  cancelledBy: WorkParty | null;
  createdAt: string;
  updatedAt: string;
}

export type InvitationStatus = 'PENDING' | 'QUOTED' | 'DECLINED' | 'SELECTED' | 'NOT_SELECTED';

/** Máximo de profesionales a los que se pide presupuesto (MAX_INVITATIONS_PER_REQUEST del backend). */
export const MAX_INVITATIONS = 3;

export interface RequestServiceRef {
  id: string;
  name?: string;
  slug?: string;
}

export interface RequestZoneRef {
  id: string;
  name?: string;
  slug?: string;
}

export interface RequestPhoto {
  id: string;
  url: string;
}

/** Datos públicos de un profesional dentro de una solicitud o presupuesto. */
export interface RequestProfessional {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  /** `null` = sin reseñas todavía. */
  averageRating: number | null;
  reviewsCount: number;
}

export interface RequestInvitation {
  id: string;
  professionalId: string;
  status: InvitationStatus;
  sentAt: string;
  respondedAt: string | null;
  professional?: RequestProfessional;
}

interface RequestBase {
  id: string;
  title: string;
  description: string;
  urgency: RequestUrgency;
  status: RequestStatus;
  /** YYYY-MM-DD */
  desiredDate: string | null;
  desiredTimeRange: string | null;
  service: RequestServiceRef;
  zone: RequestZoneRef;
  photos: RequestPhoto[];
  createdAt: string;
  updatedAt: string;
}

/** Vista del cliente dueño (GET /requests/mine, GET /requests/:id). */
export interface ServiceRequest extends RequestBase {
  /** Privada: solo la ven el dueño y el profesional elegido. */
  exactAddress: string | null;
  selectedProfessionalId: string | null;
  acceptedQuoteId: string | null;
  completedAt: string | null;
  /** Quién confirmó que el trabajo se realizó (solo lo ven las partes). */
  completedBy: WorkParty | null;
  cancelledAt: string | null;
  invitations: RequestInvitation[];
  appointment: Appointment | null;
  /**
   * El horario confirmado ya terminó y el trabajo sigue sin cerrar: "¿Se
   * realizó el trabajo?". El paso del tiempo nunca completa nada solo.
   */
  completionDue: boolean;
  /** La reseña que dejó el cliente (una por trabajo). */
  review: OwnReview | null;
  /** Misma regla que el backend (trabajo realizado, sin reseña previa): solo entonces hay CTA. */
  canReview: boolean;
}

/** Reseña propia, vista por el cliente que la escribió. */
export interface OwnReview {
  id: string;
  /** Entero de 1 a 5. */
  rating: number;
  comment: string | null;
  createdAt: string;
}

/** POST /requests/:id/review. El profesional lo deriva el backend de la solicitud. */
export interface CreateReviewPayload {
  rating: number;
  comment?: string;
}

/** Límite de caracteres del comentario (CreateReviewDto del backend). */
export const REVIEW_COMMENT_MAX = 1000;

/** Vista de un profesional invitado (GET /pro/requests, GET /pro/requests/:id). */
export interface ProServiceRequest extends RequestBase {
  invitationStatus: InvitationStatus | null;
  /** "También lo recibieron N profesionales". */
  otherInvitedCount: number;
  selectedByClient: boolean;
  /** Solo para el profesional elegido. */
  completedAt: string | null;
  completedBy: WorkParty | null;
  /** `null` salvo para el profesional elegido. */
  appointment: Appointment | null;
  /** Solo el elegido: el horario confirmado ya terminó y el trabajo sigue sin cerrar. */
  completionDue: boolean;
  /** Antes de la elección: solo nombre e inicial del apellido. */
  client: { firstName: string; lastInitial: string } | null;
  /** `null` hasta que el cliente lo elige (lo decide el backend). */
  contact: { fullName: string; phone: string | null; exactAddress: string | null } | null;
}

/** POST /requests (CreateRequestDto). Sin estado: la solicitud nace en DRAFT. */
export interface CreateRequestPayload {
  serviceId: string;
  zoneId: string;
  title: string;
  description: string;
  urgency?: RequestUrgency;
  desiredDate?: string;
  desiredTimeRange?: string;
  exactAddress?: string;
}

/** Límites del CreateRequestDto. */
export const REQUEST_LIMITS = {
  titleMin: 3,
  titleMax: 140,
  descriptionMin: 10,
  descriptionMax: 2000,
  addressMax: 240,
} as const;
