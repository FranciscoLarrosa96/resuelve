import { CategoryName } from './category';

export type IncomingUrgency = 'Urgente' | 'Para hoy' | 'Puede esperar';
export type IncomingStatus = 'new' | 'quoted' | 'accepted' | 'scheduled' | 'completed' | 'declined';

/** Solicitud que recibe el profesional. */
export interface IncomingRequest {
  id: string;
  clientRequestId?: string;
  title: string;
  description: string;
  zone: string;
  distanceKm: number;
  when: string;
  urgency: IncomingUrgency;
  photos: number;
  client: string;
  clientInitial: string;
  receivedAgo: string;
  status: IncomingStatus;
  quoteAmount?: number;
  /** Cuántos otros profesionales recibieron el pedido. */
  others: number;
}

export interface AgendaEvent {
  id: string;
  /** 0 = lunes 21 … 6 = domingo 27 */
  day: number;
  /** Hora de inicio decimal: 9.5 = 9:30 */
  start: number;
  duration: number;
  title: string;
  zone: string;
  client: string;
  address: string;
  tentative?: boolean;
}

export interface QuoteDraft {
  description: string;
  labor: number;
  materials: number;
  slot: string;
  validity: string;
  notes: string;
}

export interface ProSettings {
  name: string;
  trade: string;
  years: string;
  description: string;
  categories: CategoryName[];
  services: string[];
  zones: string[];
  hours: string;
}

export type ProPlan = 'free' | 'pro';

export interface WeekIncome {
  label: string;
  amount: number;
  previousAmount: number;
}

export interface ActivityItem {
  text: string;
  time: string;
  color: string;
}
