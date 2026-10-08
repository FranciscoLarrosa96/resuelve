import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, LessThan, Repository } from 'typeorm';
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
import { PRO_NEW_REQUEST_TYPES } from '../notifications/notification.entity';
import { markNotificationsRead } from '../notifications/notify';
import { freeQuoteUsage, quoteLimitFor } from '../plans/quote-quota';
import { FunnelEventType } from '../funnel/funnel-event.entity';
import { recordFunnelEvent } from '../funnel/funnel';
import { Quote } from '../quotes/quote.entity';
import { QuoteStatus } from '../quotes/quote.enums';
import { presentQuote } from '../quotes/quote.presenter';
import { effectiveOpportunityAvailableAt, isActionableOpportunity } from './opportunity-access';
import { jobSummaries } from '../jobs/job-summary';
import { Review } from '../reviews/review.entity';

type ProRequestView = ReturnType<typeof presentRequestForProfessional> & {
  ownQuote?: ReturnType<typeof presentQuote> | null;
  /** Solo en el detalle del elegido: el cliente ya reseñó este trabajo (no se le vuelve a pedir). */
  clientReviewed?: boolean;
};

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
    const jobs = await jobSummaries(this.dataSource.manager, ids, pro.id);
    const blocked = await this.blockedRequestIds(pro, invs);
    const now = new Date();
    const maxActiveQuotes = this.config.get<number>('MAX_ACTIVE_QUOTES_PER_REQUEST', 5);
    const quoteState = await this.quoteState(ids, pro.id, now);
    for (const requestId of blocked) {
      await recordFunnelEvent(this.dataSource.manager, {
        type: FunnelEventType.FREE_BLOCKED_OPPORTUNITY_VIEWED,
        professionalId: pro.id,
        ref: requestId,
        context: { requestId, billingPlan: 'FREE', entitlementSource: 'FREE' },
      });
    }
    const items = await Promise.all(ids.map(async (id, index) => {
      const invitation = invs[index];
      const request = byId.get(id)!;
      const availableAt = effectiveOpportunityAvailableAt({
        sentAt: invitation.sentAt,
        availableAt: invitation.availableAt,
        targeted: invitation.targeted,
        delayEnabled: this.config.get<boolean>('PRO_EARLY_OPPORTUNITIES', true),
      });
      const count = quoteState.counts.get(id) ?? 0;
      const blockedByQuota = blocked.has(id);
      const actionable = isActionableOpportunity({
        requestStatus: request.status,
        invitationStatus: invitation.status,
        targeted: invitation.targeted,
        availableAt,
        activeQuoteCount: count,
        maxActiveQuotes,
        blockedByFreeQuota: blockedByQuota,
        ownActiveQuote: quoteState.ownActive.has(id),
        now,
      });
      const delayed = now < availableAt;
      await this.recordUnlockedIfNeeded(pro, invitation, request.id, availableAt, now);
      return presentRequestForProfessional(request, pro.id, appointments.get(id) ?? null, {
        blocked: blockedByQuota,
        delayed,
        targeted: invitation.targeted,
        availableAt,
        actionable,
        activeQuoteCount: count,
        maxActiveQuotes,
        attributionSource: invitation.attributionSource,
      }, jobs.get(id) ?? null);
    }));
    const actionableCount = await this.actionableCount(pro, now);
    return {
      items,
      page: q.page,
      pageSize: q.pageSize,
      total,
      actionableCount,
    };
  }

  async get(pro: ProfessionalProfile, id: string): Promise<ProRequestView> {
    const request = await this.findInvited(pro, id);
    const appointments = await latestAppointments(this.dataSource.manager, [id]);
    const jobs = await jobSummaries(this.dataSource.manager, [id], pro.id);
    const invitation = request.invitations.find((inv) => inv.professionalId === pro.id)!;
    const blocked = (await this.blockedRequestIds(pro, [invitation])).has(id);
    const now = new Date();
    const maxActiveQuotes = this.config.get<number>('MAX_ACTIVE_QUOTES_PER_REQUEST', 5);
    const availableAt = effectiveOpportunityAvailableAt({
      sentAt: invitation.sentAt,
      availableAt: invitation.availableAt,
      targeted: invitation.targeted,
      delayEnabled: this.config.get<boolean>('PRO_EARLY_OPPORTUNITIES', true),
    });
    const quoteState = await this.quoteState([id], pro.id, now);
    if (blocked) {
      await recordFunnelEvent(this.dataSource.manager, {
        type: FunnelEventType.FREE_BLOCKED_OPPORTUNITY_VIEWED,
        professionalId: pro.id,
        ref: id,
        context: { requestId: id, billingPlan: 'FREE', entitlementSource: 'FREE' },
      });
    }
    // Las solicitudes que permanecen abiertas muestran el presupuesto propio
    // del profesional para ofrecer edición sin crear una segunda respuesta.
    // Vencerlo aquí sigue la misma estrategia perezosa que el listado cliente.
    await this.dataSource.manager.update(
      Quote,
      { requestId: id, professionalId: pro.id, status: QuoteStatus.PENDING, validUntil: LessThan(new Date()) },
      { status: QuoteStatus.EXPIRED },
    );
    const ownQuote = await this.dataSource.getRepository(Quote).findOne({
      where: { requestId: id, professionalId: pro.id },
      relations: { items: true },
    });
    const activeQuoteCount = quoteState.counts.get(id) ?? 0;
    const delayed = now < availableAt;
    await this.recordUnlockedIfNeeded(pro, invitation, id, availableAt, now);
    return {
      ...presentRequestForProfessional(request, pro.id, appointments.get(id) ?? null, {
        blocked,
        delayed,
        targeted: invitation.targeted,
        availableAt,
        actionable: isActionableOpportunity({
          requestStatus: request.status,
          invitationStatus: invitation.status,
          targeted: invitation.targeted,
          availableAt,
          activeQuoteCount,
          maxActiveQuotes,
          blockedByFreeQuota: blocked,
          ownActiveQuote: quoteState.ownActive.has(id),
          now,
        }),
        activeQuoteCount,
        maxActiveQuotes,
        attributionSource: invitation.attributionSource,
      }, jobs.get(id) ?? null),
      ownQuote: ownQuote ? presentQuote(ownQuote) : null,
      clientReviewed:
        request.selectedProfessionalId === pro.id &&
        (await this.dataSource.getRepository(Review).existsBy({ requestId: id })),
    };
  }

  private async actionableCount(pro: ProfessionalProfile, now: Date): Promise<number> {
    const invitations = await this.invitations.find({
      where: { professionalId: pro.id, status: InvitationStatus.PENDING },
      relations: { request: true },
      order: { sentAt: 'DESC' },
    });
    if (!invitations.length) return 0;
    const blocked = await this.blockedRequestIds(pro, invitations);
    const ids = [...new Set(invitations.map((i) => i.requestId))];
    const quoteState = await this.quoteState(ids, pro.id, now);
    const maxActiveQuotes = this.config.get<number>('MAX_ACTIVE_QUOTES_PER_REQUEST', 5);
    return invitations.filter((invitation) => {
      const request = invitation.request;
      const availableAt = effectiveOpportunityAvailableAt({
        sentAt: invitation.sentAt,
        availableAt: invitation.availableAt,
        targeted: invitation.targeted,
        delayEnabled: this.config.get<boolean>('PRO_EARLY_OPPORTUNITIES', true),
      });
      return isActionableOpportunity({
        requestStatus: request.status,
        invitationStatus: invitation.status,
        targeted: invitation.targeted,
        availableAt,
        activeQuoteCount: quoteState.counts.get(invitation.requestId) ?? 0,
        maxActiveQuotes,
        blockedByFreeQuota: blocked.has(invitation.requestId),
        ownActiveQuote: quoteState.ownActive.has(invitation.requestId),
        now,
      });
    }).length;
  }

  private async quoteState(requestIds: string[], professionalId: string, now: Date) {
    const counts = new Map<string, number>();
    const ownActive = new Set<string>();
    if (!requestIds.length) return { counts, ownActive };
    const rows = await this.dataSource.manager.query<
      { request_id: string; active_count: number; own_active: boolean }[]
    >(
      `SELECT request_id,
              count(*)::int AS active_count,
              bool_or(professional_id = $2) AS own_active
         FROM quotes
        WHERE request_id = ANY($1::uuid[])
          AND (status = 'ACCEPTED' OR (status = 'PENDING' AND (valid_until IS NULL OR valid_until > $3)))
        GROUP BY request_id`,
      [requestIds, professionalId, now],
    );
    for (const row of rows) {
      counts.set(row.request_id, row.active_count);
      if (row.own_active) ownActive.add(row.request_id);
    }
    return { counts, ownActive };
  }

  private async recordUnlockedIfNeeded(
    pro: ProfessionalProfile,
    invitation: RequestInvitation,
    requestId: string,
    availableAt: Date,
    now: Date,
  ): Promise<void> {
    if (
      !this.config.get<boolean>('PRO_EARLY_OPPORTUNITIES', true) ||
      invitation.targeted ||
      availableAt <= invitation.sentAt ||
      availableAt > now
    ) return;
    await recordFunnelEvent(this.dataSource.manager, {
      type: FunnelEventType.DELAYED_OPPORTUNITY_UNLOCKED,
      professionalId: pro.id,
      ref: requestId,
      at: availableAt,
      context: {
        requestId,
        attributionSource: invitation.attributionSource,
        availableAt: availableAt.toISOString(),
      },
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
        types: PRO_NEW_REQUEST_TYPES,
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
    if (limit === null || (await freeQuoteUsage(this.dataSource.manager, pro.id)) < limit) return new Set();
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
