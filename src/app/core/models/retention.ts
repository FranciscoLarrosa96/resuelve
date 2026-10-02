import type { ProfessionalSummary } from './professional';

/**
 * "Mis profesionales" (GET /clients/me/professionals…): espejo del backend
 * (`backend/src/retention`). Lo contratado sale de Jobs COMPLETED reales; lo
 * guardado es una acción del cliente. Favorito ≠ contratado.
 */

/**
 * - AVAILABLE: recibe solicitudes.
 * - PAUSED: "No está recibiendo nuevas solicitudes por ahora" (conserva el historial).
 * - UNAVAILABLE: activo pero sin servicio público: "Perfil no disponible actualmente".
 */
export type RetentionAvailability = 'AVAILABLE' | 'PAUSED' | 'UNAVAILABLE';

export interface PastJob {
  requestId: string;
  title: string;
  serviceName: string;
  /** ISO 8601. */
  completedAt: string;
}

interface RetentionCard {
  professional: ProfessionalSummary;
  availability: RetentionAvailability;
  /** Se ofrece "Pedir presupuesto" / "Volver a contratar" solo con `true`. El backend revalida al enviar. */
  canRequest: boolean;
}

export interface HiredProfessional extends RetentionCard {
  jobsCount: number;
  lastCompletedAt: string;
  /** Servicio del último trabajo, solo si hoy lo sigue ofreciendo. Una sugerencia: nunca se asume. */
  rehireServiceId: string | null;
  /** Trabajos anteriores, el más reciente primero (hasta 5). */
  jobs: PastJob[];
  saved: boolean;
}

export interface SavedProfessional extends RetentionCard {
  savedAt: string;
  jobsCount: number;
}

export interface MyProfessionals {
  hired: HiredProfessional[];
  saved: SavedProfessional[];
}

/** GET /clients/me/professionals/:id */
export interface ProfessionalRelationship {
  professionalId: string;
  saved: boolean;
  savedAt: string | null;
  availability: RetentionAvailability;
  jobsCount: number;
  lastCompletedAt: string | null;
  canRehire: boolean;
  rehireServiceId: string | null;
  jobs: PastJob[];
}

/** Texto de un profesional que no se puede contratar hoy (null = se puede). */
export function unavailableText(availability: RetentionAvailability): string | null {
  switch (availability) {
    case 'PAUSED':
      return 'No está recibiendo nuevas solicitudes por ahora';
    case 'UNAVAILABLE':
      return 'Perfil no disponible actualmente';
    default:
      return null;
  }
}
