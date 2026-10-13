import type { EntityManager } from 'typeorm';
import { EFFECTIVE_PRO_SQL } from '../plans/plan';
import { FEATURED_ELIGIBLE_SQL } from '../professionals/professional-rules';

/** Con menos pedidos en el mes no se muestra nada: 1 o 2 no dicen "demanda" y podrían identificar a alguien. */
export const LOCAL_DEMAND_MIN_REQUESTS = 3;

export interface LocalDemand {
  /** Ciudad principal del profesional (la demanda nunca mezcla localidades). */
  locality: string;
  /** Sus servicios activos, por nombre. */
  services: string[];
  /** Pedidos publicados en el mes de esos servicios en esa ciudad (de cualquier cliente, a cualquiera). */
  requests: number;
  /**
   * De esos, cuántos ya tenían presupuesto antes de que los perfiles Free pudieran verlos
   * (alguna invitación Free demorada y el primer presupuesto antes de que se habilitara).
   */
  answeredBeforeFree: number;
  /** Otros perfiles PRO vigentes que hoy pueden ocupar Destacados en esos servicios y esa ciudad. */
  otherProProfiles: number;
}

/**
 * "La demanda en tu zona": cuánto se pidió en el mes de SUS servicios en SU ciudad principal.
 * Agregado y anónimo (solo conteos, nunca quién pidió ni a quién), con mínimo de muestra
 * (`LOCAL_DEMAND_MIN_REQUESTS`); null = sin ciudad, sin servicios o sin base suficiente.
 * Es igual para Free y PRO: lo que cambia es cuánto de eso le llega y cuándo.
 */
export async function localDemand(
  m: Pick<EntityManager, 'query'>,
  professionalId: string,
  start: Date,
  end: Date,
): Promise<LocalDemand | null> {
  const [row] = await m.query<
    { locality: string | null; services: string[] | null; requests: number; before_free: number; pros: number }[]
  >(
    `WITH me AS (
       SELECT pp.primary_city_id AS city_id FROM professional_profiles pp WHERE pp.id = $1
     ), my_services AS (
       SELECT s.id, s.name FROM professional_services ps JOIN services s ON s.id = ps.service_id
        WHERE ps.professional_id = $1 AND s.active
     ), market AS (
       SELECT sr.id FROM service_requests sr
        WHERE sr.city_id = (SELECT city_id FROM me)
          AND sr.service_id IN (SELECT id FROM my_services)
          AND sr.status::text <> 'DRAFT'
          AND sr.created_at >= $2 AND sr.created_at < $3
     )
     SELECT (SELECT c.name FROM cities c WHERE c.id = (SELECT city_id FROM me)) AS locality,
            (SELECT array_agg(name ORDER BY name) FROM my_services) AS services,
            (SELECT count(*)::int FROM market) AS requests,
            (SELECT count(*)::int FROM market mk
              WHERE EXISTS (
                SELECT 1 FROM request_invitations i
                 WHERE i.request_id = mk.id AND NOT i.targeted AND i.available_at > i.sent_at
                   AND (SELECT min(q.created_at) FROM quotes q WHERE q.request_id = mk.id) < i.available_at
              )) AS before_free,
            (SELECT count(*)::int FROM professional_profiles p
              WHERE p.id <> $1 AND ${EFFECTIVE_PRO_SQL} AND ${FEATURED_ELIGIBLE_SQL}
                AND EXISTS (SELECT 1 FROM professional_localities pl
                             WHERE pl.professional_id = p.id AND pl.city_id = (SELECT city_id FROM me))
                AND EXISTS (SELECT 1 FROM professional_services ops
                             WHERE ops.professional_id = p.id AND ops.service_id IN (SELECT id FROM my_services))
            ) AS pros`,
    [professionalId, start, end],
  );
  if (!row?.locality || !row.services?.length || Number(row.requests) < LOCAL_DEMAND_MIN_REQUESTS) return null;
  return {
    locality: row.locality,
    services: row.services,
    requests: Number(row.requests),
    answeredBeforeFree: Number(row.before_free),
    otherProProfiles: Number(row.pros),
  };
}
