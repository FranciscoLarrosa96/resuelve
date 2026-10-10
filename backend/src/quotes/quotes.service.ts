import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager, In, LessThan, Not } from 'typeorm';
import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-codes';
import { fromCents, toCents } from '../common/money/money';
import { alreadyQuoted, freeQuoteUsage, presentQuoteUsage, quoteLimitFor } from '../plans/quote-quota';
import { presentIntroOffer } from '../plans/pro-offers';
import { resolveProfessionalAccess } from '../plans/plan';
import { FunnelEventType } from '../funnel/funnel-event.entity';
import { recordFunnelEvent } from '../funnel/funnel';
import { AUDIENCE_TYPES, NotificationType, PRO_NEW_REQUEST_TYPES } from '../notifications/notification.entity';
import { markNotificationsRead, notify } from '../notifications/notify';
import { ProfessionalProfile } from '../professionals/professional-profile.entity';
import { loadEligibilityProfiles } from '../professionals/professional-eligibility';
import { requestIneligibility } from '../professionals/professional-rules';
import { Service } from '../catalog/service.entity';
import { RequestAttributionSource, RequestInvitation } from '../requests/request-invitation.entity';
import { assertTransition, QUOTABLE_STATUSES } from '../requests/request-state-machine';
import { InvitationStatus, RequestStatus } from '../requests/request.enums';
import { effectiveOpportunityAvailableAt } from '../requests/opportunity-access';
import { presentRequestForClient } from '../requests/request.presenter';
import { REQUEST_RELATIONS } from '../requests/request.relations';
import { ServiceRequest } from '../requests/service-request.entity';
import { CreateQuoteDto, UpdateQuoteDto } from './dto/quote.dto';
import { QuoteItem } from './quote-item.entity';
import { computeQuoteAmounts } from './quote-totals';
import { Quote } from './quote.entity';
import { ACTIVE_QUOTE_STATUSES, QuoteStatus } from './quote.enums';
import { presentQuote } from './quote.presenter';
import { jobSummaries } from '../jobs/job-summary';

const isUniqueViolation = (e: unknown) => (e as { code?: string })?.code === '23505';

@Injectable()
export class QuotesService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  // ---- Cliente -----------------------------------------------------------

  async listForClient(clientId: string, requestId: string) {
    const request = await this.dataSource
      .getRepository(ServiceRequest)
      .findOneBy({ id: requestId, clientId });
    if (!request) throw AppException.notFound('Solicitud');
    await this.expireStale(this.dataSource.manager, requestId);
    const quotes = await this.dataSource.getRepository(Quote).find({
      where: { requestId, status: Not(QuoteStatus.WITHDRAWN) },
      relations: { items: true, professional: { user: true } },
      order: { totalAmount: 'ASC', createdAt: 'ASC' },
    });
    return quotes.map(presentQuote);
  }

  /**
   * Aceptar presupuesto (transaccional):
   * dueño + estado válido → la quote pasa a ACCEPTED, las demás a REJECTED,
   * invitaciones SELECTED / NOT_SELECTED, y la solicitud registra al
   * profesional elegido (desde ahí él puede ver la dirección exacta).
   * El lock sobre la solicitud serializa aceptaciones concurrentes:
   * solo una puede ganar.
   */
  async accept(clientId: string, quoteId: string) {
    const requestId = await this.dataSource.transaction(async (m) => {
      const quote = await m.findOneBy(Quote, { id: quoteId });
      if (!quote) throw AppException.notFound('Presupuesto');
      const request = await m.findOne(ServiceRequest, {
        where: { id: quote.requestId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!request || request.clientId !== clientId) throw AppException.notFound('Presupuesto');

      // Releer bajo lock: otra aceptación pudo haber ganado mientras esperábamos.
      const fresh = await m.findOneByOrFail(Quote, { id: quoteId });
      if (fresh.status !== QuoteStatus.PENDING) {
        throw AppException.conflict(ErrorCode.INVALID_QUOTE_STATE, 'Este presupuesto ya no está disponible', {
          status: fresh.status,
        });
      }
      assertTransition(request.status, RequestStatus.PROFESSIONAL_SELECTED);
      if (fresh.validUntil && fresh.validUntil < new Date()) {
        throw AppException.conflict(
          ErrorCode.QUOTE_EXPIRED,
          'El presupuesto venció. Pedile uno nuevo al profesional.',
        );
      }

      await m.update(Quote, fresh.id, { status: QuoteStatus.ACCEPTED, acceptedAt: new Date() });
      await m.update(
        Quote,
        { requestId: request.id, status: QuoteStatus.PENDING, id: Not(fresh.id) },
        { status: QuoteStatus.REJECTED },
      );
      await m.update(
        RequestInvitation,
        { requestId: request.id, professionalId: fresh.professionalId },
        { status: InvitationStatus.SELECTED },
      );
      await m.update(
        RequestInvitation,
        {
          requestId: request.id,
          professionalId: Not(fresh.professionalId),
          status: In([InvitationStatus.PENDING, InvitationStatus.QUOTED]),
        },
        { status: InvitationStatus.NOT_SELECTED },
      );
      await m.update(ServiceRequest, request.id, {
        status: RequestStatus.PROFESSIONAL_SELECTED,
        selectedProfessionalId: fresh.professionalId,
        acceptedQuoteId: fresh.id,
      });
      // Exactly one operational job per accepted quote/request, in the same transaction.
      await m.query(
        `INSERT INTO jobs (request_id, accepted_quote_id, professional_id, client_id, status)
         VALUES ($1, $2, $3, $4, 'TO_COORDINATE')
         ON CONFLICT (request_id) DO NOTHING`,
        [request.id, fresh.id, fresh.professionalId, request.clientId],
      );
      await m.query(
        `INSERT INTO job_events (job_id, actor_user_id, type, details)
         SELECT j.id, $2, 'CREATED', jsonb_build_object('source', 'ACCEPTED_QUOTE')
           FROM jobs j
          WHERE j.request_id = $1
            AND NOT EXISTS (SELECT 1 FROM job_events e WHERE e.job_id = j.id AND e.type = 'CREATED')
         ON CONFLICT DO NOTHING`,
        [request.id, clientId],
      );
      // El cliente ya decidió: los avisos de presupuestos de esta solicitud dejan de pedir algo.
      await markNotificationsRead(m, {
        userId: clientId,
        requestId: request.id,
        types: [NotificationType.CLIENT_QUOTE_RECEIVED],
      });
      // Ya hay elegido: las "Nuevas" de esta solicitud no piden nada a nadie.
      await markNotificationsRead(m, {
        requestId: request.id,
        types: PRO_NEW_REQUEST_TYPES,
      });
      const winner = await m.findOneByOrFail(ProfessionalProfile, { id: fresh.professionalId });
      await this.markFirstSuccess(m, winner, request.id, fresh.id);
      await notify(
        m,
        { userId: winner.userId, type: NotificationType.PROFESSIONAL_SELECTED, requestId: request.id },
        clientId,
      );
      return request.id;
    });
    const request = await this.dataSource
      .getRepository(ServiceRequest)
      .findOneOrFail({ where: { id: requestId }, relations: REQUEST_RELATIONS });
    const activeQuoteCount = await this.activeQuoteCount(this.dataSource.manager, requestId, new Date());
    const jobs = await jobSummaries(this.dataSource.manager, [requestId]);
    const maxActiveQuotes = this.config.get<number>('MAX_ACTIVE_QUOTES_PER_REQUEST', 5);
    return presentRequestForClient(
      request,
      null,
      null,
      {
        activeQuoteCount,
        maxActiveQuotes,
        remainingQuoteSlots: Math.max(0, maxActiveQuotes - activeQuoteCount),
        slotsFull: activeQuoteCount >= maxActiveQuotes,
      },
      jobs.get(requestId) ?? null,
    );
  }

  // ---- Profesional -------------------------------------------------------

  async create(pro: ProfessionalProfile, requestId: string, dto: CreateQuoteDto) {
    const amounts = this.amounts(dto);
    try {
      const quoteId = await this.dataSource.transaction(async (m) => {
        const request = await m.findOne(ServiceRequest, {
          where: { id: requestId },
          lock: { mode: 'pessimistic_write' },
        });
        const invitation =
          request && (await m.findOneBy(RequestInvitation, { requestId, professionalId: pro.id }));
        if (!request || !invitation) {
          throw AppException.forbidden(
            'Solo podés presupuestar solicitudes que recibiste',
            ErrorCode.NOT_INVITED,
          );
        }
        if (!QUOTABLE_STATUSES.includes(request.status) || invitation.status === InvitationStatus.DECLINED) {
          throw AppException.conflict(
            ErrorCode.INVALID_REQUEST_STATE,
            'Esta solicitud ya no recibe presupuestos',
            { status: request.status },
          );
        }
        const availableAt = effectiveOpportunityAvailableAt({
          sentAt: invitation.sentAt,
          availableAt: invitation.availableAt,
          targeted: invitation.targeted,
          delayEnabled: this.config.get<boolean>('PRO_EARLY_OPPORTUNITIES', true),
        });
        if (availableAt > new Date()) {
          throw AppException.conflict(
            ErrorCode.OPPORTUNITY_NOT_AVAILABLE,
            'Esta oportunidad todavía no está disponible',
            { availableAt: availableAt.toISOString() },
          );
        }
        await this.assertCanQuote(m, pro.id, request);
        const active = await m.findOneBy(Quote, {
          requestId,
          professionalId: pro.id,
          status: In([...ACTIVE_QUOTE_STATUSES]),
        });
        if (active) {
          throw AppException.conflict(
            ErrorCode.QUOTE_ALREADY_EXISTS,
            'Ya enviaste un presupuesto: editalo en lugar de crear otro',
            { quoteId: active.id },
          );
        }
        // La solicitud bloqueada serializa todas las creaciones concurrentes.
        // Quotes PENDING vigentes y ACCEPTED ocupan lugar; EXPIRED, REJECTED y
        // WITHDRAWN lo liberan. La edición de un quote no pasa por este conteo.
        await this.expireStale(m, requestId);
        const maxActiveQuotes = this.config.get<number>('MAX_ACTIVE_QUOTES_PER_REQUEST', 5);
        const activeQuoteCount = await this.activeQuoteCount(m, requestId, new Date());
        if (activeQuoteCount >= maxActiveQuotes) {
          throw AppException.conflict(
            ErrorCode.REQUEST_QUOTE_LIMIT_REACHED,
            'Esta solicitud ya recibió suficientes propuestas',
            { activeQuoteCount, maxActiveQuotes },
          );
        }
        const quotaDecision = await this.assertQuoteQuota(m, pro.id, requestId, invitation.targeted);
        const access = resolveProfessionalAccess(pro, {
          firstSuccessTrialEnabled: this.config.get<boolean>('FIRST_SUCCESS_TRIAL_ENABLED', true),
        });

        const quote = await m.save(
          m.create(Quote, {
            requestId,
            professionalId: pro.id,
            description: dto.description,
            note: dto.note?.trim() || null,
            estimatedDuration: dto.estimatedDuration?.trim() || null,
            ...amounts,
            availableFrom: dto.availableFrom ? new Date(dto.availableFrom) : null,
            validUntil: this.validUntil(dto),
            status: QuoteStatus.PENDING,
            items: this.items(dto),
          }),
        );
        if (activeQuoteCount + 1 === maxActiveQuotes) {
          await recordFunnelEvent(m, {
            type: FunnelEventType.REQUEST_SLOT_FILLED,
            professionalId: pro.id,
            ref: requestId,
            context: {
              requestId,
              quoteId: quote.id,
              billingPlan: access.billingPlan,
              entitlementSource: access.source,
              attributionSource: invitation.attributionSource,
              activeQuoteCount: activeQuoteCount + 1,
              maxActiveQuotes,
            },
          });
        }
        if (quotaDecision.recordUsage) {
          await m.query(
            `INSERT INTO quote_quota_usages (professional_id, request_id, consumed_at, consumes_free_quota)
             VALUES ($1, $2, now(), true) ON CONFLICT (professional_id, request_id) DO UPDATE
             SET consumes_free_quota = true WHERE quote_quota_usages.consumes_free_quota = false`,
            [pro.id, requestId],
          );
        }
        await m.update(RequestInvitation, invitation.id, {
          status: InvitationStatus.QUOTED,
          respondedAt: new Date(),
        });
        // Ya la respondió: "Nueva solicitud" deja de pedir algo.
        await markNotificationsRead(m, {
          userId: pro.userId,
          requestId,
          types: PRO_NEW_REQUEST_TYPES,
        });
        await notify(
          m,
          {
            userId: request.clientId,
            type: NotificationType.CLIENT_QUOTE_RECEIVED,
            requestId,
            quoteId: quote.id,
          },
          pro.userId,
        );
        const context = {
          requestId,
          quoteId: quote.id,
          billingPlan: access.billingPlan,
          entitlementSource: access.source,
          attributionSource: invitation.attributionSource,
          availableAt: availableAt.toISOString(),
        };
        await recordFunnelEvent(m, {
          type: FunnelEventType.FIRST_QUOTE_SENT,
          professionalId: pro.id,
          context,
        });
        if (quotaDecision.consumesFreeQuota) {
          await recordFunnelEvent(m, {
            type: FunnelEventType.FREE_QUOTE_USED,
            professionalId: pro.id,
            ref: requestId,
            context,
          });
        }
        if (quotaDecision.reachesLimit) {
          await recordFunnelEvent(m, {
            type: FunnelEventType.FREE_QUOTE_LIMIT_REACHED,
            professionalId: pro.id,
            context,
          });
        }
        if (request.status === RequestStatus.WAITING_QUOTES) {
          assertTransition(request.status, RequestStatus.QUOTES_RECEIVED);
          await m.update(ServiceRequest, requestId, { status: RequestStatus.QUOTES_RECEIVED });
        }
        return quote.id;
      });
      return this.getOwn(pro, quoteId);
    } catch (e) {
      // El intento con el cupo agotado se mide fuera de la transacción (que se revirtió).
      if (e instanceof AppException && e.code === ErrorCode.FREE_QUOTE_LIMIT_REACHED) {
        await recordFunnelEvent(this.dataSource.manager, {
          type: FunnelEventType.FREE_QUOTE_LIMIT_REACHED,
          professionalId: pro.id,
          context: {
            requestId,
            billingPlan: 'FREE',
            entitlementSource: 'FREE',
          },
        });
      }
      if (e instanceof AppException && e.code === ErrorCode.REQUEST_QUOTE_LIMIT_REACHED) {
        const invitation = await this.dataSource.getRepository(RequestInvitation).findOneBy({
          requestId,
          professionalId: pro.id,
        });
        const access = resolveProfessionalAccess(pro, {
          firstSuccessTrialEnabled: this.config.get<boolean>('FIRST_SUCCESS_TRIAL_ENABLED', true),
        });
        await recordFunnelEvent(this.dataSource.manager, {
          type: FunnelEventType.REQUEST_SLOTS_FULL,
          professionalId: pro.id,
          ref: requestId,
          context: {
            requestId,
            billingPlan: access.billingPlan,
            entitlementSource: access.source,
            attributionSource: invitation?.attributionSource ?? RequestAttributionSource.OTHER,
            activeQuoteCount: Number(
              (e.details as { activeQuoteCount?: number } | undefined)?.activeQuoteCount ?? 0,
            ),
            maxActiveQuotes: Number(
              (e.details as { maxActiveQuotes?: number } | undefined)?.maxActiveQuotes ??
                this.config.get<number>('MAX_ACTIVE_QUOTES_PER_REQUEST', 5),
            ),
          },
        });
      }
      // Carrera entre dos envíos simultáneos: el índice único parcial decide.
      if (isUniqueViolation(e))
        throw AppException.conflict(
          ErrorCode.QUOTE_ALREADY_EXISTS,
          'Ya enviaste un presupuesto para esta solicitud',
        );
      throw e;
    }
  }

  async update(pro: ProfessionalProfile, quoteId: string, dto: UpdateQuoteDto) {
    const amounts = this.amounts(dto);
    const current = await this.dataSource.getRepository(Quote).findOneBy({
      id: quoteId,
      professionalId: pro.id,
    });
    if (!current) throw AppException.notFound('Presupuesto');
    const updateResult = await this.dataSource.transaction(async (m) => {
      // El orden solicitud → quote coincide con la aceptación y evita que un
      // PATCH iniciado en paralelo a aceptar/cancelar escriba después del cierre.
      const request = await m.findOne(ServiceRequest, {
        where: { id: current.requestId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!request) {
        return {
          error: AppException.conflict(
            ErrorCode.INVALID_REQUEST_STATE,
            'La solicitud ya no admite cambios de presupuesto',
          ),
        };
      }
      const quote = await this.lockOwnQuote(m, pro, quoteId);
      if (quote.status !== QuoteStatus.PENDING) {
        return {
          error: AppException.conflict(
            ErrorCode.INVALID_QUOTE_STATE,
            'Solo se puede editar un presupuesto pendiente',
            { status: quote.status },
          ),
        };
      }
      if (quote.validUntil && quote.validUntil < new Date()) {
        // Persistimos EXPIRED antes de devolver el conflicto: una quote vencida
        // no se puede reactivar cambiándole su fecha de validez.
        await m.update(Quote, quoteId, { status: QuoteStatus.EXPIRED });
        return {
          error: AppException.conflict(
            ErrorCode.INVALID_QUOTE_STATE,
            'Este presupuesto venció y ya no se puede editar',
            { status: QuoteStatus.EXPIRED },
          ),
        };
      }
      if (!QUOTABLE_STATUSES.includes(request.status)) {
        return {
          error: AppException.conflict(
            ErrorCode.INVALID_REQUEST_STATE,
            'La solicitud ya no admite cambios de presupuesto',
            { status: request.status },
          ),
        };
      }
      await m.delete(QuoteItem, { quoteId });
      const updatedAt = new Date();
      await m.update(Quote, quoteId, {
        description: dto.description,
        note: dto.note?.trim() || null,
        estimatedDuration: dto.estimatedDuration?.trim() || null,
        ...amounts,
        availableFrom: dto.availableFrom ? new Date(dto.availableFrom) : null,
        validUntil: this.validUntil(dto),
        updatedAt,
      });
      const items = this.items(dto).map((item) => m.create(QuoteItem, { ...item, quoteId }));
      if (items.length) await m.save(QuoteItem, items);
      await notify(
        m,
        {
          userId: request.clientId,
          type: NotificationType.CLIENT_QUOTE_UPDATED,
          requestId: request.id,
          quoteId,
          dedupeRef: `${quoteId}:${updatedAt.getTime()}`,
          coalesceUnread: true,
        },
        pro.userId,
      );
      return { error: null };
    });
    if (updateResult.error) throw updateResult.error;
    return this.getOwn(pro, quoteId);
  }

  async withdraw(pro: ProfessionalProfile, quoteId: string) {
    const current = await this.dataSource.getRepository(Quote).findOneBy({
      id: quoteId,
      professionalId: pro.id,
    });
    if (!current) throw AppException.notFound('Presupuesto');
    await this.dataSource.transaction(async (m) => {
      // Mantener el mismo orden de locks que aceptar y editar: solicitud → quote.
      const request = await m.findOne(ServiceRequest, {
        where: { id: current.requestId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!request) throw AppException.notFound('Solicitud');
      const quote = await this.lockOwnQuote(m, pro, quoteId);
      if (quote.status !== QuoteStatus.PENDING) {
        throw AppException.conflict(
          ErrorCode.INVALID_QUOTE_STATE,
          'Solo se puede retirar un presupuesto pendiente',
          { status: quote.status },
        );
      }
      await m.update(Quote, quoteId, { status: QuoteStatus.WITHDRAWN });
      // Un presupuesto retirado ya no es novedad para el cliente.
      await markNotificationsRead(m, { requestId: request.id, types: AUDIENCE_TYPES.CLIENT, quoteId });
      await m.update(
        RequestInvitation,
        { requestId: request.id, professionalId: pro.id },
        { status: InvitationStatus.PENDING, respondedAt: null },
      );
      const remaining = await m.countBy(Quote, { requestId: request.id, status: QuoteStatus.PENDING });
      if (!remaining && request.status === RequestStatus.QUOTES_RECEIVED) {
        assertTransition(request.status, RequestStatus.WAITING_QUOTES);
        await m.update(ServiceRequest, request.id, { status: RequestStatus.WAITING_QUOTES });
      }
    });
    return this.getOwn(pro, quoteId);
  }

  async getOwn(pro: ProfessionalProfile, quoteId: string) {
    const quote = await this.dataSource
      .getRepository(Quote)
      .findOne({ where: { id: quoteId, professionalId: pro.id }, relations: { items: true } });
    if (!quote) throw AppException.notFound('Presupuesto');
    return presentQuote(quote);
  }

  // ---- helpers -----------------------------------------------------------

  /**
   * Primer éxito del profesional = primer presupuesto aceptado por un
   * cliente (evento objetivo). Una sola vez: el UPDATE condicional nunca pisa
   * una fecha anterior ni la vuelve a null.
   */
  private async markFirstSuccess(
    m: EntityManager,
    profile: ProfessionalProfile,
    requestId: string,
    quoteId: string,
  ): Promise<void> {
    const now = new Date();
    await m.query(
      `UPDATE professional_profiles SET first_success_at = $2 WHERE id = $1 AND first_success_at IS NULL`,
      [profile.id, now],
    );
    const access = resolveProfessionalAccess(
      { ...profile, firstSuccessAt: now },
      { firstSuccessTrialEnabled: this.config.get<boolean>('FIRST_SUCCESS_TRIAL_ENABLED', true) },
      now,
    );
    const event = {
      professionalId: profile.id,
      at: now,
      context: {
        requestId,
        quoteId,
        billingPlan: access.billingPlan,
        entitlementSource: access.source,
      },
    };
    await recordFunnelEvent(m, { ...event, type: FunnelEventType.FIRST_QUOTE_ACCEPTED });
    await recordFunnelEvent(m, { ...event, type: FunnelEventType.FIRST_SUCCESS_REACHED });
  }

  /**
   * Segunda barrera: una invitación vieja no alcanza si después el profesional
   * pausó el perfil, dejó de ofrecer el servicio o perdió/venció la matrícula.
   * La cobertura NO se vuelve a exigir: se validó al invitar y cambiar de
   * barrios no invalida lo que ya recibió.
   */
  private async assertCanQuote(
    m: EntityManager,
    professionalId: string,
    request: ServiceRequest,
  ): Promise<void> {
    const profile = (await loadEligibilityProfiles(m, [professionalId])).get(professionalId);
    const service = await m.findOneByOrFail(Service, { id: request.serviceId });
    const reason = profile
      ? requestIneligibility(profile, { service, cityId: request.cityId, zoneId: request.zoneId }, { checkCoverage: false })
      : 'PROFILE_PAUSED';
    if (!reason) return;
    throw AppException.unprocessable(
      ErrorCode.PROFESSIONAL_NOT_ELIGIBLE,
      reason === 'PROFILE_PAUSED'
        ? 'Tu perfil está pausado: reactivalo para enviar presupuestos'
        : 'Para presupuestar tenés que ofrecer este servicio (con la matrícula vigente si la requiere)',
      { reason },
    );
  }

  private amounts(dto: CreateQuoteDto) {
    const amounts = computeQuoteAmounts(dto);
    if (toCents(amounts.totalAmount) <= 0) {
      throw AppException.unprocessable(
        ErrorCode.VALIDATION_ERROR,
        'El presupuesto debe tener un total mayor a cero',
      );
    }
    return amounts;
  }

  private items(dto: CreateQuoteDto): QuoteItem[] {
    return (dto.items ?? []).map(
      (item, sortOrder) =>
        ({
          description: item.description,
          quantity: fromCents(toCents(item.quantity)),
          unitPrice: fromCents(toCents(item.unitPrice)),
          sortOrder,
        }) as QuoteItem,
    );
  }

  private validUntil(dto: CreateQuoteDto): Date | null {
    if (!dto.validUntil) return null;
    const date = new Date(dto.validUntil);
    if (date <= new Date())
      throw AppException.unprocessable(ErrorCode.VALIDATION_ERROR, 'validUntil debe ser una fecha futura');
    return date;
  }

  private async lockOwnQuote(m: EntityManager, pro: ProfessionalProfile, quoteId: string): Promise<Quote> {
    const quote = await m.findOne(Quote, {
      where: { id: quoteId, professionalId: pro.id },
      lock: { mode: 'pessimistic_write' },
    });
    if (!quote) throw AppException.notFound('Presupuesto');
    return quote;
  }

  /**
   * Cupo Free (`plan/quote-quota.ts`): cinco solicitudes discovery distintas
   * durante toda la vida Free post-trial. El lock del perfil serializa los
   * envíos y evita que dos respuestas simultáneas consuman el mismo lugar.
   */
  private async assertQuoteQuota(
    m: EntityManager,
    professionalId: string,
    requestId: string,
    targeted: boolean,
  ): Promise<{ recordUsage: boolean; consumesFreeQuota: boolean; reachesLimit: boolean }> {
    const profile = await m.findOne(ProfessionalProfile, {
      where: { id: professionalId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!profile) throw AppException.notFound('Profesional');
    const limit = quoteLimitFor(profile, this.config);
    const access = resolveProfessionalAccess(profile, {
      firstSuccessTrialEnabled: this.config.get<boolean>('FIRST_SUCCESS_TRIAL_ENABLED', true),
    });
    if (targeted || access.trialActive || (await alreadyQuoted(m, professionalId, requestId))) {
      return { recordUsage: false, consumesFreeQuota: false, reachesLimit: false };
    }
    const used = await freeQuoteUsage(m, professionalId);
    if (limit !== null && used >= limit) {
      // El momento de la oferta: la elegibilidad viaja con el rechazo (decidida acá, no en la UI).
      throw new AppException(
        ErrorCode.FREE_QUOTE_LIMIT_REACHED,
        `Con Free podés responder ${limit} oportunidades en total`,
        HttpStatus.FORBIDDEN,
        { ...presentQuoteUsage(used, limit), offer: await presentIntroOffer(m, profile, used, this.config) },
      );
    }
    return {
      recordUsage: limit !== null,
      consumesFreeQuota: limit !== null,
      reachesLimit: limit !== null && used + 1 === limit,
    };
  }

  /** Marca como EXPIRED los presupuestos pendientes vencidos (perezoso, sin jobs). */
  private async expireStale(m: EntityManager, requestId: string): Promise<void> {
    await m.update(
      Quote,
      { requestId, status: QuoteStatus.PENDING, validUntil: LessThan(new Date()) },
      { status: QuoteStatus.EXPIRED },
    );
  }

  private activeQuoteCount(m: EntityManager, requestId: string, now: Date): Promise<number> {
    return m
      .createQueryBuilder(Quote, 'q')
      .where('q.request_id = :requestId', { requestId })
      .andWhere(
        `(q.status = :accepted OR (q.status = :pending AND (q.valid_until IS NULL OR q.valid_until > :now)))`,
        { accepted: QuoteStatus.ACCEPTED, pending: QuoteStatus.PENDING, now },
      )
      .getCount();
  }
}
