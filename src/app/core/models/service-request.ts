import { ServiceRef } from './category';

/**
 * Profesional dentro de una solicitud (foto guardada con la solicitud, como
 * la devolverá el backend con las invitaciones). En las solicitudes enviadas
 * desde el flujo son profesionales reales (UUID); en los mocks de
 * "Mis solicitudes" son datos de ejemplo de esa vertical, que sigue mock.
 */
export interface RequestProfessional {
  id: string;
  displayName: string;
  firstName: string;
  avatarUrl: string | null;
  averageRating: number | null;
  reviewsCount: number;
}

export type Urgency = 'wait' | 'today' | 'urgent';

/** El pedido que arma el cliente y que viaja por todo el flujo. */
export interface ServiceRequestDraft {
  /** Id del borrador. Cada pedido nuevo (o repetido) tiene uno propio. */
  id: string;
  /** Si se creó con "Crear solicitud similar", la solicitud de origen (solo referencia). */
  sourceRequestId?: string;
  /** Explicación completa del cliente, editable. Vacía si arrancó eligiendo un servicio. */
  description: string;
  /** Servicio del catálogo real: id del backend + slug + nombre. */
  service: ServiceRef;
  /** Resumen corto editable ("Pérdida bajo mesada"). */
  title: string;
  urgency: Urgency;
  zone: string;
  when: string;
  photos: number;
}

export type RequestStep = 0 | 1 | 2 | 3 | 4 | 5;

export interface Quote {
  professionalId: string;
  amount: number;
  slot: string;
  description: string;
}

/** Etapas de una solicitud del cliente (Mis solicitudes). */
export type ClientRequestStage = 0 | 1 | 2 | 3 | 4 | 5;

export interface StageMeta {
  label: string;
  bg: string;
  fg: string;
  dot: string;
  /** Acción pendiente del cliente, si la hay. */
  action?: string;
}

export interface ClientRequest {
  id: string;
  title: string;
  /** Descripción original del pedido. */
  description?: string;
  service: ServiceRef;
  zone: string;
  date: string;
  stage: ClientRequestStage;
  /** Profesionales a los que se envió. */
  professionals: RequestProfessional[];
  quotes?: Quote[];
  chosenId?: string;
  amount?: number;
  when?: string;
  myRating?: number;
  myReview?: string;
}
