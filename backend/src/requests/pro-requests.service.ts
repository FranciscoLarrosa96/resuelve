import { Injectable } from '@nestjs/common';
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
    const appointments = await latestAppointments(this.dataSource.manager, ids);
    return {
      items: ids.map((id) => presentRequestForProfessional(byId.get(id)!, pro.id, appointments.get(id) ?? null)),
      page: q.page,
      pageSize: q.pageSize,
      total,
    };
  }

  async get(pro: ProfessionalProfile, id: string): Promise<ProRequestView> {
    const request = await this.findInvited(pro, id);
    const appointments = await latestAppointments(this.dataSource.manager, [id]);
    return presentRequestForProfessional(request, pro.id, appointments.get(id) ?? null);
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
