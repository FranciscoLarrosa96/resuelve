import { CategoryName } from './category';

export type Urgency = 'wait' | 'today' | 'urgent';

/** El pedido que arma el cliente y que viaja por todo el flujo. */
export interface ServiceRequestDraft {
  text: string;
  category: CategoryName;
  problem: string;
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
  category: CategoryName;
  zone: string;
  date: string;
  stage: ClientRequestStage;
  /** Profesionales a los que se envió. */
  professionalIds: string[];
  quotes?: Quote[];
  chosenId?: string;
  amount?: number;
  when?: string;
  myRating?: number;
  myReview?: string;
}
