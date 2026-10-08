/**
 * Notificaciones in-app (GET /me/notifications…). Solo eventos que le piden
 * a la otra persona que vea o haga algo; nunca la propia acción.
 */
export type NotificationAudience = 'CLIENT' | 'PROFESSIONAL';

export type NotificationType =
  | 'CLIENT_QUOTE_RECEIVED'
  | 'CLIENT_QUOTE_UPDATED'
  | 'CLIENT_APPOINTMENT_PROPOSED'
  | 'CLIENT_APPOINTMENT_RESCHEDULED'
  | 'CLIENT_JOB_SCHEDULED'
  | 'CLIENT_JOB_RESCHEDULED'
  | 'CLIENT_JOB_STARTED'
  | 'CLIENT_JOB_CANCELLED'
  | 'CLIENT_REVIEW_AVAILABLE'
  | 'CLIENT_JOB_CLOSE_DUE'
  | 'PROFESSIONAL_SELECTED'
  | 'PRO_APPOINTMENT_CONFIRMED'
  | 'PRO_APPOINTMENT_DECLINED'
  | 'PRO_REQUEST_RECEIVED'
  | 'PRO_TARGETED_REQUEST_RECEIVED'
  | 'PRO_JOB_CLOSE_DUE'
  | 'PRO_JOB_COMPLETED'
  | 'PRO_REVIEW_RECEIVED'
  | 'PRO_REFERRAL_REGISTERED'
  | 'PRO_REFERRAL_ACTIVATED'
  | 'PRO_BONUS_GRANTED';

/** Dónde está la acción de la novedad (lo decide el backend: `NOTIFICATION_DESTINATION`). */
export type NotificationSection = 'REQUESTS' | 'AGENDA' | 'CLIENT_REQUESTS' | 'PLAN' | 'PROFILE' | 'CLOSURE';
/** Pestaña de /pro/solicitudes (mismos valores que `ProRequestsTab`, sin "Todas"). */
export type NotificationTab = 'PENDING' | 'QUOTED' | 'SELECTED';

export interface AppNotification {
  id: string;
  type: NotificationType;
  /** Null solo en los avisos de referidos. */
  requestId: string | null;
  /** Título del pedido (sin dirección, teléfono ni descripción). */
  requestTitle: string | null;
  /** Solo en modo cliente: quién mandó el presupuesto / a quién se le puede dejar reseña. */
  professionalName: string | null;
  /** Solo en CLIENT_REVIEW_AVAILABLE. */
  completedBy?: 'CLIENT' | 'PROFESSIONAL' | null;
  /** Días de PRO de un referido activado o de un bonus. */
  rewardDays?: number | null;
  section: NotificationSection;
  tab: NotificationTab | null;
  /** Destino en la app (lo deriva el backend). Cada pantalla revalida la propiedad. */
  route: string;
  createdAt: string;
  readAt: string | null;
}

/** GET /me/notifications: paginado (20 por página). */
export interface NotificationsPage {
  items: AppNotification[];
  page: number;
  pageSize: number;
  total: number;
}

export interface NotificationsSummary {
  client: {
    unread: number;
    completionDue: number;
    /** De `unread`, los recordatorios "¿Se realizó?" (ya cuentan en `completionDue`). */
    closureUnread?: number;
  };
  /** `null` sin perfil profesional. */
  professional: {
    unread: number;
    completionDue: number;
    closureUnread?: number;
    /** Novedades de Solicitudes: total (badge del menú) y por pestaña. */
    requests: { total: number } & Record<NotificationTab, number>;
    /** Novedades de la Agenda (horario confirmado). "Pendiente de cierre" va aparte en `completionDue`. */
    agenda: number;
  } | null;
}

type CopySource = Pick<AppNotification, 'type' | 'professionalName'> &
  Partial<Pick<AppNotification, 'requestTitle' | 'completedBy' | 'rewardDays'>>;

const quoted = (title: string | null | undefined) => (title ? `“${title}”` : 'tu pedido');
const days = (n: number | null | undefined) => (n === 1 ? '1 día' : `${n ?? 15} días`);

/** Copy de cada evento: título corto + detalle (manual de marca, sin alarmismo ni signos de exclamación). */
export function notificationCopy(n: CopySource): { title: string; detail: string } {
  const t = quoted(n.requestTitle);
  const pro = n.professionalName ?? 'El profesional';
  switch (n.type) {
    case 'CLIENT_QUOTE_RECEIVED':
      return {
        title: 'Nuevo presupuesto',
        detail: n.professionalName ? `${n.professionalName} te envió un presupuesto.` : 'Recibiste un presupuesto.',
      };
    case 'CLIENT_QUOTE_UPDATED':
      return { title: 'Presupuesto actualizado', detail: `${pro} actualizó su presupuesto para ${t}.` };
    case 'CLIENT_APPOINTMENT_PROPOSED':
      return { title: 'Nuevo horario propuesto', detail: 'El profesional propuso una fecha para tu trabajo.' };
    case 'CLIENT_APPOINTMENT_RESCHEDULED':
      return { title: 'Nuevo horario propuesto', detail: 'El profesional propuso otra fecha para tu trabajo.' };
    case 'CLIENT_JOB_SCHEDULED':
      return { title: 'Trabajo agendado', detail: `${t} quedó agendado. Revisá la fecha.` };
    case 'CLIENT_JOB_RESCHEDULED':
      return { title: 'Trabajo reprogramado', detail: `Cambió la fecha de ${t}. Revisala.` };
    case 'CLIENT_JOB_STARTED':
      return { title: 'Trabajo iniciado', detail: `${pro} empezó ${t}.` };
    case 'CLIENT_JOB_CANCELLED':
      return { title: 'Trabajo cancelado', detail: `${pro} canceló ${t}.` };
    case 'CLIENT_REVIEW_AVAILABLE':
      return {
        title: 'Podés dejar una reseña',
        detail:
          n.completedBy === 'PROFESSIONAL'
            ? `${pro} marcó ${t} como realizado. Contanos cómo salió.`
            : `Contanos cómo salió ${t}.`,
      };
    case 'CLIENT_JOB_CLOSE_DUE':
      return { title: '¿Se realizó el trabajo?', detail: `Ya pasó el horario de ${t}. Confirmalo o pedí reprogramar.` };
    case 'PROFESSIONAL_SELECTED':
      return { title: 'Te eligieron', detail: `Te eligieron para ${t}. Tenés un trabajo para coordinar.` };
    case 'PRO_APPOINTMENT_CONFIRMED':
      return { title: 'Horario confirmado', detail: 'El cliente confirmó la fecha.' };
    case 'PRO_APPOINTMENT_DECLINED':
      return { title: 'Necesitan otro horario', detail: 'El cliente no puede en la fecha propuesta.' };
    case 'PRO_REQUEST_RECEIVED':
      return { title: 'Nueva solicitud', detail: 'Un cliente te pidió presupuesto.' };
    case 'PRO_TARGETED_REQUEST_RECEIVED':
      return { title: 'Te pidieron presupuesto', detail: `Un cliente te eligió a vos para ${t}.` };
    case 'PRO_JOB_CLOSE_DUE':
      return { title: '¿Se realizó el trabajo?', detail: `Ya pasó el horario de ${t}. Marcalo como realizado o reprogramá.` };
    case 'PRO_JOB_COMPLETED':
      return { title: 'Trabajo realizado', detail: `El cliente marcó ${t} como realizado. Pedile una reseña.` };
    case 'PRO_REVIEW_RECEIVED':
      return { title: 'Recibiste una nueva reseña', detail: 'Un cliente dejó su opinión sobre tu trabajo.' };
    case 'PRO_REFERRAL_REGISTERED':
      return { title: 'Alguien se registró con tu invitación', detail: 'Apenas arme su perfil profesional, sumás días de PRO.' };
    case 'PRO_REFERRAL_ACTIVATED':
      return {
        title: 'Un colega se sumó con tu enlace',
        detail: n.rewardDays ? `Sumaste ${days(n.rewardDays)} de PRO.` : 'Ya armó su perfil en Resuelve.',
      };
    case 'PRO_BONUS_GRANTED':
      return { title: 'Sumaste días de PRO', detail: `Tu invitación te dio ${days(n.rewardDays)} de PRO.` };
  }
}

/** Toast: "Nuevo presupuesto para “Problema eléctrico”." */
export function notificationToast(
  n: Pick<AppNotification, 'type' | 'requestTitle'> & Partial<Pick<AppNotification, 'rewardDays'>>,
): string {
  const title = quoted(n.requestTitle);
  switch (n.type) {
    case 'CLIENT_QUOTE_RECEIVED':
      return `Nuevo presupuesto para ${title}.`;
    case 'CLIENT_QUOTE_UPDATED':
      return `Actualizaron un presupuesto de ${title}.`;
    case 'CLIENT_APPOINTMENT_PROPOSED':
    case 'CLIENT_APPOINTMENT_RESCHEDULED':
      return `Nuevo horario propuesto para ${title}.`;
    case 'CLIENT_JOB_SCHEDULED':
      return `${title} quedó agendado.`;
    case 'CLIENT_JOB_RESCHEDULED':
      return `Cambió la fecha de ${title}.`;
    case 'CLIENT_JOB_STARTED':
      return `Empezó ${title}.`;
    case 'CLIENT_JOB_CANCELLED':
      return `Cancelaron ${title}.`;
    case 'CLIENT_REVIEW_AVAILABLE':
      return `Podés dejar una reseña de ${title}.`;
    case 'CLIENT_JOB_CLOSE_DUE':
    case 'PRO_JOB_CLOSE_DUE':
      return `¿Se realizó ${title}? Confirmalo.`;
    case 'PROFESSIONAL_SELECTED':
      return `Te eligieron para ${title}.`;
    case 'PRO_APPOINTMENT_CONFIRMED':
      return `El cliente confirmó el horario de ${title}.`;
    case 'PRO_APPOINTMENT_DECLINED':
      return `Necesitan otro horario para ${title}.`;
    case 'PRO_REQUEST_RECEIVED':
      return `Nueva solicitud: ${title}.`;
    case 'PRO_TARGETED_REQUEST_RECEIVED':
      return `Te pidieron presupuesto: ${title}.`;
    case 'PRO_JOB_COMPLETED':
      return `${title} quedó realizado. Pedile una reseña.`;
    case 'PRO_REVIEW_RECEIVED':
      return 'Recibiste una nueva reseña.';
    case 'PRO_REFERRAL_REGISTERED':
      return 'Alguien se registró con tu invitación.';
    case 'PRO_REFERRAL_ACTIVATED':
      return 'Un colega se sumó con tu enlace.';
    case 'PRO_BONUS_GRANTED':
      return `Sumaste ${days(n.rewardDays)} de PRO.`;
  }
}

/** Novedad más relevante de una solicitud (para su tarjeta). null = nada nuevo. */
export function requestNews(items: readonly Pick<AppNotification, 'type'>[]): string | null {
  const quotes = items.filter((n) => n.type === 'CLIENT_QUOTE_RECEIVED').length;
  if (quotes > 1) return `${quotes} presupuestos nuevos`;
  if (quotes === 1) return 'Nuevo presupuesto';
  const latest = items[0];
  return latest ? notificationCopy({ type: latest.type, professionalName: null }).title : null;
}

/** "9+" como tope visual del badge de la campana. */
export function bellBadge(count: number): string {
  return count > 9 ? '9+' : String(count);
}
