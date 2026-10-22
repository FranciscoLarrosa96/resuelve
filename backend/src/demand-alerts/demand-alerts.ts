import type { DataSource, EntityManager } from 'typeorm';
import { DemandAlertNotice, NotificationType } from '../notifications/notification.entity';
import { notify } from '../notifications/notify';
import { COVERS_LOCALITY_SQL } from '../professionals/professional-rules';

/**
 * "Avisame cuando haya" (única regla). Una persona que no encontró profesionales
 * de un servicio en su localidad pide que le avisemos. Hay oferta cuando aparece
 * en la búsqueda pública de esa localidad y servicio: perfil activo, servicio
 * activo y cobertura de la localidad (las mismas condiciones que `search`).
 * Se avisa una vez por pedido (in-app y, con eso, push/email como el resto).
 */

/** Hay al menos un profesional visible en la búsqueda de esa localidad y servicio (expresiones SQL). */
export const OFFER_EXISTS_SQL = (cityExpr: string, serviceExpr: string) => `EXISTS (
  SELECT 1 FROM professional_profiles p
   WHERE p.status = 'ACTIVE'
     AND EXISTS (SELECT 1 FROM professional_services ps JOIN services s ON s.id = ps.service_id
                  WHERE ps.professional_id = p.id AND s.active AND s.id = ${serviceExpr})
     AND ${COVERS_LOCALITY_SQL(cityExpr, null)})`;

/** Enlace a la búsqueda de ese servicio en esa localidad (el mismo que arma el front). */
export const demandAlertRoute = (n: DemandAlertNotice | null | undefined): string =>
  n
    ? `/profesionales?servicio=${encodeURIComponent(n.serviceSlug)}&provincia=${encodeURIComponent(n.provinceSlug)}&ciudad=${encodeURIComponent(n.citySlug)}`
    : '/profesionales';

/** ¿Está pendiente el aviso de esta persona para esa localidad y servicio? */
export async function demandAlertActive(
  m: Pick<EntityManager, 'query'>,
  userId: string,
  cityId: string,
  serviceId: string,
): Promise<boolean> {
  const rows = await m.query<unknown[]>(
    `SELECT 1 FROM demand_alerts WHERE user_id = $1 AND city_id = $2 AND service_id = $3 AND notified_at IS NULL`,
    [userId, cityId, serviceId],
  );
  return rows.length > 0;
}

/**
 * Crea (o reactiva) el aviso. Idempotente: pedirlo dos veces deja uno solo.
 * Devuelve false si la localidad o el servicio no existen o no están activos.
 */
export async function requestDemandAlert(
  m: Pick<EntityManager, 'query'>,
  userId: string,
  cityId: string,
  serviceId: string,
): Promise<boolean> {
  const rows = await m.query<unknown[]>(
    `INSERT INTO demand_alerts (user_id, city_id, service_id)
     SELECT $1, c.id, s.id FROM cities c, services s
      WHERE c.id = $2 AND c.active AND s.id = $3 AND s.active
     ON CONFLICT (user_id, city_id, service_id) DO UPDATE
        SET notified_at = NULL,
            created_at = CASE WHEN demand_alerts.notified_at IS NULL THEN demand_alerts.created_at ELSE now() END
     RETURNING id`,
    [userId, cityId, serviceId],
  );
  return rows.length > 0;
}

/** Avisa a quienes esperaban y ya tienen oferta. Devuelve cuántos avisos se crearon. */
export async function sendDemandAlerts(ds: DataSource, now = new Date()): Promise<number> {
  const rows = await ds.query<
    (DemandAlertNotice & { id: string; user_id: string; created_at: Date })[]
  >(
    `SELECT a.id, a.user_id, a.created_at,
            s.name AS "serviceName", s.slug AS "serviceSlug",
            c.name AS "cityName", c.slug AS "citySlug", pr.slug AS "provinceSlug"
       FROM demand_alerts a
       JOIN services s ON s.id = a.service_id AND s.active
       JOIN cities c ON c.id = a.city_id AND c.active
       JOIN provinces pr ON pr.id = c.province_id
      WHERE a.notified_at IS NULL
        AND ${OFFER_EXISTS_SQL('a.city_id', 'a.service_id')}
      ORDER BY a.created_at
      LIMIT 500`,
  );
  let sent = 0;
  for (const r of rows) {
    const done = await ds.transaction(async (m) => {
      const claimed = await m.query<unknown[]>(
        `UPDATE demand_alerts SET notified_at = $2 WHERE id = $1 AND notified_at IS NULL RETURNING id`,
        [r.id, now],
      );
      if (!claimed.length) return false;
      const demandAlert: DemandAlertNotice = {
        serviceName: r.serviceName,
        serviceSlug: r.serviceSlug,
        cityName: r.cityName,
        citySlug: r.citySlug,
        provinceSlug: r.provinceSlug,
      };
      // Un aviso por cada vez que se pidió (reactivarlo renueva `created_at`).
      await notify(
        m,
        {
          userId: r.user_id,
          type: NotificationType.CLIENT_DEMAND_ALERT_MATCHED,
          dedupeRef: `${r.id}:${new Date(r.created_at).getTime()}`,
          payload: { demandAlert },
        },
        null,
      );
      return true;
    });
    if (done) sent++;
  }
  return sent;
}
