import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { Service } from '../catalog/service.entity';
import { Zone } from '../catalog/zone.entity';
import {
  ACTIVE_APPOINTMENT_STATUSES,
  Appointment,
  AppointmentParty,
  AppointmentStatus,
} from '../appointments/appointment.entity';
import { latestAppointments } from '../appointments/appointment.presenter';
import { IneligibilityReason, requestIneligibility } from '../professionals/professional-rules';
import { loadEligibilityProfiles } from '../professionals/professional-eligibility';
import type { ProfileForEligibility } from '../professionals/professional-eligibility';
import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-codes';
import { Paginated } from '../common/pagination/pagination';
import { isAvailableToday } from '../professionals/professional.presenter';
import {
  CreateRequestDto,
  InviteProfessionalsDto,
  ListRequestsQueryDto,
  UpdateRequestDto,
} from './dto/request.dto';
import { RequestAttributionSource, RequestInvitation } from './request-invitation.entity';
import {
  classifyInvitationSource,
  hasVerifiedFeaturedJourney,
  opportunityAvailableAt,
} from './opportunity-access';
import { RequestPhoto } from './request-photo.entity';
import {
  assertTransition,
  EDITABLE_STATUSES,
  INVITABLE_STATUSES,
  REQUEST_GROUPS,
} from './request-state-machine';
import {
  InvitationStatus,
  MAX_INVITATIONS_PER_REQUEST,
  RequestStatus,
  RequestUrgency,
} from './request.enums';
import { presentRequestForClient, type RequestQuoteCapacity } from './request.presenter';
import { reviewsByRequest } from '../reviews/review.presenter';
import { REQUEST_RELATIONS } from './request.relations';
import { ServiceRequest } from './service-request.entity';
import { AUDIENCE_TYPES, NotificationType } from '../notifications/notification.entity';
import { markNotificationsRead, notify } from '../notifications/notify';
import { FunnelEventType } from '../funnel/funnel-event.entity';
import { recordFunnelEvent } from '../funnel/funnel';
import { resolveProfessionalAccess } from '../plans/plan';
import { sha256 } from '../analytics/exposure';
import { jobSummaries } from '../jobs/job-summary';

type ClientRequestView = ReturnType<typeof presentRequestForClient>;

/** Mensajes al invitar a alguien que no puede recibir la solicitud (el cliente los ve). */
const INELIGIBLE_MESSAGES: Record<IneligibilityReason, string> = {
  PROFILE_PAUSED: 'Este profesional no está recibiendo solicitudes',
  SERVICE_NOT_OFFERED: 'El profesional no ofrece este servicio',
  ZONE_NOT_COVERED: 'El profesional no trabaja en ese barrio',
};

/** `?status=` y/o `?group=` (si vienen los dos, el estado tiene que ser del grupo). */
function statusFilter(q: ListRequestsQueryDto) {
  if (!q.group) return q.status ? { status: q.status } : {};
  const group: readonly RequestStatus[] = REQUEST_GROUPS[q.group];
  if (!q.status) return { status: In([...group]) };
  if (!group.includes(q.status)) {
    throw AppException.unprocessable(ErrorCode.VALIDATION_ERROR, 'El estado no pertenece a ese grupo');
  }
  return { status: q.status };
}

/** Solicitudes desde el lado del cliente. Toda operación valida que sea el dueño. */
@Injectable()
export class RequestsService {
  constructor(
    @InjectRepository(ServiceRequest) private readonly requests: Repository<ServiceRequest>,
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  async create(clientId: string, dto: CreateRequestDto): Promise<ClientRequestView> {
    await this.assertCatalog(this.dataSource.manager, dto.serviceId, dto.zoneId);
    const saved = await this.requests.save(
      this.requests.create({
        clientId,
        acquisitionSource: this.config.get<boolean>('PRO_ATTRIBUTION', true)
          ? (dto.acquisitionSource ?? 'MARKETPLACE')
          : 'MARKETPLACE',
        serviceId: dto.serviceId,
        zoneId: dto.zoneId,
        title: dto.title,
        description: dto.description,
        urgency: dto.urgency ?? RequestUrgency.FLEXIBLE,
        desiredDate: dto.desiredDate ?? null,
        desiredTimeRange: dto.desiredTimeRange ?? null,
        exactAddress: dto.exactAddress ?? null,
        status: RequestStatus.DRAFT,
        photos: (dto.photoUrls ?? []).map((url, sortOrder) => ({ url, sortOrder }) as RequestPhoto),
      }),
    );
    return this.getMine(clientId, saved.id);
  }

  async listMine(clientId: string, q: ListRequestsQueryDto): Promise<Paginated<ClientRequestView>> {
    const [items, total] = await this.requests.findAndCount({
      where: { clientId, ...statusFilter(q) },
      relations: REQUEST_RELATIONS,
      order: { createdAt: 'DESC' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    });
    const ids = items.map((r) => r.id);
    const [appointments, reviews, jobs] = await Promise.all([
      latestAppointments(this.dataSource.manager, ids),
      reviewsByRequest(this.dataSource.manager, ids),
      jobSummaries(this.dataSource.manager, ids),
    ]);
    const quoteCapacities = await this.quoteCapacities(ids);
    return {
      items: items.map((r) =>
        presentRequestForClient(
          r,
          appointments.get(r.id) ?? null,
          reviews.get(r.id) ?? null,
          quoteCapacities.get(r.id),
          jobs.get(r.id) ?? null,
        ),
      ),
      page: q.page,
      pageSize: q.pageSize,
      total,
    };
  }

  async getMine(clientId: string, id: string): Promise<ClientRequestView> {
    const request = await this.findOwned(this.dataSource.manager, clientId, id);
    const [appointments, reviews, jobs] = await Promise.all([
      latestAppointments(this.dataSource.manager, [id]),
      reviewsByRequest(this.dataSource.manager, [id]),
      jobSummaries(this.dataSource.manager, [id]),
    ]);
    const quoteCapacity = (await this.quoteCapacities([id])).get(id);
    return presentRequestForClient(
      request,
      appointments.get(id) ?? null,
      reviews.get(id) ?? null,
      quoteCapacity,
      jobs.get(id) ?? null,
    );
  }

  private async quoteCapacities(
    requestIds: string[],
    now = new Date(),
  ): Promise<Map<string, RequestQuoteCapacity>> {
    const maxActiveQuotes = this.config.get<number>('MAX_ACTIVE_QUOTES_PER_REQUEST', 5);
    const capacities = new Map<string, RequestQuoteCapacity>(
      requestIds.map((id): [string, RequestQuoteCapacity] => [
        id,
        { activeQuoteCount: 0, maxActiveQuotes, remainingQuoteSlots: maxActiveQuotes, slotsFull: false },
      ]),
    );
    if (!requestIds.length) return capacities;
    const rows = await this.dataSource.manager.query<{ request_id: string; active_count: number }[]>(
      `SELECT request_id, count(*)::int AS active_count
         FROM quotes
        WHERE request_id = ANY($1::uuid[])
          AND (status = 'ACCEPTED' OR (status = 'PENDING' AND (valid_until IS NULL OR valid_until > $2)))
        GROUP BY request_id`,
      [requestIds, now],
    );
    for (const row of rows) {
      const activeQuoteCount = row.active_count;
      capacities.set(row.request_id, {
        activeQuoteCount,
        maxActiveQuotes,
        remainingQuoteSlots: Math.max(0, maxActiveQuotes - activeQuoteCount),
        slotsFull: activeQuoteCount >= maxActiveQuotes,
      });
    }
    return capacities;
  }

  async update(clientId: string, id: string, dto: UpdateRequestDto): Promise<ClientRequestView> {
    await this.dataSource.transaction(async (m) => {
      const request = await this.lockOwned(m, clientId, id);
      if (!EDITABLE_STATUSES.includes(request.status)) {
        throw AppException.conflict(ErrorCode.INVALID_REQUEST_STATE, 'La solicitud ya no se puede editar', {
          status: request.status,
        });
      }
      if (dto.serviceId && dto.serviceId !== request.serviceId && request.status !== RequestStatus.DRAFT) {
        throw AppException.conflict(
          ErrorCode.INVALID_REQUEST_STATE,
          'El servicio solo se puede cambiar antes de enviar la solicitud',
        );
      }
      await this.assertCatalog(m, dto.serviceId, dto.zoneId);

      const { photoUrls, ...fields } = dto;
      if (Object.keys(fields).length) await m.update(ServiceRequest, id, fields);
      if (photoUrls) {
        await m.delete(RequestPhoto, { requestId: id });
        if (photoUrls.length)
          await m.insert(
            RequestPhoto,
            photoUrls.map((url, sortOrder) => ({ requestId: id, url, sortOrder })),
          );
      }
    });
    return this.getMine(clientId, id);
  }

  async cancel(clientId: string, id: string): Promise<ClientRequestView> {
    await this.dataSource.transaction(async (m) => {
      const request = await this.lockOwned(m, clientId, id);
      assertTransition(request.status, RequestStatus.CANCELLED);
      await m.update(ServiceRequest, id, { status: RequestStatus.CANCELLED, cancelledAt: new Date() });
      // Nunca queda una cita activa en una solicitud cancelada (misma transacción).
      await m.update(
        Appointment,
        { requestId: id, status: In([...ACTIVE_APPOINTMENT_STATUSES]) },
        { status: AppointmentStatus.CANCELLED, cancelledBy: AppointmentParty.CLIENT },
      );
      await m.query(
        `WITH changed AS (
           UPDATE jobs SET status = 'CANCELLED', cancelled_at = now(), cancelled_by = 'CLIENT', updated_at = now()
            WHERE request_id = $1 AND status NOT IN ('COMPLETED', 'CANCELLED')
            RETURNING id
         )
         INSERT INTO job_events (job_id, actor_user_id, type, details)
         SELECT id, $2, 'CANCELLED', jsonb_build_object('cancelledBy', 'CLIENT') FROM changed`,
        [id, clientId],
      );
      // Cancelada ya no le pide nada a ningún profesional.
      await markNotificationsRead(m, { requestId: id, types: AUDIENCE_TYPES.PROFESSIONAL });
    });
    return this.getMine(clientId, id);
  }

  /**
   * Pide presupuesto a profesionales concretos (máx. 5 por solicitud, en total).
   * Reglas (backend, aunque se llame a la API a mano): no es el propio cliente,
   * `requestIneligibility` (perfil activo, ofrece el servicio con matrícula
   * vigente si la requiere, cubre el barrio o "Todo Tandil") y, si la
   * solicitud es URGENT, marcó "Disponible hoy".
   */
  async invite(clientId: string, id: string, dto: InviteProfessionalsDto): Promise<ClientRequestView> {
    await this.dataSource.transaction(async (m) => {
      const request = await this.lockOwned(m, clientId, id);
      if (!INVITABLE_STATUSES.includes(request.status)) {
        throw AppException.conflict(
          ErrorCode.INVALID_REQUEST_STATE,
          'Ya no se pueden sumar profesionales a esta solicitud',
          { status: request.status },
        );
      }

      const existing = await m.findBy(RequestInvitation, { requestId: id });
      const newIds = dto.professionalIds.filter((pid) => !existing.some((inv) => inv.professionalId === pid));
      // `targeted` es la intención explícita de entrada enviada por el cliente,
      // nunca una inferencia por cantidad. Solo se persiste si es la primera
      // invitación y contiene un único profesional; el descubrimiento con uno
      // solo conserva targeted=false.
      const targeted = dto.targeted && existing.length === 0 && dto.professionalIds.length === 1;
      if (existing.length + newIds.length > MAX_INVITATIONS_PER_REQUEST) {
        throw AppException.unprocessable(
          ErrorCode.INVITATION_LIMIT_REACHED,
          `Podés pedir presupuesto a ${MAX_INVITATIONS_PER_REQUEST} profesionales como máximo`,
          { max: MAX_INVITATIONS_PER_REQUEST, current: existing.length },
        );
      }
      if (!newIds.length) return;

      const profiles = await loadEligibilityProfiles(m, newIds);
      if (profiles.size !== newIds.length) throw AppException.notFound('Profesional');
      const service = await m.findOneByOrFail(Service, { id: request.serviceId });
      for (const pro of profiles.values()) {
        if (pro.userId === clientId)
          throw AppException.unprocessable(
            ErrorCode.CANNOT_INVITE_SELF,
            'No podés pedirte presupuesto a vos mismo',
          );
        const reason = requestIneligibility(pro, { service, zoneId: request.zoneId });
        if (reason) {
          throw AppException.unprocessable(ErrorCode.PROFESSIONAL_NOT_ELIGIBLE, INELIGIBLE_MESSAGES[reason], {
            professionalId: pro.id,
            reason,
          });
        }
        if (request.urgency === RequestUrgency.URGENT && !isAvailableToday(pro)) {
          throw AppException.unprocessable(
            ErrorCode.PROFESSIONAL_NOT_ELIGIBLE,
            'Para urgencias solo se puede invitar a quien está disponible hoy',
            { professionalId: pro.id, reason: 'NOT_AVAILABLE_TODAY' },
          );
        }
      }

      const deliveredAt = new Date();
      const invitationRows = [] as {
        profile: ProfileForEligibility;
        access: ReturnType<typeof resolveProfessionalAccess>;
        availableAt: Date;
        source: RequestAttributionSource;
      }[];
      for (const professionalId of newIds) {
        const profile = profiles.get(professionalId)!;
        const access = resolveProfessionalAccess(
          profile,
          { firstSuccessTrialEnabled: this.config.get<boolean>('FIRST_SUCCESS_TRIAL_ENABLED', true) },
          deliveredAt,
        );
        const availableAt = opportunityAvailableAt({
          deliveredAt,
          targeted,
          urgency: request.urgency,
          access,
          config: {
            enabled: this.config.get<boolean>('PRO_EARLY_OPPORTUNITIES', true),
            freeDelayMinutes: this.config.get<number>('FREE_OPPORTUNITY_DELAY_MINUTES', 30),
            urgentFreeDelayMinutes: this.config.get<number>('URGENT_FREE_OPPORTUNITY_DELAY_MINUTES', 30),
          },
        });
        let verifiedFeaturedJourney = false;
        if (targeted && dto.attributionSessionKey && this.config.get<boolean>('PRO_ATTRIBUTION', true)) {
          const sessionHash = sha256(`resuelve-session|${dto.attributionSessionKey}`);
          const [journey] = await m.query<
            { featured_impression_at: Date | null; profile_view_at: Date | null }[]
          >(
            `SELECT
               (SELECT max(occurred_at) FROM exposure_events
                 WHERE professional_id = $1 AND session_key_hash = $2
                   AND type = 'SEARCH_IMPRESSION' AND is_featured_placement = true
                   AND occurred_at <= $3) AS featured_impression_at,
               (SELECT max(occurred_at) FROM exposure_events
                 WHERE professional_id = $1 AND session_key_hash = $2
                   AND type = 'PROFILE_VIEW' AND occurred_at <= $3) AS profile_view_at`,
            [profile.id, sessionHash, deliveredAt],
          );
          verifiedFeaturedJourney = hasVerifiedFeaturedJourney({
            featuredImpressionAt: journey?.featured_impression_at ?? null,
            profileViewAt: journey?.profile_view_at ?? null,
            requestAt: deliveredAt,
          });
        }
        const source = classifyInvitationSource({
          targeted,
          requestedSource: dto.attributionSource,
          verifiedFeaturedJourney,
          enabled: this.config.get<boolean>('PRO_ATTRIBUTION', true),
        });
        invitationRows.push({ profile, access, availableAt, source });
      }

      await m.insert(
        RequestInvitation,
        invitationRows.map(({ profile, availableAt, source }) => ({
          requestId: id,
          professionalId: profile.id,
          status: InvitationStatus.PENDING,
          targeted,
          sentAt: deliveredAt,
          availableAt,
          attributionSource: source,
        })),
      );
      // "Nueva solicitud" para cada invitado (pestaña Nuevas), en la misma transacción.
      for (const { profile: pro, access, availableAt, source } of invitationRows) {
        await notify(
          m,
          {
            userId: pro.userId,
            type: NotificationType.PRO_REQUEST_RECEIVED,
            requestId: id,
            dedupeRef: `${id}:${pro.id}`,
          },
          clientId,
        );
        await recordFunnelEvent(m, {
          type: FunnelEventType.FIRST_COMPATIBLE_OPPORTUNITY_RECEIVED,
          professionalId: pro.id,
        });
        const freeDelay =
          request.urgency === RequestUrgency.FLEXIBLE
            ? this.config.get<number>('FREE_OPPORTUNITY_DELAY_MINUTES', 30)
            : this.config.get<number>('URGENT_FREE_OPPORTUNITY_DELAY_MINUTES', 30);
        if (
          this.config.get<boolean>('PRO_EARLY_OPPORTUNITIES', true) &&
          !targeted &&
          freeDelay > 0 &&
          (access.billingPlan === 'PRO' || access.trialActive) &&
          availableAt.getTime() === deliveredAt.getTime()
        ) {
          await recordFunnelEvent(m, {
            type: FunnelEventType.EARLY_OPPORTUNITY_DELIVERED,
            professionalId: pro.id,
            ref: id,
            at: deliveredAt,
            context: {
              requestId: id,
              billingPlan: access.billingPlan,
              entitlementSource: access.source,
              attributionSource: source,
              availableAt: availableAt.toISOString(),
              earlyAccess: true,
            },
          });
        }
        if (source === RequestAttributionSource.PRO_FEATURED) {
          await recordFunnelEvent(m, {
            type: FunnelEventType.FEATURED_ATTRIBUTED_REQUEST,
            professionalId: pro.id,
            ref: id,
            at: deliveredAt,
            context: {
              requestId: id,
              billingPlan: access.billingPlan,
              entitlementSource: access.source,
              attributionSource: source,
              availableAt: availableAt.toISOString(),
            },
          });
        }
      }
      if (request.status === RequestStatus.DRAFT) {
        assertTransition(request.status, RequestStatus.WAITING_QUOTES);
        await m.update(ServiceRequest, id, { status: RequestStatus.WAITING_QUOTES });
      }
    });
    return this.getMine(clientId, id);
  }

  // ---- helpers -----------------------------------------------------------

  /** 404 tanto si no existe como si es de otro cliente: no revela solicitudes ajenas. */
  private async findOwned(m: EntityManager, clientId: string, id: string): Promise<ServiceRequest> {
    const request = await m.findOne(ServiceRequest, {
      where: { id, clientId },
      relations: REQUEST_RELATIONS,
    });
    if (!request) throw AppException.notFound('Solicitud');
    return request;
  }

  /** Bloquea la fila (SELECT … FOR UPDATE) para operaciones que cambian estado. */
  private async lockOwned(m: EntityManager, clientId: string, id: string): Promise<ServiceRequest> {
    const request = await m.findOne(ServiceRequest, {
      where: { id, clientId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!request) throw AppException.notFound('Solicitud');
    return request;
  }

  private async assertCatalog(m: EntityManager, serviceId?: string, zoneId?: string): Promise<void> {
    if (serviceId && !(await m.existsBy(Service, { id: serviceId, active: true }))) {
      throw AppException.unprocessable(ErrorCode.VALIDATION_ERROR, 'El servicio no existe');
    }
    if (zoneId && !(await m.existsBy(Zone, { id: zoneId, active: true }))) {
      throw AppException.unprocessable(ErrorCode.VALIDATION_ERROR, 'La zona no existe');
    }
  }
}
