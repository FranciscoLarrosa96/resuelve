import { Injectable } from '@nestjs/common';
import { DataSource, In, IsNull } from 'typeorm';
import { completionDueQuery } from '../appointments/completion';
import { AppException } from '../common/errors/app-exception';
import { ProfessionalProfile } from '../professionals/professional-profile.entity';
import { RequestInvitation } from '../requests/request-invitation.entity';
import { ServiceRequest } from '../requests/service-request.entity';
import { Paginated } from '../common/pagination/pagination';
import {
  AUDIENCE_TYPES,
  NOTIFICATION_DESTINATION,
  Notification,
  NotificationAudience,
  NotificationSection,
  NotificationTab,
  NotificationType,
  typesInSection,
} from './notification.entity';
import { NOTIFICATION_VISIBLE_SQL } from './notify';

/** Secciones donde abrir una solicitud/trabajo resuelve la novedad (las demás se leen desde el centro). */
const SECTIONS_READ_WITH_REQUEST: readonly NotificationSection[] = ['REQUESTS', 'AGENDA', 'CLIENT_REQUESTS'];

const VISIBLE = NOTIFICATION_VISIBLE_SQL('n');

/** Una notificación del centro: referencias + datos mínimos. El texto lo arma el frontend por tipo. */
export interface PresentedNotification {
  id: string;
  type: NotificationType;
  requestId: string | null;
  requestTitle: string | null;
  /** Solo en modo cliente: quién mandó el presupuesto / a quién se le puede dejar reseña. */
  professionalName: string | null;
  /** Solo en CLIENT_REVIEW_AVAILABLE: quién marcó el trabajo como realizado. */
  completedBy: 'CLIENT' | 'PROFESSIONAL' | null;
  /** PRO_REFERRAL_ACTIVATED / PRO_BONUS_GRANTED: días de PRO sumados. */
  rewardDays: number | null;
  section: NotificationSection;
  tab: NotificationTab | null;
  /** Destino en la app. Derivado al leer; nunca autoriza nada (cada pantalla revalida la propiedad). */
  route: string;
  createdAt: Date;
  readAt: Date | null;
}

interface NotificationRow {
  id: string;
  type: NotificationType;
  request_id: string | null;
  created_at: Date;
  read_at: Date | null;
  payload: Notification['payload'];
  request_title: string | null;
  completed_by: 'CLIENT' | 'PROFESSIONAL' | null;
  job_id: string | null;
  first_name: string | null;
  last_name: string | null;
}

/**
 * Destino de cada aviso: el lugar más preciso que existe. Sin ruta propia
 * (mensaje viejo, trabajo ya borrado) cae en el listado de su sección.
 */
export function notificationRoute(
  type: NotificationType,
  ref: { requestId: string | null; jobId: string | null },
): string {
  const request = ref.requestId;
  switch (type) {
    case NotificationType.CLIENT_REVIEW_AVAILABLE:
      return request ? `/mis-solicitudes/${request}#resena` : '/mis-solicitudes';
    case NotificationType.CLIENT_QUOTE_RECEIVED:
    case NotificationType.CLIENT_QUOTE_UPDATED:
    case NotificationType.CLIENT_APPOINTMENT_PROPOSED:
    case NotificationType.CLIENT_APPOINTMENT_RESCHEDULED:
    case NotificationType.CLIENT_JOB_SCHEDULED:
    case NotificationType.CLIENT_JOB_RESCHEDULED:
    case NotificationType.CLIENT_JOB_STARTED:
    case NotificationType.CLIENT_JOB_CANCELLED:
      return request ? `/mis-solicitudes/${request}` : '/mis-solicitudes';
    case NotificationType.CLIENT_JOB_CLOSE_DUE:
      return request ? `/mis-solicitudes/${request}` : '/mis-solicitudes';
    case NotificationType.PROFESSIONAL_SELECTED:
    case NotificationType.PRO_APPOINTMENT_CONFIRMED:
    case NotificationType.PRO_JOB_CLOSE_DUE:
      if (ref.jobId) return `/pro/trabajos/${ref.jobId}`;
      return request ? `/pro/solicitudes/${request}` : '/pro/solicitudes';
    case NotificationType.PRO_REQUEST_RECEIVED:
    case NotificationType.PRO_TARGETED_REQUEST_RECEIVED:
    case NotificationType.PRO_APPOINTMENT_DECLINED:
      return request ? `/pro/solicitudes/${request}` : '/pro/solicitudes';
    case NotificationType.PRO_REVIEW_RECEIVED:
      return '/pro/estadisticas#resenas';
    case NotificationType.PRO_REFERRAL_REGISTERED:
    case NotificationType.PRO_REFERRAL_ACTIVATED:
    case NotificationType.PRO_BONUS_GRANTED:
      return '/pro/plan#referidos';
  }
}

export interface ProfessionalSummary {
  /** Todas las novedades sin leer del modo profesional. */
  unread: number;
  completionDue: number;
  /** De `unread`, los recordatorios "¿Se realizó?" (ya cuentan en `completionDue`: el badge del menú no los suma dos veces). */
  closureUnread: number;
  /** Novedades cuya acción está en Solicitudes: total (badge del menú) y por pestaña. */
  requests: { total: number } & Record<NotificationTab, number>;
  /** Novedades cuya acción está en la Agenda (horario confirmado). "Pendiente de cierre" va en `completionDue`. */
  agenda: number;
}

export interface NotificationsSummary {
  client: { unread: number; completionDue: number; closureUnread: number };
  /** `null` si el usuario no tiene perfil profesional. */
  professional: ProfessionalSummary | null;
}

/** Contadores del modo profesional agrupados por destino (`NOTIFICATION_DESTINATION`). */
export function professionalSummary(
  byType: ReadonlyMap<NotificationType, number>,
  completionDue: number,
): ProfessionalSummary {
  const count = (types: readonly NotificationType[]) =>
    types.reduce((sum, t) => sum + (byType.get(t) ?? 0), 0);
  const tab = (key: NotificationTab) =>
    count(typesInSection('REQUESTS').filter((t) => NOTIFICATION_DESTINATION[t].tab === key));
  return {
    unread: count(AUDIENCE_TYPES.PROFESSIONAL),
    completionDue,
    closureUnread: count([NotificationType.PRO_JOB_CLOSE_DUE]),
    requests: {
      total: count(typesInSection('REQUESTS')),
      PENDING: tab('PENDING'),
      QUOTED: tab('QUOTED'),
      SELECTED: tab('SELECTED'),
    },
    agenda: count(typesInSection('AGENDA')),
  };
}

/** Notificaciones in-app del usuario autenticado. Todo filtra por `userId`: nunca se ven las de otro. */
@Injectable()
export class NotificationsService {
  constructor(private readonly dataSource: DataSource) {}

  /** Contadores para los badges (cliente y profesional por separado). */
  async summary(userId: string): Promise<NotificationsSummary> {
    const m = this.dataSource.manager;
    const pro = await m.findOneBy(ProfessionalProfile, { userId });
    const [clientByType, clientDue, proByType, proDue] = await Promise.all([
      this.unreadByType(userId, AUDIENCE_TYPES.CLIENT),
      completionDueQuery(m, { clientId: userId }).getCount(),
      pro ? this.unreadByType(userId, AUDIENCE_TYPES.PROFESSIONAL) : new Map<NotificationType, number>(),
      pro ? completionDueQuery(m, { professionalId: pro.id }).getCount() : 0,
    ]);
    return {
      client: {
        unread: [...clientByType.values()].reduce((a, b) => a + b, 0),
        completionDue: clientDue,
        closureUnread: clientByType.get(NotificationType.CLIENT_JOB_CLOSE_DUE) ?? 0,
      },
      professional: pro ? professionalSummary(proByType, proDue) : null,
    };
  }

  private async unreadByType(userId: string, types: readonly NotificationType[]) {
    const rows: { type: NotificationType; count: string }[] = await this.dataSource.query(
      `SELECT type, count(*) AS count FROM notifications
        WHERE user_id = $1 AND read_at IS NULL AND type = ANY($2::notification_type[])
          AND ${NOTIFICATION_VISIBLE_SQL('notifications')}
        GROUP BY type`,
      [userId, [...types]],
    );
    return new Map(rows.map((r) => [r.type, Number(r.count)]));
  }

  /** Cuántas sin leer tiene en un modo. Un `COUNT` por índice: no carga la lista. */
  async unreadCount(userId: string, audience: NotificationAudience): Promise<number> {
    const [row] = await this.dataSource.query<{ count: string }[]>(
      `SELECT count(*) AS count FROM notifications n
        WHERE n.user_id = $1 AND n.read_at IS NULL AND n.type = ANY($2::notification_type[]) AND ${VISIBLE}`,
      [userId, [...AUDIENCE_TYPES[audience]]],
    );
    return Number(row.count);
  }

  /**
   * Notificaciones de un modo, más nuevas primero, paginadas. Solo
   * referencias + el título del pedido y, en modo cliente, el nombre público
   * del profesional. Una oportunidad demorada no aparece hasta liberarse.
   */
  async list(
    userId: string,
    audience: NotificationAudience,
    opts: { unreadOnly: boolean; page: number; pageSize: number },
  ): Promise<Paginated<PresentedNotification>> {
    const params = [userId, [...AUDIENCE_TYPES[audience]]];
    const where = `n.user_id = $1 AND n.type = ANY($2::notification_type[]) AND ${VISIBLE}
      ${opts.unreadOnly ? 'AND n.read_at IS NULL' : ''}`;
    const [rows, [{ count }]] = await Promise.all([
      this.dataSource.query<NotificationRow[]>(
        `SELECT n.id, n.type, n.request_id, n.created_at, n.read_at, n.payload,
                r.title AS request_title, r.completed_by, j.id AS job_id,
                pu.first_name, pu.last_name
           FROM notifications n
           LEFT JOIN service_requests r ON r.id = n.request_id
           LEFT JOIN jobs j ON j.request_id = n.request_id
           LEFT JOIN quotes q ON q.id = n.quote_id
           LEFT JOIN professional_profiles pp ON pp.id = COALESCE(q.professional_id, r.selected_professional_id)
           LEFT JOIN users pu ON pu.id = pp.user_id
          WHERE ${where}
          ORDER BY n.created_at DESC, n.id DESC
          LIMIT $3 OFFSET $4`,
        [...params, opts.pageSize, (opts.page - 1) * opts.pageSize],
      ),
      this.dataSource.query<{ count: string }[]>(`SELECT count(*) AS count FROM notifications n WHERE ${where}`, params),
    ]);
    return {
      items: rows.map((n) => this.present(n, audience)),
      page: opts.page,
      pageSize: opts.pageSize,
      total: Number(count),
    };
  }

  private present(n: NotificationRow, audience: NotificationAudience): PresentedNotification {
    return {
      id: n.id,
      type: n.type,
      requestId: n.request_id,
      requestTitle: n.request_title,
      professionalName:
        audience === NotificationAudience.CLIENT && n.first_name ? `${n.first_name} ${n.last_name}` : null,
      completedBy: n.type === NotificationType.CLIENT_REVIEW_AVAILABLE ? n.completed_by : null,
      rewardDays: n.payload?.rewardDays ?? null,
      section: NOTIFICATION_DESTINATION[n.type].section,
      tab: NOTIFICATION_DESTINATION[n.type].tab,
      route: notificationRoute(n.type, { requestId: n.request_id, jobId: n.job_id }),
      createdAt: n.created_at,
      readAt: n.read_at,
    };
  }

  /**
   * Abrir una notificación: queda leída (y "abierta", para medir la apertura).
   * Solo las del propio usuario; cualquier otra → 404. Idempotente.
   */
  async markRead(userId: string, id: string) {
    // El driver devuelve [filas, cantidad] en un UPDATE … RETURNING.
    const [rows] = await this.dataSource.query<[{ id: string }[], number]>(
      `UPDATE notifications n
          SET read_at = COALESCE(n.read_at, now()), opened_at = COALESCE(n.opened_at, now())
        WHERE n.id = $1 AND n.user_id = $2 AND ${VISIBLE}
        RETURNING n.id`,
      [id, userId],
    );
    if (!rows.length) throw AppException.notFound('Notificación');
    return this.summary(userId);
  }

  /** "Marcar todas como leídas" del modo pedido (no toca el otro modo). */
  async markAllRead(userId: string, audience: NotificationAudience) {
    await this.dataSource.query(
      `UPDATE notifications n SET read_at = now()
        WHERE n.user_id = $1 AND n.read_at IS NULL AND n.type = ANY($2::notification_type[]) AND ${VISIBLE}`,
      [userId, [...AUDIENCE_TYPES[audience]]],
    );
    return this.summary(userId);
  }

  /**
   * Marca leídas las notificaciones de ESA solicitud para ese usuario y modo
   * (no toca las demás). 404 si la solicitud no es suya en ese modo.
   */
  async markReadByRequest(
    userId: string,
    requestId: string,
    audience: NotificationAudience,
    section?: NotificationSection,
  ) {
    await this.assertAccess(userId, requestId, audience);
    const types = AUDIENCE_TYPES[audience].filter((t) =>
      section
        ? NOTIFICATION_DESTINATION[t].section === section
        : SECTIONS_READ_WITH_REQUEST.includes(NOTIFICATION_DESTINATION[t].section),
    );
    await this.dataSource
      .getRepository(Notification)
      .update({ userId, requestId, readAt: IsNull(), type: In(types) }, { readAt: new Date() });
    return this.summary(userId);
  }

  private async assertAccess(userId: string, requestId: string, audience: NotificationAudience) {
    const m = this.dataSource.manager;
    if (audience === NotificationAudience.CLIENT) {
      if (await m.existsBy(ServiceRequest, { id: requestId, clientId: userId })) return;
    } else {
      const pro = await m.findOneBy(ProfessionalProfile, { userId });
      if (pro && (await m.existsBy(RequestInvitation, { requestId, professionalId: pro.id }))) return;
    }
    throw AppException.notFound('Solicitud');
  }
}
