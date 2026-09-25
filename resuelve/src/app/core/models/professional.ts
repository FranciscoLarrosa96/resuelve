import { CategoryName, Service } from './category';

/** Colores del avatar con iniciales (fallback cuando no hay foto). */
export interface AvatarTone {
  bg: string;
  fg: string;
}

/** Lo mínimo que necesita un avatar para dibujarse. */
export interface AvatarSubject {
  name: string;
  initials: string;
  tone: AvatarTone;
  photoUrl?: string;
}

export interface Professional extends AvatarSubject {
  id: string;
  firstName: string;
  trade: string;
  categories: CategoryName[];
  services: Service[];
  rating: number;
  reviewsCount: number;
  jobsCount: number;
  yearsExperience: number;
  distanceKm: number;
  availableToday: boolean;
  /** Ej. "~5 min" */
  responseTime: string;
  /** Ej. "aproximadamente 5 minutos" */
  responseTimeLong: string;
  responseMinutes: number;
  licenseVerified: boolean;
  licenseLabel?: string;
  /** Formato corto: "Hoy 16:00" */
  nextSlot: string;
  /** Formato largo (mobile): "Próximo turno libre: hoy 16:00" */
  nextSlotLong: string;
  zones: string[];
  /** Cita destacada de una reseña. */
  highlight: string;
  /** Posición aproximada en el mapa simulado, en %. */
  map: { x: number; y: number };
}

export interface Review {
  text: string;
  author: string;
  initials: string;
  zone: string;
  job: string;
  date: string;
}

export interface PortfolioItem {
  title: string;
  zone: string;
}

export interface VerificationCheck {
  title: string;
  detail: string;
}
