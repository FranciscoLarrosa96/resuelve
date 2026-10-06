/**
 * Reseña por invitación: la deja alguien que NO contrató al profesional por Resuelve
 * (el profesional le pasó su QR o su enlace). Es otro tipo de reseña, siempre rotulada
 * "Cliente invitado por el profesional": no entra en el rating, la cantidad ni el orden
 * de la búsqueda. Única fuente de la regla (la usan el GET de estado y el POST).
 */

/** Tope de reseñas por invitación que un profesional recibe en una ventana móvil. */
export const INVITED_REVIEWS_LIMIT = 20;
export const INVITED_REVIEWS_WINDOW_DAYS = 30;

export type InvitedReviewBlocker =
  /** Es su propio perfil. */
  | 'OWN_PROFILE'
  /** Ya reseñó a este profesional (por invitación o por un trabajo). */
  | 'ALREADY_REVIEWED'
  /** Lo contrató por Resuelve y ese trabajo terminado todavía no tiene reseña: va por ahí (verificada). */
  | 'USE_JOB_REVIEW'
  /** El profesional ya recibió el máximo de reseñas por invitación de la ventana. */
  | 'LIMIT_REACHED';

export interface InvitedReviewFacts {
  isOwnProfile: boolean;
  /** El cliente ya tiene una reseña (de cualquier tipo) para este profesional. */
  hasReviewedBefore: boolean;
  /** Un trabajo COMPLETED con este profesional, del cliente, sin reseña. */
  pendingJobRequestId: string | null;
  /** Reseñas por invitación que el profesional recibió dentro de la ventana. */
  recentInvitedCount: number;
}

export function invitedReviewBlocker(f: InvitedReviewFacts): InvitedReviewBlocker | null {
  if (f.isOwnProfile) return 'OWN_PROFILE';
  if (f.hasReviewedBefore) return 'ALREADY_REVIEWED';
  if (f.pendingJobRequestId) return 'USE_JOB_REVIEW';
  if (f.recentInvitedCount >= INVITED_REVIEWS_LIMIT) return 'LIMIT_REACHED';
  return null;
}

export const INVITED_REVIEW_MESSAGES: Record<InvitedReviewBlocker, string> = {
  OWN_PROFILE: 'No podés reseñar tu propio perfil',
  ALREADY_REVIEWED: 'Ya dejaste tu reseña para este profesional',
  USE_JOB_REVIEW: 'Contrataste a este profesional por Resuelve: dejá tu reseña desde ese trabajo',
  LIMIT_REACHED: 'Este profesional no puede recibir más reseñas por invitación por ahora',
};
