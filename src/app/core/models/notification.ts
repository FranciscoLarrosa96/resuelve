import { billingDate } from '../utils/billing-copy';

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
  | 'CLIENT_QUESTION_RECEIVED'
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
  | 'PRO_BONUS_GRANTED'
  | 'PRO_TRANSFER_APPROVED'
  | 'PRO_TRANSFER_REJECTED'
  | 'PRO_TRANSFER_EXPIRING'
  | 'PRO_QUESTION_ANSWERED'
  | 'PRO_WEEKLY_SUMMARY'
  | 'PRO_SERVICE_SUGGESTION_APPROVED'
  | 'PRO_SERVICE_SUGGESTION_REJECTED'
  | 'PRO_PLAN_CHANGE_SCHEDULED'
  | 'PRO_PLAN_CHANGE_ACTIVATED'
  | 'PRO_TRANSFER_WITHDRAWAL_RESOLVED';

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
  /** PRO_REQUEST_RECEIVED: a un PRO le llegó antes que a un perfil Free demorado en esa misma solicitud. */
  aheadOfFree?: boolean;
  /** PRO_WEEKLY_SUMMARY: lo que pasó en su perfil la semana anterior (nunca todo en cero). */
  weekly?: WeeklySummary | null;
  /** PRO_SERVICE_SUGGESTION_*: cómo se resolvió el oficio que sugirió. */
  suggestion?: ServiceSuggestionNotice | null;
  /** PRO_PLAN_CHANGE_*: plan, medio y fecha de inicio (nunca montos). */
  planChange?: PlanChangeNotice | null;
  /** PRO_TRANSFER_WITHDRAWAL_RESOLVED: código y fechas nuevas de los pagos reajustados (nunca montos). */
  withdrawalResolved?: WithdrawalResolvedNotice | null;
  section: NotificationSection;
  tab: NotificationTab | null;
  /** Destino en la app (lo deriva el backend). Cada pantalla revalida la propiedad. */
  route: string;
  createdAt: string;
  readAt: string | null;
}

/**
 * Cambio programado a PRO. `startsAt`: en transferencia, cuándo empieza el período; en Mercado Pago,
 * el próximo cobro PREVISTO (Plus rige recién cuando ese cobro figure aprobado).
 */
export interface PlanChangeNotice {
  tier: 'PRO_PLUS';
  via: 'TRANSFER' | 'MERCADO_PAGO';
  startsAt: string | null;
}

/** Arrepentimiento por transferencia resuelto: `changes` = pagos posteriores cuyas fechas se adelantaron. */
export interface WithdrawalResolvedNotice {
  reference: string;
  changes: { reference: string; tier: 'PRO' | 'PRO_PLUS'; startsAt: string; endsAt: string }[];
}

/** Resolución de un oficio sugerido (lo arma el backend; sin PII). */
export interface ServiceSuggestionNotice {
  /** Lo que escribió el profesional. */
  name: string;
  /** Oficio del catálogo con el que quedó (aprobada). */
  serviceName?: string;
  /** Se vinculó con un oficio que ya existía. */
  linked?: boolean;
  /** Se sumó solo a sus servicios (su perfil no tenía ninguno). */
  attached?: boolean;
  /** Con eso, su perfil quedó publicado. */
  published?: boolean;
  /** Rechazada: el motivo. */
  reason?: string;
}

/**
 * Qué decimos de un oficio sugerido ya resuelto, según lo que pasó con el perfil. La acción
 * (`route`) la define el backend: panel si quedó publicado, "Servicios" si falta algo.
 */
export function suggestionNoticeText(s: ServiceSuggestionNotice | null | undefined, approved: boolean): { title: string; detail: string } {
  const name = s?.name ? `“${s.name}”` : 'tu oficio';
  if (!approved) {
    const reason = s?.reason ? ` Motivo: ${s.reason}` : '';
    return {
      title: 'No aprobamos tu oficio',
      detail: `No aprobamos ${name}.${reason} Podés corregir el nombre y volver a sugerirlo, o elegir otro oficio de la lista desde Mis servicios.`,
    };
  }
  const service = s?.serviceName ? `“${s.serviceName}”` : 'el catálogo';
  const as = s?.linked ? `Lo vinculamos con ${service}, que ya estaba en Resuelve.` : `Lo sumamos al catálogo como ${service}.`;
  if (s?.attached && s.published) return { title: 'Aprobamos tu oficio', detail: `${as} Ya está en tu perfil y tu perfil está publicado.` };
  if (s?.attached) return { title: 'Aprobamos tu oficio', detail: `${as} Ya está en tu perfil, pero todavía falta algo para publicarlo: revisalo en Mi perfil.` };
  return { title: 'Aprobamos tu oficio', detail: `${as} Sumalo a tus servicios desde Mi perfil para empezar a recibir solicitudes de ese oficio.` };
}

/** Acción visible de un aviso de oficio sugerido (el destino lo define el backend en `route`). */
export function notificationAction(n: Pick<AppNotification, 'type'> & Partial<Pick<AppNotification, 'suggestion'>>): string | null {
  if (n.type === 'PRO_SERVICE_SUGGESTION_REJECTED') return 'Elegir otro oficio';
  if (n.type !== 'PRO_SERVICE_SUGGESTION_APPROVED') return null;
  if (n.suggestion?.attached && n.suggestion.published) return 'Ir a mi panel';
  return n.suggestion?.attached ? 'Revisar mi perfil' : 'Sumarlo a mis servicios';
}

/** Conteos del resumen semanal de PRO (semana anterior, lunes a domingo). */
export interface WeeklySummary {
  featured: number;
  early: number;
  views: number;
}

/**
 * "12 apariciones en Destacados, 2 solicitudes antes que Free y 30 visitas a tu perfil":
 * solo lo que pasó (sin ceros), sin decir que PRO lo causó.
 */
export function weeklySummaryText(w: WeeklySummary | null | undefined): string {
  if (!w) return 'Mirá lo que pasó en tu perfil.';
  const parts: string[] = [];
  const add = (n: number, one: string, many: string) => {
    if (n > 0) parts.push(`${n} ${n === 1 ? one : many}`);
  };
  add(w.featured, 'aparición en Destacados', 'apariciones en Destacados');
  add(w.early, 'solicitud antes que los perfiles Free', 'solicitudes antes que los perfiles Free');
  add(w.views, 'visita a tu perfil', 'visitas a tu perfil');
  if (!parts.length) return 'Mirá lo que pasó en tu perfil.';
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`;
  return `La semana pasada: ${list}.`;
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
  Partial<Pick<AppNotification, 'requestTitle' | 'completedBy' | 'rewardDays' | 'aheadOfFree' | 'weekly' | 'suggestion' | 'planChange' | 'withdrawalResolved'>>;

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
    case 'CLIENT_QUESTION_RECEIVED':
      return { title: 'Te hicieron una consulta', detail: `Un profesional necesita un dato sobre ${t} para presupuestar.` };
    case 'PROFESSIONAL_SELECTED':
      return { title: 'Te eligieron', detail: `Te eligieron para ${t}. Tenés un trabajo para coordinar.` };
    case 'PRO_APPOINTMENT_CONFIRMED':
      return { title: 'Horario confirmado', detail: 'El cliente confirmó la fecha.' };
    case 'PRO_APPOINTMENT_DECLINED':
      return { title: 'Necesitan otro horario', detail: 'El cliente no puede en la fecha propuesta.' };
    case 'PRO_REQUEST_RECEIVED':
      return {
        title: 'Nueva solicitud',
        detail: n.aheadOfFree
          ? 'Un cliente pidió presupuesto. Te llegó antes que a los perfiles Free.'
          : 'Un cliente te pidió presupuesto.',
      };
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
    case 'PRO_TRANSFER_APPROVED':
      return { title: 'Confirmamos tu pago', detail: 'Ya tenés Resuelve PRO. Mirá hasta cuándo en Mi plan.' };
    case 'PRO_TRANSFER_REJECTED':
      return { title: 'No pudimos confirmar tu pago', detail: 'Revisá el motivo en Mi plan y volvé a avisarnos.' };
    case 'PRO_TRANSFER_EXPIRING':
      return { title: 'Tu PRO vence pronto', detail: 'No se renueva solo. Podés renovarlo desde Mi plan.' };
    case 'PRO_QUESTION_ANSWERED':
      return { title: 'Te respondieron', detail: `El cliente respondió tu consulta sobre ${t}. Ya podés presupuestar.` };
    case 'PRO_WEEKLY_SUMMARY':
      return { title: 'Tu semana con PRO', detail: weeklySummaryText(n.weekly) };
    case 'PRO_SERVICE_SUGGESTION_APPROVED':
      return suggestionNoticeText(n.suggestion, true);
    case 'PRO_SERVICE_SUGGESTION_REJECTED':
      return suggestionNoticeText(n.suggestion, false);
    case 'PRO_PLAN_CHANGE_SCHEDULED':
      return planChangeScheduledText(n.planChange);
    case 'PRO_PLAN_CHANGE_ACTIVATED':
      return { title: 'Ya tenés PRO', detail: 'Tu período pago ya está vigente. Mirá los detalles de tu plan en Mi plan.' };
    case 'PRO_TRANSFER_WITHDRAWAL_RESOLVED':
      return withdrawalResolvedText(n.withdrawalResolved);
  }
}

/** Arrepentimiento resuelto: la devolución y, solo si cambiaron, las fechas nuevas de tus otros pagos. */
export function withdrawalResolvedText(w: WithdrawalResolvedNotice | null | undefined): { title: string; detail: string } {
  const code = w?.reference ? ` (código ${w.reference})` : '';
  const base = `Resolvimos tu arrepentimiento${code}: te devolvemos el total de ese pago por transferencia.`;
  const changes = w?.changes ?? [];
  if (!changes.length) return { title: 'Resolvimos tu arrepentimiento', detail: `${base} Las fechas de tus otros pagos no cambian.` };
  const moved = changes
    .map((c) => `PRO (${c.reference}): del ${billingDate(c.startsAt)} al ${billingDate(c.endsAt)}`)
    .join('; ');
  return { title: 'Resolvimos tu arrepentimiento', detail: `${base} Se adelantaron tus otros pagos, con los mismos días que pagaste: ${moved}.` };
}

/**
 * Cambio programado: lo que se sabe y lo que no. En transferencia la fecha es la del período confirmado; en
 * Mercado Pago es el próximo cobro PREVISTO, y Plus rige recién cuando ese cobro figure aprobado.
 */
export function planChangeScheduledText(c: PlanChangeNotice | null | undefined): { title: string; detail: string } {
  const date = c?.startsAt ? billingDate(c.startsAt) : null;
  if (c?.via === 'MERCADO_PAGO') {
    return {
      title: 'Programamos tu próximo período de PRO',
      detail: date
        ? `Seguís con PRO. El importe acordado rige desde tu próximo cobro, previsto para el ${date}; rige cuando ese cobro figure aprobado.`
        : 'Seguís con PRO. El importe acordado rige desde tu próximo cobro; rige cuando ese cobro figure aprobado.',
    };
  }
  return {
    title: 'Programamos tu próximo período de PRO',
    detail: date
      ? `Seguís con PRO hasta el ${date}. Ese día empieza tu período de PRO.`
      : 'Seguís con PRO hasta que termine tu período pago. Después empieza tu período de PRO.',
  };
}

/** Toast: "Nuevo presupuesto para “Problema eléctrico”." */
export function notificationToast(
  n: Pick<AppNotification, 'type' | 'requestTitle'> & Partial<Pick<AppNotification, 'rewardDays' | 'aheadOfFree'>>,
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
      return n.aheadOfFree ? `Nueva solicitud: ${title}. Te llegó antes que a los perfiles Free.` : `Nueva solicitud: ${title}.`;
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
    case 'PRO_TRANSFER_APPROVED':
      return 'Confirmamos tu pago: ya tenés Resuelve PRO.';
    case 'PRO_TRANSFER_REJECTED':
      return 'No pudimos confirmar tu pago por transferencia.';
    case 'PRO_TRANSFER_EXPIRING':
      return 'Tu Resuelve PRO vence pronto.';
    case 'CLIENT_QUESTION_RECEIVED':
      return `Te hicieron una consulta sobre ${title}.`;
    case 'PRO_QUESTION_ANSWERED':
      return `Respondieron tu consulta sobre ${title}.`;
    case 'PRO_WEEKLY_SUMMARY':
      return 'Tu semana con PRO: mirá lo que pasó en tu perfil.';
    case 'PRO_SERVICE_SUGGESTION_APPROVED':
      return 'Aprobamos el oficio que sugeriste.';
    case 'PRO_SERVICE_SUGGESTION_REJECTED':
      return 'No aprobamos el oficio que sugeriste.';
    case 'PRO_PLAN_CHANGE_SCHEDULED':
      return 'Programamos tu próximo período de PRO.';
    case 'PRO_PLAN_CHANGE_ACTIVATED':
      return 'Ya tenés PRO.';
    case 'PRO_TRANSFER_WITHDRAWAL_RESOLVED':
      return 'Resolvimos tu arrepentimiento.';
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
