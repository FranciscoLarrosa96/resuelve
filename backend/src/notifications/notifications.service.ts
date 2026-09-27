import { Injectable } from '@nestjs/common';
import { DataSource, In, IsNull } from 'typeorm';
import { completionDueQuery } from '../appointments/completion';
import { AppException } from '../common/errors/app-exception';
import { ProfessionalProfile } from '../professionals/professional-profile.entity';
import { RequestInvitation } from '../requests/request-invitation.entity';
import { ServiceRequest } from '../requests/service-request.entity';
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

/** Cuántas notificaciones devuelve la lista (no es un centro de notificaciones). */
const LIST_LIMIT = 50;

export interface ProfessionalSummary {
  /** Todas las novedades sin leer del modo profesional. */
  unread: number;
  completionDue: number;
  /** Novedades cuya acción está en Solicitudes: total (badge del menú) y por pestaña. */
  requests: { total: number } & Record<NotificationTab, number>;
  /** Novedades cuya acción está en la Agenda (horario confirmado). "Pendiente de cierre" va en `completionDue`. */
  agenda: number;
}

export interface NotificationsSummary {
  client: { unread: number; completionDue: number };
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
    const unread = (audience: NotificationAudience) =>
      m.countBy(Notification, { userId, readAt: IsNull(), type: In([...AUDIENCE_TYPES[audience]]) });
    const [clientUnread, clientDue, proByType, proDue] = await Promise.all([
      unread(NotificationAudience.CLIENT),
      completionDueQuery(m, { clientId: userId }).getCount(),
      pro ? this.unreadByType(userId, AUDIENCE_TYPES.PROFESSIONAL) : new Map<NotificationType, number>(),
      pro ? completionDueQuery(m, { professionalId: pro.id }).getCount() : 0,
    ]);
    return {
      client: { unread: clientUnread, completionDue: clientDue },
      professional: pro ? professionalSummary(proByType, proDue) : null,
    };
  }

  private async unreadByType(userId: string, types: readonly NotificationType[]) {
    const rows: { type: NotificationType; count: string }[] = await this.dataSource.query(
      `SELECT type, count(*) AS count FROM notifications
        WHERE user_id = $1 AND read_at IS NULL AND type = ANY($2::notification_type[])
        GROUP BY type`,
      [userId, [...types]],
    );
    return new Map(rows.map((r) => [r.type, Number(r.count)]));
  }

  /**
   * Últimas notificaciones de un modo. Solo referencias + el título del
   * pedido y, en un presupuesto, el nombre público del profesional.
   */
  async list(userId: string, audience: NotificationAudience, unreadOnly: boolean) {
    const rows = await this.dataSource.getRepository(Notification).find({
      where: {
        userId,
        type: In([...AUDIENCE_TYPES[audience]]),
        ...(unreadOnly ? { readAt: IsNull() } : {}),
      },
      relations: { request: true },
      order: { createdAt: 'DESC', id: 'DESC' },
      take: LIST_LIMIT,
    });
    const names = await this.quoteAuthors(rows.map((n) => n.quoteId).filter((id): id is string => !!id));
    return rows.map((n) => ({
      id: n.id,
      type: n.type,
      requestId: n.requestId,
      requestTitle: n.request.title,
      section: NOTIFICATION_DESTINATION[n.type].section,
      tab: NOTIFICATION_DESTINATION[n.type].tab,
      professionalName: n.quoteId ? (names.get(n.quoteId) ?? null) : null,
      createdAt: n.createdAt,
      readAt: n.readAt,
    }));
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
    const types = AUDIENCE_TYPES[audience].filter(
      (t) => !section || NOTIFICATION_DESTINATION[t].section === section,
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

  /** Nombre público (nombre y apellido) de quien mandó cada presupuesto, como en la solicitud. */
  private async quoteAuthors(quoteIds: string[]): Promise<Map<string, string>> {
    if (!quoteIds.length) return new Map();
    const rows: { id: string; first_name: string; last_name: string }[] = await this.dataSource.query(
      `SELECT q.id, u.first_name, u.last_name
         FROM quotes q
         JOIN professional_profiles p ON p.id = q.professional_id
         JOIN users u ON u.id = p.user_id
        WHERE q.id = ANY($1)`,
      [quoteIds],
    );
    return new Map(rows.map((r) => [r.id, `${r.first_name} ${r.last_name}`]));
  }
}
