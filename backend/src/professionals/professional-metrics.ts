import type { EntityManager } from 'typeorm';
import { WORK_DONE_STATUSES } from '../requests/request-state-machine';

/**
 * Recalcula rating, cantidad de reseñas y trabajos completados a partir de
 * los datos reales (reviews y service_requests). Es la única forma en que
 * cambian estas métricas: ningún endpoint acepta valores enviados por el cliente.
 */
export async function recalculateProfessionalMetrics(
  manager: EntityManager,
  professionalId: string,
): Promise<void> {
  await manager.query(
    `UPDATE professional_profiles p
        SET average_rating = COALESCE(r.avg_rating, 0),
            reviews_count = COALESCE(r.cnt, 0),
            completed_jobs_count = COALESCE(j.cnt, 0),
            updated_at = now()
       FROM (SELECT ROUND(AVG(rating)::numeric, 2) AS avg_rating, COUNT(*)::int AS cnt
               FROM reviews WHERE professional_id = $1) r,
            (SELECT COUNT(*)::int AS cnt
               FROM service_requests
              WHERE selected_professional_id = $1 AND status::text = ANY($2)) j
      WHERE p.id = $1`,
    [professionalId, [...WORK_DONE_STATUSES]],
  );
}
