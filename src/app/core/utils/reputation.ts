import { oneDecimal, pluralize } from './format';

/**
 * Reputación REAL (averageRating y reviewsCount que calcula el backend a
 * partir de reseñas de trabajos hechos por Resuelve). Sin reseñas no hay
 * rating: nunca se muestra 0 ni un valor de relleno.
 */
export interface Reputation {
  averageRating: number | null;
  reviewsCount: number;
  /** Reseñas de clientes invitados: solo se nombran, nunca dan puntaje. */
  invitedReviewsCount?: number;
}

export const NO_REVIEWS_TEXT = 'Sin reseñas todavía';

/**
 * Sin reseñas por Resuelve: si tiene de clientes invitados, las nombra ("1 reseña de cliente
 * invitado") en vez de decir que no tiene ninguna. Nunca muestra su promedio como puntaje.
 */
export function noReviewsText(r: Pick<Reputation, 'invitedReviewsCount'>): string {
  const invited = r.invitedReviewsCount ?? 0;
  return invited > 0
    ? pluralize(invited, 'reseña de cliente invitado', 'reseñas de clientes invitados')
    : NO_REVIEWS_TEXT;
}

export const hasReviews = (r: Reputation): boolean => r.reviewsCount > 0 && r.averageRating !== null;

/** "1 reseña" · "23 reseñas" */
export function reviewsLabel(count: number): string {
  return pluralize(count, 'reseña', 'reseñas');
}

/** "4,8 · 23 reseñas" (la estrella la pone la vista, decorativa) o `noReviewsText`. */
export function reputationText(r: Reputation): string {
  return hasReviews(r) ? `${oneDecimal(r.averageRating!)} · ${reviewsLabel(r.reviewsCount)}` : noReviewsText(r);
}

/** Para lectores de pantalla: "4,8 de 5 estrellas, 23 reseñas". */
export function reputationLabel(r: Reputation): string {
  return hasReviews(r)
    ? `${oneDecimal(r.averageRating!)} de 5 estrellas, ${reviewsLabel(r.reviewsCount)}`
    : noReviewsText(r);
}

/** "5 de 5 estrellas" */
export const starsLabel = (rating: number): string => `${rating} de 5 estrellas`;

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** "septiembre 2026" en hora de Argentina: una reseña pública no muestra la fecha exacta. */
export function reviewMonth(iso: string): string {
  const [year, month] = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
  })
    .format(new Date(iso))
    .split('-');
  return `${MONTHS[Number(month) - 1]} ${year}`;
}
