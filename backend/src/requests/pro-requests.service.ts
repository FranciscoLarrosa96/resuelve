import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Appointment, AppointmentStatus } from '../appointments/appointment.entity';
import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-codes';
import { Paginated } from '../common/pagination/pagination';
import { recalculateProfessionalMetrics } from '../professionals/professional-metrics';
import { ProfessionalProfile } from '../professionals/professional-profile.entity';
import { ProRequestsQueryDto } from './dto/pro-request.dto';
import { RequestInvitation } from './request-invitation.entity';
import { assertTransition } from './request-state-machine';
import { InvitationStatus, RequestStatus } from './request.enums';
import { presentRequestForProfessional } from './request.presenter';
import { REQUEST_RELATIONS } from './request.relations';
import { ServiceRequest } from './service-request.entity';

type ProRequestView = ReturnType<typeof presentRequestForProfessional>;

/** Solicitudes desde el lado del profesional: solo las que recibió. */
@Injectable()
export class ProRequestsService {
  constructor(
    @InjectRepository(RequestInvitation) private readonly invitations: Repository<RequestInvitation>,
    private readonly dataSource: DataSource,
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
    return {
      items: ids.map((id) => presentRequestForProfessional(byId.get(id)!, pro.id)),
      page: q.page,
      pageSize: q.pageSize,
      total,
    };
  }

  async get(pro: ProfessionalProfile, id: string): Promise<ProRequestView> {
    return presentRequestForProfessional(await this.findInvited(pro, id), pro.id);
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
    });
    return this.get(pro, id);
  }

  /** El profesional elegido marca el trabajo como terminado → queda pendiente de reseña. */
  async complete(pro: ProfessionalProfile, id: string): Promise<ProRequestView> {
    await this.dataSource.transaction(async (m) => {
      const request = await m.findOne(ServiceRequest, { where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!request || !(await m.existsBy(RequestInvitation, { requestId: id, professionalId: pro.id })))
        throw AppException.notFound('Solicitud');
      if (request.selectedProfessionalId !== pro.id)
        throw AppException.forbidden('Solo el profesional elegido puede completar el trabajo');
      assertTransition(request.status, RequestStatus.AWAITING_REVIEW);

      await m.update(ServiceRequest, id, { status: RequestStatus.AWAITING_REVIEW, completedAt: new Date() });
      await m.update(Appointment, { requestId: id }, { status: AppointmentStatus.COMPLETED });
      await recalculateProfessionalMetrics(m, pro.id);
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
}
