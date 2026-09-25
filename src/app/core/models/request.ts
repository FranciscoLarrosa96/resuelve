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
  | 'AWAITING_REVIEW'
  | 'CLOSED'
  | 'CANCELLED';

export type RequestUrgency = 'FLEXIBLE' | 'TODAY' | 'URGENT';

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
  cancelledAt: string | null;
  invitations: RequestInvitation[];
}

/** Vista de un profesional invitado (GET /pro/requests, GET /pro/requests/:id). */
export interface ProServiceRequest extends RequestBase {
  invitationStatus: InvitationStatus | null;
  /** "También lo recibieron N profesionales". */
  otherInvitedCount: number;
  selectedByClient: boolean;
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
