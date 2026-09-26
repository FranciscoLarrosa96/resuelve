import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager, In, LessThan, Not } from 'typeorm';
import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-codes';
import { fromCents, toCents } from '../common/money/money';
import { alreadyQuoted, monthlyQuoteUsage, presentQuoteUsage, quoteLimitFor } from '../plans/quote-quota';
import { AUDIENCE_TYPES, NotificationType } from '../notifications/notification.entity';
import { markNotificationsRead, notify } from '../notifications/notify';
import { ProfessionalProfile } from '../professionals/professional-profile.entity';
import { loadEligibilityProfiles } from '../professionals/professional-eligibility';
import { requestIneligibility } from '../professionals/professional-rules';
import { Service } from '../catalog/service.entity';
import { RequestInvitation } from '../requests/request-invitation.entity';
import { assertTransition, QUOTABLE_STATUSES } from '../requests/request-state-machine';
import { InvitationStatus, RequestStatus } from '../requests/request.enums';
import { presentRequestForClient } from '../requests/request.presenter';
import { REQUEST_RELATIONS } from '../requests/request.relations';
import { ServiceRequest } from '../requests/service-request.entity';
import { CreateQuoteDto, UpdateQuoteDto } from './dto/quote.dto';
import { QuoteItem } from './quote-item.entity';
import { computeQuoteAmounts } from './quote-totals';
import { Quote } from './quote.entity';
import { ACTIVE_QUOTE_STATUSES, QuoteStatus } from './quote.enums';
import { presentQuote } from './quote.presenter';

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
      // El cliente ya decidió: los avisos de presupuestos de esta solicitud dejan de pedir algo.
      await markNotificationsRead(m, {
        userId: clientId,
        requestId: request.id,
        types: [NotificationType.CLIENT_QUOTE_RECEIVED],
      });
      const winner = await m.findOneByOrFail(ProfessionalProfile, { id: fresh.professionalId });
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
    return presentRequestForClient(request);
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
        await this.assertQuoteQuota(m, pro.id, requestId);

        const quote = await m.save(
          m.create(Quote, {
            requestId,
            professionalId: pro.id,
            description: dto.description,
            ...amounts,
            availableFrom: dto.availableFrom ? new Date(dto.availableFrom) : null,
            validUntil: this.validUntil(dto),
            status: QuoteStatus.PENDING,
            items: this.items(dto),
          }),
        );
        await m.update(RequestInvitation, invitation.id, {
          status: InvitationStatus.QUOTED,
          respondedAt: new Date(),
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
        if (request.status === RequestStatus.WAITING_QUOTES) {
          assertTransition(request.status, RequestStatus.QUOTES_RECEIVED);
          await m.update(ServiceRequest, requestId, { status: RequestStatus.QUOTES_RECEIVED });
        }
        return quote.id;
      });
      return this.getOwn(pro, quoteId);
    } catch (e) {
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
    await this.dataSource.transaction(async (m) => {
      const quote = await this.lockOwnQuote(m, pro, quoteId);
      if (quote.status !== QuoteStatus.PENDING) {
        throw AppException.conflict(
          ErrorCode.INVALID_QUOTE_STATE,
          'Solo se puede editar un presupuesto pendiente',
          { status: quote.status },
        );
      }
      const request = await m.findOneByOrFail(ServiceRequest, { id: quote.requestId });
      if (!QUOTABLE_STATUSES.includes(request.status)) {
        throw AppException.conflict(
          ErrorCode.INVALID_REQUEST_STATE,
          'La solicitud ya no admite cambios de presupuesto',
          { status: request.status },
        );
      }
      await m.delete(QuoteItem, { quoteId });
      await m.save(
        m.create(Quote, {
          ...quote,
          description: dto.description,
          ...amounts,
          availableFrom: dto.availableFrom ? new Date(dto.availableFrom) : null,
          validUntil: this.validUntil(dto),
          items: this.items(dto),
        }),
      );
    });
    return this.getOwn(pro, quoteId);
  }

  async withdraw(pro: ProfessionalProfile, quoteId: string) {
    await this.dataSource.transaction(async (m) => {
      const quote = await this.lockOwnQuote(m, pro, quoteId);
      if (quote.status !== QuoteStatus.PENDING) {
        throw AppException.conflict(
          ErrorCode.INVALID_QUOTE_STATE,
          'Solo se puede retirar un presupuesto pendiente',
          { status: quote.status },
        );
      }
      const request = await m.findOneOrFail(ServiceRequest, {
        where: { id: quote.requestId },
        lock: { mode: 'pessimistic_write' },
      });
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
      ? requestIneligibility(profile, { service, zoneId: request.zoneId }, { checkCoverage: false })
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
      (item) =>
        ({
          description: item.description,
          quantity: fromCents(toCents(item.quantity)),
          unitPrice: fromCents(toCents(item.unitPrice)),
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
   * Cupo FREE (`plan/quote-quota.ts`): solicitudes distintas presupuestadas por
   * primera vez en el mes. El lock sobre el perfil serializa los envíos del
   * mismo profesional, así dos presupuestos simultáneos con 9/10 no terminan
   * en 11 (en READ COMMITTED el conteo posterior al lock ve lo ya confirmado).
   */
  private async assertQuoteQuota(m: EntityManager, professionalId: string, requestId: string): Promise<void> {
    const profile = await m.findOne(ProfessionalProfile, {
      where: { id: professionalId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!profile) throw AppException.notFound('Profesional');
    const limit = quoteLimitFor(profile, this.config);
    if (limit === null || (await alreadyQuoted(m, professionalId, requestId))) return;
    const used = await monthlyQuoteUsage(m, professionalId);
    if (used >= limit) {
      throw new AppException(
        ErrorCode.FREE_QUOTE_LIMIT_REACHED,
        `Con el plan Free podés presupuestar ${limit} solicitudes por mes`,
        HttpStatus.FORBIDDEN,
        { ...presentQuoteUsage(used, limit) },
      );
    }
  }

  /** Marca como EXPIRED los presupuestos pendientes vencidos (perezoso, sin jobs). */
  private async expireStale(m: EntityManager, requestId: string): Promise<void> {
    await m.update(
      Quote,
      { requestId, status: QuoteStatus.PENDING, validUntil: LessThan(new Date()) },
      { status: QuoteStatus.EXPIRED },
    );
  }
}
