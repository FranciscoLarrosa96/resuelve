import { In, type EntityManager } from 'typeorm';
import { Review } from './review.entity';

/**
 * Reseña pública (perfil del profesional). Solo el nombre de pila de quien
 * reseña: nada de apellido, barrio, servicio, monto, fecha del trabajo ni ids internos.
 */
export function presentPublicReview(r: Review) {
  return {
    id: r.id,
    rating: r.rating,
    comment: r.comment,
    reviewerDisplayName: r.client?.firstName ?? 'Cliente',
    createdAt: r.createdAt,
  };
}

/** La reseña que el propio cliente dejó (detalle de su solicitud). */
export function presentOwnReview(r: Review) {
  return { id: r.id, rating: r.rating, comment: r.comment, createdAt: r.createdAt };
}

/** Reseñas de varias solicitudes en una query (listados del cliente). */
export async function reviewsByRequest(
  manager: EntityManager,
  requestIds: string[],
): Promise<Map<string, Review>> {
  if (!requestIds.length) return new Map();
  const rows = await manager.find(Review, { where: { requestId: In(requestIds) } });
  return new Map(rows.map((r) => [r.requestId, r]));
}
