/** Eventos del embudo PRO que informa el frontend (el resto lo registra el backend en la acción real). */
export type FunnelEventType = 'PRO_PLAN_VIEWED' | 'PRO_CTA_CLICKED';

/** Dónde pasó. Misma lista que el backend (`FUNNEL_SURFACES`). */
export type FunnelSurface =
  | 'PLAN_PAGE'
  | 'REQUESTS_USAGE'
  | 'LIMIT_MODAL'
  | 'BLOCKED_OPPORTUNITY'
  | 'FIRST_SUCCESS'
  | 'MONTH'
  | 'PROFILE'
  | 'EARLY_ACCESS';
