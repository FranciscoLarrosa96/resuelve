import { Injectable } from '@nestjs/common';
import { DataSource, Not, Between } from 'typeorm';
import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-codes';
import { ProfessionalProfile } from '../professionals/professional-profile.entity';
import { assertTransition } from '../requests/request-state-machine';
import { RequestStatus } from '../requests/request.enums';
import { canSeeClientContact } from '../requests/request.presenter';
import { ServiceRequest } from '../requests/service-request.entity';
import { Appointment, AppointmentStatus } from './appointment.entity';
import { AppointmentsQueryDto, ScheduleAppointmentDto } from './dto/appointment.dto';

const MAX_RANGE_DAYS = 62;

@Injectable()
export class AppointmentsService {
  constructor(private readonly dataSource: DataSource) {}

  /** El cliente confirma el turno con el profesional elegido → SCHEDULED. */
  async schedule(clientId: string, requestId: string, dto: ScheduleAppointmentDto) {
    const start = new Date(dto.scheduledStart);
    const end = new Date(dto.scheduledEnd);
    if (end <= start)
      throw AppException.unprocessable(
        ErrorCode.VALIDATION_ERROR,
        'El turno debe terminar después de empezar',
      );
    if (start < new Date())
      throw AppException.unprocessable(ErrorCode.VALIDATION_ERROR, 'El turno debe ser en el futuro');

    const id = await this.dataSource.transaction(async (m) => {
      const request = await m.findOne(ServiceRequest, {
        where: { id: requestId, clientId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!request) throw AppException.notFound('Solicitud');
      assertTransition(request.status, RequestStatus.SCHEDULED);
      const appointment = await m.save(
        m.create(Appointment, {
          requestId,
          quoteId: request.acceptedQuoteId!,
          professionalId: request.selectedProfessionalId!,
          clientId,
          scheduledStart: start,
          scheduledEnd: end,
          status: AppointmentStatus.SCHEDULED,
        }),
      );
      await m.update(ServiceRequest, requestId, { status: RequestStatus.SCHEDULED });
      return appointment.id;
    });
    const appointment = await this.dataSource.getRepository(Appointment).findOneByOrFail({ id });
    return this.present(appointment);
  }

  /** Agenda del profesional. La dirección aparece porque solo lista trabajos donde lo eligieron. */
  async listForProfessional(pro: ProfessionalProfile, q: AppointmentsQueryDto) {
    const from = q.from ? new Date(q.from) : new Date(new Date().setHours(0, 0, 0, 0));
    const to = q.to ? new Date(q.to) : new Date(from.getTime() + 7 * 24 * 3600 * 1000);
    if (to <= from || to.getTime() - from.getTime() > MAX_RANGE_DAYS * 24 * 3600 * 1000) {
      throw AppException.unprocessable(
        ErrorCode.VALIDATION_ERROR,
        `El rango debe ser positivo y de hasta ${MAX_RANGE_DAYS} días`,
      );
    }
    const list = await this.dataSource.getRepository(Appointment).find({
      where: {
        professionalId: pro.id,
        status: Not(AppointmentStatus.CANCELLED),
        scheduledStart: Between(from, to),
      },
      relations: { request: { zone: true, service: true, client: true } },
      order: { scheduledStart: 'ASC' },
    });
    return list.map((a) => ({
      ...this.present(a),
      request: {
        id: a.request.id,
        title: a.request.title,
        status: a.request.status,
        service: a.request.service.name,
        zone: a.request.zone.name,
        // Misma regla de privacidad que en /pro/requests.
        contact: canSeeClientContact(a.request, pro.id)
          ? {
              fullName: `${a.request.client.firstName} ${a.request.client.lastName}`,
              phone: a.request.client.phone,
              exactAddress: a.request.exactAddress,
            }
          : null,
      },
    }));
  }

  private present(a: Appointment) {
    return {
      id: a.id,
      requestId: a.requestId,
      quoteId: a.quoteId,
      professionalId: a.professionalId,
      clientId: a.clientId,
      scheduledStart: a.scheduledStart,
      scheduledEnd: a.scheduledEnd,
      status: a.status,
    };
  }
}
