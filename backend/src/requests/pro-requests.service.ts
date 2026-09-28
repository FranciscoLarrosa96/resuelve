import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { latestAppointments } from '../appointments/appointment.presenter';
import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-codes';
import { Paginated } from '../common/pagination/pagination';
import { ProfessionalProfile } from '../professionals/professional-profile.entity';
import { ProRequestsQueryDto } from './dto/pro-request.dto';
import { RequestInvitation } from './request-invitation.entity';
import { InvitationStatus } from './request.enums';
import { presentRequestForProfessional } from './request.presenter';
import { REQUEST_RELATIONS } from './request.relations';
import { ServiceRequest } from './service-request.entity';
import { NotificationType } from '../notifications/notification.entity';
import { markNotificationsRead } from '../notifications/notify';
import { monthlyQuoteUsage, quoteLimitFor } from '../plans/quote-quota';
import { FunnelEventType } from '../funnel/funnel-event.entity';
import { recordFunnelEvent } from '../funnel/funnel';

type ProRequestView = ReturnType<typeof presentRequestForProfessional>;

/** Solicitudes desde el lado del profesional: solo las que recibió. */
@Injectable()
export class ProRequestsService {
  constructor(
    @InjectRepository(RequestInvitation) private readonly invitations: Repository<RequestInvitation>,
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  async list(pro: ProfessionalProfile, q: ProRequestsQueryDto): Promise<Paginated<ProRequestView>> {
    const [invs, total] = await this.invitations.findAndCount({
      where: { professionalId: pro.id, ...(q.status ? { status: q.status } : {}) },
      order: { sentAt: 'DESC' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    });
    const ids = invs.map((i) => i.requestId);
    const requests = ids.length
      ? await this.dataSource
          .getRepository(ServiceRequest)
          .find({ where: ids.map((id) => ({ id })), relations: REQUEST_RELATIONS })
      : [];
    const byId = new Map(requests.map((r) => [r.id, r]));
    const appointments = await latestAppointments(this.dataSource.manager, ids);
    const blocked = await this.blockedRequestIds(pro, invs);
    for (const requestId of blocked) {
      await recordFunnelEvent(this.dataSource.manager, {
        type: FunnelEventType.FREE_BLOCKED_OPPORTUNITY_VIEWED,
        professionalId: pro.id,
        ref: requestId,
        context: { requestId, billingPlan: 'FREE', entitlementSource: 'FREE' },
      });
    }
    return {
      items: ids.map((id, index) =>
        presentRequestForProfessional(byId.get(id)!, pro.id, appointments.get(id) ?? null, {
          blocked: blocked.has(id),
          targeted: invs[index].targeted,
        }),
      ),
      page: q.page,
      pageSize: q.pageSize,
      total,
    };
  }

  async get(pro: ProfessionalProfile, id: string): Promise<ProRequestView> {
    const request = await this.findInvited(pro, id);
    const appointments = await latestAppointments(this.dataSource.manager, [id]);
    const invitation = request.invitations.find((inv) => inv.professionalId === pro.id)!;
    const blocked = (await this.blockedRequestIds(pro, [invitation])).has(id);
    if (blocked) {
      await recordFunnelEvent(this.dataSource.manager, {
        type: FunnelEventType.FREE_BLOCKED_OPPORTUNITY_VIEWED,
        professionalId: pro.id,
        ref: id,
        context: { requestId: id, billingPlan: 'FREE', entitlementSource: 'FREE' },
      });
    }
    return presentRequestForProfessional(request, pro.id, appointments.get(id) ?? null, {
      blocked,
      targeted: invitation.targeted,
    });
  }

  async decline(pro: ProfessionalProfile, id: string): Promise<ProRequestView> {
    await this.dataSource.transaction(async (m) => {
      const inv = await m.findOne(RequestInvitation, {
        where: { requestId: id, professionalId: pro.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!inv) throw AppException.notFound('Solicitud');
      if (inv.status !== InvitationStatus.PENDING) {
        throw AppException.conflict(
          ErrorCode.INVALID_REQUEST_STATE,
          'Solo se puede rechazar una solicitud sin responder',
          { invitationStatus: inv.status },
        );
      }
      await m.update(RequestInvitation, inv.id, {
        status: InvitationStatus.DECLINED,
        respondedAt: new Date(),
      });
      await markNotificationsRead(m, {
        userId: pro.userId,
        requestId: id,
        types: [NotificationType.PRO_REQUEST_RECEIVED],
      });
    });
    return this.get(pro, id);
  }

  /** 404 si el profesional no fue invitado: no puede ver solicitudes ajenas. */
  private async findInvited(pro: ProfessionalProfile, id: string): Promise<ServiceRequest> {
    const request = await this.dataSource
      .getRepository(ServiceRequest)
      .findOne({ where: { id }, relations: REQUEST_RELATIONS });
    if (!request || !request.invitations.some((inv) => inv.professionalId === pro.id))
      throw AppException.notFound('Solicitud');
    return request;
  }

  /** Backend-authoritative: antes del presenter, para que la API tampoco filtre PII. */
  private async blockedRequestIds(
    pro: ProfessionalProfile,
    invitations: RequestInvitation[],
  ): Promise<Set<string>> {
    const limit = quoteLimitFor(pro, this.config);
    if (limit === null || (await monthlyQuoteUsage(this.dataSource.manager, pro.id)) < limit) return new Set();
    const candidates = invitations.filter((i) => !i.targeted && i.status === InvitationStatus.PENDING);
    if (!candidates.length) return new Set();
    const rows = await this.dataSource.manager.query<{ request_id: string }[]>(
      `SELECT DISTINCT request_id FROM quotes WHERE professional_id = $1 AND request_id = ANY($2::uuid[])`,
      [pro.id, candidates.map((i) => i.requestId)],
    );
    const previouslyQuoted = new Set(rows.map((r) => r.request_id));
    return new Set(candidates.map((i) => i.requestId).filter((id) => !previouslyQuoted.has(id)));
  }
}
