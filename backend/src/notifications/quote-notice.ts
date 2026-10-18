import { QUOTABLE_STATUSES } from '../requests/request-state-machine';

/**
 * Se evalúa al reclamar el envío (alias notifications = n), con el reloj de PostgreSQL.
 * No cambia la historia in-app: solo evita anunciar una propuesta que ya no se puede elegir.
 * Los demás tipos conservan sus reglas. Usa los estados abiertos compartidos con presupuestos.
 */
export const QUOTE_NOTICE_ACTIONABLE_SQL = `(n.type NOT IN ('CLIENT_QUOTE_RECEIVED', 'CLIENT_QUOTE_UPDATED') OR EXISTS (
  SELECT 1 FROM quotes q JOIN service_requests r ON r.id = q.request_id
   WHERE q.id = n.quote_id AND q.request_id = n.request_id AND r.client_id = n.user_id
     AND q.status = 'PENDING' AND (q.valid_until IS NULL OR q.valid_until > now())
     AND r.status IN (${QUOTABLE_STATUSES.map((status) => `'${status}'`).join(', ')})))`;
