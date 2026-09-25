import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { Service } from '../catalog/service.entity';
import { Zone } from '../catalog/zone.entity';
import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-codes';
import { Paginated } from '../common/pagination/pagination';
import { isAvailableToday } from '../professionals/professional.presenter';
import { ProfessionalProfile } from '../professionals/professional-profile.entity';
import { ProfessionalService } from '../professionals/professional-service.entity';
import {
  CreateRequestDto,
  InviteProfessionalsDto,
  ListRequestsQueryDto,
  UpdateRequestDto,
} from './dto/request.dto';
import { RequestInvitation } from './request-invitation.entity';
import { RequestPhoto } from './request-photo.entity';
import { assertTransition, EDITABLE_STATUSES, INVITABLE_STATUSES } from './request-state-machine';
import {
  InvitationStatus,
  MAX_INVITATIONS_PER_REQUEST,
  RequestStatus,
  RequestUrgency,
} from './request.enums';
import { presentRequestForClient } from './request.presenter';
import { REQUEST_RELATIONS } from './request.relations';
import { ServiceRequest } from './service-request.entity';

type ClientRequestView = ReturnType<typeof presentRequestForClient>;

/** Solicitudes desde el lado del cliente. Toda operación valida que sea el dueño. */
@Injectable()
export class RequestsService {
  constructor(
    @InjectRepository(ServiceRequest) private readonly requests: Repository<ServiceRequest>,
    private readonly dataSource: DataSource,
  ) {}

  async create(clientId: string, dto: CreateRequestDto): Promise<ClientRequestView> {
    await this.assertCatalog(this.dataSource.manager, dto.serviceId, dto.zoneId);
    const saved = await this.requests.save(
      this.requests.create({
        clientId,
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
      where: { clientId, ...(q.status ? { status: q.status } : {}) },
      relations: REQUEST_RELATIONS,
      order: { createdAt: 'DESC' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    });
    return { items: items.map(presentRequestForClient), page: q.page, pageSize: q.pageSize, total };
  }

  async getMine(clientId: string, id: string): Promise<ClientRequestView> {
    return presentRequestForClient(await this.findOwned(this.dataSource.manager, clientId, id));
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
    });
    return this.getMine(clientId, id);
  }

  /**
   * Pide presupuesto a profesionales concretos (máx. 3 por solicitud, en total).
   * Reglas: el profesional ofrece ese servicio, no es el propio cliente y,
   * si la solicitud es URGENT, marcó "Disponible hoy".
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
      if (existing.length + newIds.length > MAX_INVITATIONS_PER_REQUEST) {
        throw AppException.unprocessable(
          ErrorCode.INVITATION_LIMIT_REACHED,
          `Podés pedir presupuesto a ${MAX_INVITATIONS_PER_REQUEST} profesionales como máximo`,
          { max: MAX_INVITATIONS_PER_REQUEST, current: existing.length },
        );
      }
      if (!newIds.length) return;

      const pros = await m.find(ProfessionalProfile, { where: { id: In(newIds) } });
      if (pros.length !== newIds.length) throw AppException.notFound('Profesional');
      const offering = await m.findBy(ProfessionalService, {
        professionalId: In(newIds),
        serviceId: request.serviceId,
      });
      for (const pro of pros) {
        if (pro.userId === clientId)
          throw AppException.unprocessable(
            ErrorCode.CANNOT_INVITE_SELF,
            'No podés pedirte presupuesto a vos mismo',
          );
        if (!offering.some((o) => o.professionalId === pro.id)) {
          throw AppException.unprocessable(
            ErrorCode.PROFESSIONAL_NOT_ELIGIBLE,
            'El profesional no ofrece este servicio',
            { professionalId: pro.id },
          );
        }
        if (request.urgency === RequestUrgency.URGENT && !isAvailableToday(pro)) {
          throw AppException.unprocessable(
            ErrorCode.PROFESSIONAL_NOT_ELIGIBLE,
            'Para urgencias solo se puede invitar a quien está disponible hoy',
            {
              professionalId: pro.id,
            },
          );
        }
      }

      await m.insert(
        RequestInvitation,
        newIds.map((professionalId) => ({ requestId: id, professionalId, status: InvitationStatus.PENDING })),
      );
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
