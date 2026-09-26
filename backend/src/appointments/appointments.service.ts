import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager, In, LessThan, MoreThan, Not } from 'typeorm';
import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-codes';
import { businessDayStart, businessToday } from '../common/time';
import { AUDIENCE_TYPES, NotificationType } from '../notifications/notification.entity';
import { markNotificationsRead, notify } from '../notifications/notify';
import { recalculateProfessionalMetrics } from '../professionals/professional-metrics';
import { ProfessionalProfile } from '../professionals/professional-profile.entity';
import { ProRequestsService } from '../requests/pro-requests.service';
import {
  assertTransition,
  COORDINATION_STATUSES,
  WORK_DONE_STATUSES,
} from '../requests/request-state-machine';
import { RequestStatus } from '../requests/request.enums';
import { RequestsService } from '../requests/requests.service';
import { ServiceRequest } from '../requests/service-request.entity';
import {
  ACTIVE_APPOINTMENT_STATUSES,
  Appointment,
  AppointmentParty,
  AppointmentStatus,
} from './appointment.entity';
import { presentAppointment } from './appointment.presenter';
import { completionDueQuery, isCompletionDue } from './completion';
import { AppointmentsQueryDto, ProposeAppointmentDto } from './dto/appointment.dto';

const DAY_MS = 24 * 3600 * 1000;
const MAX_RANGE_DAYS = 62;
/** Hasta cuándo se puede proponer una fecha. */
const MAX_DAYS_AHEAD = 180;
/** Lo que muestra la agenda: las canceladas y rechazadas quedan como historial, no como ruido. */
const AGENDA_STATUSES = [
  AppointmentStatus.PROPOSED,
  AppointmentStatus.CONFIRMED,
  AppointmentStatus.COMPLETED,
];

const isUniqueViolation = (e: unknown) => (e as { code?: string })?.code === '23505';

const stateChanged = (current: AppointmentStatus | null) =>
  AppException.conflict(
    ErrorCode.APPOINTMENT_STATE_CHANGED,
    'La cita cambió mientras tanto. Actualizá para ver el estado actual.',
    { status: current },
  );

/**
 * Coordinación del trabajo después de aceptar un presupuesto:
 *
 *   PROFESSIONAL_SELECTED ─ el elegido propone ─→ cita PROPOSED
 *     cliente confirma → cita CONFIRMED, solicitud SCHEDULED
 *     cliente pide otro horario → cita DECLINED (la solicitud sigue PROFESSIONAL_SELECTED)
 *   SCHEDULED ─ cancelar / reprogramar → cita CANCELLED, solicitud PROFESSIONAL_SELECTED
 *   SCHEDULED + terminó el horario ─ cliente o elegido confirman → cita y solicitud COMPLETED
 *
 * Cada paso notifica a la OTRA parte (`notify`, en la misma transacción).
 *
 * Concurrencia: toda operación bloquea la fila de la solicitud (FOR UPDATE)
 * y decide por el estado releído bajo lock, nunca por lo que tenía la UI. Las
 * que pueden ocupar un horario (proponer, confirmar) bloquean además el perfil
 * del profesional para que dos confirmaciones simultáneas no se superpongan.
 * Orden de locks: solicitud → perfil.
 */
@Injectable()
export class AppointmentsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly clientRequests: RequestsService,
    private readonly proRequests: ProRequestsService,
  ) {}

  // ---- Profesional ---------------------------------------------------------

  /** Propone fecha y horario. Con `replacesAppointmentId` cambia la propuesta o reprograma una cita confirmada. */
  async propose(pro: ProfessionalProfile, requestId: string, dto: ProposeAppointmentDto) {
    const start = new Date(dto.startsAt);
    const end = new Date(start.getTime() + dto.durationMinutes * 60_000);
    const now = Date.now();
    if (start.getTime() <= now)
      throw AppException.unprocessable(ErrorCode.VALIDATION_ERROR, 'El horario tiene que ser en el futuro');
    if (start.getTime() > now + MAX_DAYS_AHEAD * DAY_MS)
      throw AppException.unprocessable(
        ErrorCode.VALIDATION_ERROR,
        `Se puede proponer hasta ${MAX_DAYS_AHEAD} días hacia adelante`,
      );

    try {
      await this.dataSource.transaction(async (m) => {
        const request = await this.lockSelectedRequest(m, pro.id, requestId);
        if (!COORDINATION_STATUSES.includes(request.status)) {
          throw AppException.conflict(
            ErrorCode.INVALID_REQUEST_STATE,
            'Este trabajo ya no se puede coordinar',
            {
              status: request.status,
            },
          );
        }
        const active = await this.activeFor(m, requestId);
        if ((active?.id ?? null) !== (dto.replacesAppointmentId ?? null))
          throw stateChanged(active?.status ?? null);

        await this.lockProfessional(m, pro.id);
        await this.assertNoOverlap(m, pro.id, start, end, active?.id);

        if (active) {
          await m.update(Appointment, active.id, {
            status: AppointmentStatus.CANCELLED,
            cancelledBy: AppointmentParty.PROFESSIONAL,
          });
          // Reprogramar una cita confirmada: el cliente tiene que volver a confirmar.
          if (active.status === AppointmentStatus.CONFIRMED) {
            assertTransition(request.status, RequestStatus.PROFESSIONAL_SELECTED);
            await m.update(ServiceRequest, requestId, { status: RequestStatus.PROFESSIONAL_SELECTED });
          }
        }
        const { identifiers } = await m.insert(Appointment, {
          requestId,
          quoteId: request.acceptedQuoteId!,
          professionalId: pro.id,
          clientId: request.clientId,
          scheduledStart: start,
          scheduledEnd: end,
          status: AppointmentStatus.PROPOSED,
          note: dto.note || null,
        });
        await notify(
          m,
          {
            userId: request.clientId,
            type:
              active?.status === AppointmentStatus.CONFIRMED
                ? NotificationType.CLIENT_APPOINTMENT_RESCHEDULED
                : NotificationType.CLIENT_APPOINTMENT_PROPOSED,
            requestId,
            appointmentId: identifiers[0].id as string,
          },
          pro.userId,
        );
      });
    } catch (e) {
      // Dos propuestas simultáneas: el índice único parcial deja pasar solo una.
      if (isUniqueViolation(e)) throw stateChanged(null);
      throw e;
    }
    return this.proRequests.get(pro, requestId);
  }

  /**
   * Agenda del profesional autenticado: citas que se cruzan con [from, to).
   * Solo lo necesario para la grilla; teléfono y dirección quedan en el detalle.
   */
  async agenda(pro: ProfessionalProfile, q: AppointmentsQueryDto) {
    const from = q.from ? new Date(q.from) : businessDayStart(businessToday());
    const to = q.to ? new Date(q.to) : new Date(from.getTime() + 7 * DAY_MS);
    if (to <= from || to.getTime() - from.getTime() > MAX_RANGE_DAYS * DAY_MS) {
      throw AppException.unprocessable(
        ErrorCode.VALIDATION_ERROR,
        `El rango debe ser positivo y de hasta ${MAX_RANGE_DAYS} días`,
      );
    }
    const list = await this.dataSource.getRepository(Appointment).find({
      where: {
        professionalId: pro.id,
        status: In(AGENDA_STATUSES),
        scheduledStart: LessThan(to),
        scheduledEnd: MoreThan(from),
      },
      relations: { request: { zone: true, service: true, client: true } },
      order: { scheduledStart: 'ASC' },
    });
    return list.map(toAgendaItem);
  }

  /** Trabajos con horario confirmado ya terminado que siguen sin cerrar (de cualquier semana). */
  async completionDue(pro: ProfessionalProfile) {
    const list = await completionDueQuery(this.dataSource.manager, { professionalId: pro.id })
      .leftJoinAndSelect('a.request', 'req')
      .leftJoinAndSelect('req.zone', 'zone')
      .leftJoinAndSelect('req.service', 'service')
      .leftJoinAndSelect('req.client', 'client')
      .orderBy('a.scheduled_start', 'ASC')
      .getMany();
    return list.map(toAgendaItem);
  }

  // ---- Cliente -------------------------------------------------------------

  /** Confirma el horario propuesto → cita CONFIRMED y solicitud SCHEDULED. */
  async confirm(clientId: string, appointmentId: string) {
    const requestId = await this.dataSource.transaction(async (m) => {
      const { request, appointment } = await this.lockForClient(m, clientId, appointmentId);
      if (appointment.status === AppointmentStatus.CONFIRMED) return request.id; // doble click
      if (appointment.status !== AppointmentStatus.PROPOSED) throw stateChanged(appointment.status);
      if (appointment.scheduledStart.getTime() <= Date.now()) {
        throw AppException.conflict(
          ErrorCode.APPOINTMENT_EXPIRED,
          'Ese horario ya pasó. El profesional te va a proponer otro.',
        );
      }
      assertTransition(request.status, RequestStatus.SCHEDULED);
      const pro = await this.lockProfessional(m, appointment.professionalId);
      await this.assertNoOverlap(
        m,
        appointment.professionalId,
        appointment.scheduledStart,
        appointment.scheduledEnd,
        appointment.id,
      );
      await m.update(Appointment, appointment.id, { status: AppointmentStatus.CONFIRMED });
      await m.update(ServiceRequest, request.id, { status: RequestStatus.SCHEDULED });
      await notify(
        m,
        {
          userId: pro.userId,
          type: NotificationType.PRO_APPOINTMENT_CONFIRMED,
          requestId: request.id,
          appointmentId: appointment.id,
        },
        clientId,
      );
      return request.id;
    });
    return this.clientRequests.getMine(clientId, requestId);
  }

  /** "No puedo en ese horario": rechaza la cita, no al profesional. La solicitud sigue PROFESSIONAL_SELECTED. */
  async decline(clientId: string, appointmentId: string) {
    const requestId = await this.dataSource.transaction(async (m) => {
      const { request, appointment } = await this.lockForClient(m, clientId, appointmentId);
      if (appointment.status === AppointmentStatus.DECLINED) return request.id; // doble click
      if (appointment.status !== AppointmentStatus.PROPOSED) throw stateChanged(appointment.status);
      await m.update(Appointment, appointment.id, { status: AppointmentStatus.DECLINED });
      await this.notifyNeedsAnotherTime(m, appointment, clientId);
      return request.id;
    });
    return this.clientRequests.getMine(clientId, requestId);
  }

  // ---- Cliente o profesional elegido ---------------------------------------

  /**
   * Cancela el horario (no la solicitud). El cliente cancela una cita
   * confirmada; el profesional elegido, también una propuesta. Si estaba
   * confirmada, la solicitud vuelve a PROFESSIONAL_SELECTED con el mismo
   * profesional: no se reabre la competencia entre presupuestos.
   */
  async cancel(userId: string, appointmentId: string) {
    const actor = await this.dataSource.transaction(async (m) => {
      const found = await m.findOneBy(Appointment, { id: appointmentId });
      const request =
        found &&
        (await m.findOne(ServiceRequest, {
          where: { id: found.requestId },
          lock: { mode: 'pessimistic_write' },
        }));
      if (!found || !request) throw AppException.notFound('Cita');
      const pro = request.clientId === userId ? null : await m.findOneBy(ProfessionalProfile, { userId });
      const isSelectedPro =
        !!pro && pro.id === found.professionalId && pro.id === request.selectedProfessionalId;
      if (request.clientId !== userId && !isSelectedPro) throw AppException.notFound('Cita');

      const appointment = await m.findOneByOrFail(Appointment, { id: appointmentId });
      const party = pro ? AppointmentParty.PROFESSIONAL : AppointmentParty.CLIENT;
      const cancellable = pro ? ACTIVE_APPOINTMENT_STATUSES : [AppointmentStatus.CONFIRMED];
      if (appointment.status === AppointmentStatus.CANCELLED) return { requestId: request.id, pro }; // doble click
      if (!(cancellable as readonly AppointmentStatus[]).includes(appointment.status)) {
        throw stateChanged(appointment.status);
      }
      await m.update(Appointment, appointment.id, {
        status: AppointmentStatus.CANCELLED,
        cancelledBy: party,
      });
      if (appointment.status === AppointmentStatus.CONFIRMED) {
        assertTransition(request.status, RequestStatus.PROFESSIONAL_SELECTED);
        await m.update(ServiceRequest, request.id, { status: RequestStatus.PROFESSIONAL_SELECTED });
      }
      if (pro) {
        // El profesional retiró el horario: el aviso al cliente deja de pedir algo.
        await markNotificationsRead(m, {
          userId: request.clientId,
          requestId: request.id,
          types: AUDIENCE_TYPES.CLIENT.filter((t) => t !== NotificationType.CLIENT_QUOTE_RECEIVED),
        });
      } else {
        // "Necesitamos otro horario" (también después del horario, si el trabajo no se hizo).
        await this.notifyNeedsAnotherTime(m, appointment, userId);
      }
      return { requestId: request.id, pro };
    });
    return actor.pro
      ? this.proRequests.get(actor.pro, actor.requestId)
      : this.clientRequests.getMine(userId, actor.requestId);
  }

  /**
   * "El trabajo se realizó": lo confirma el cliente dueño o el profesional
   * elegido (cualquiera de los dos, para que un olvido no deje el trabajo
   * abierto), solo con la cita confirmada y su horario ya terminado. El paso
   * del tiempo nunca completa nada por sí solo. Cita y solicitud pasan a
   * COMPLETED en la misma transacción; se registra quién lo confirmó.
   * Idempotente: si la otra parte ya lo cerró, responde el estado actual.
   * Cualquier otra persona (incluido un invitado no elegido) recibe 404.
   */
  async complete(userId: string, requestId: string) {
    const actor = await this.dataSource.transaction(async (m) => {
      const request = await m.findOne(ServiceRequest, {
        where: { id: requestId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!request) throw AppException.notFound('Solicitud');
      const pro = request.clientId === userId ? null : await m.findOneBy(ProfessionalProfile, { userId });
      if (request.clientId !== userId && (!pro || pro.id !== request.selectedProfessionalId)) {
        throw AppException.notFound('Solicitud');
      }
      if (WORK_DONE_STATUSES.includes(request.status)) return { pro }; // la otra parte ya lo cerró
      assertTransition(request.status, RequestStatus.COMPLETED);
      const confirmed = await m.findOneBy(Appointment, { requestId, status: AppointmentStatus.CONFIRMED });
      if (!confirmed) throw stateChanged(null);
      if (!isCompletionDue(request.status, confirmed)) {
        throw AppException.conflict(
          ErrorCode.APPOINTMENT_NOT_ENDED,
          'Vas a poder confirmarlo cuando termine el horario agendado',
          { endsAt: confirmed.scheduledEnd },
        );
      }
      await m.update(Appointment, confirmed.id, { status: AppointmentStatus.COMPLETED });
      await m.update(ServiceRequest, requestId, {
        status: RequestStatus.COMPLETED,
        completedAt: new Date(),
        completedBy: pro ? AppointmentParty.PROFESSIONAL : AppointmentParty.CLIENT,
      });
      await recalculateProfessionalMetrics(m, confirmed.professionalId);
      return { pro };
    });
    return actor.pro
      ? this.proRequests.get(actor.pro, requestId)
      : this.clientRequests.getMine(userId, requestId);
  }

  // ---- helpers -------------------------------------------------------------

  /** Aviso al profesional: el cliente necesita otro horario (rechazó la propuesta o canceló la cita). */
  private async notifyNeedsAnotherTime(m: EntityManager, appointment: Appointment, clientId: string) {
    const pro = await m.findOneByOrFail(ProfessionalProfile, { id: appointment.professionalId });
    await notify(
      m,
      {
        userId: pro.userId,
        type: NotificationType.PRO_APPOINTMENT_DECLINED,
        requestId: appointment.requestId,
        appointmentId: appointment.id,
      },
      clientId,
    );
  }

  /** Solo el profesional elegido: los demás invitados (y cualquier otro) reciben 404. */
  private async lockSelectedRequest(m: EntityManager, professionalId: string, requestId: string) {
    const request = await m.findOne(ServiceRequest, {
      where: { id: requestId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!request || request.selectedProfessionalId !== professionalId)
      throw AppException.notFound('Solicitud');
    return request;
  }

  /** Cita + solicitud del cliente dueño (404 si no es suya), releída bajo lock. */
  private async lockForClient(m: EntityManager, clientId: string, appointmentId: string) {
    const found = await m.findOneBy(Appointment, { id: appointmentId });
    const request =
      found &&
      (await m.findOne(ServiceRequest, {
        where: { id: found.requestId, clientId },
        lock: { mode: 'pessimistic_write' },
      }));
    if (!found || !request) throw AppException.notFound('Cita');
    const appointment = await m.findOneByOrFail(Appointment, { id: appointmentId });
    return { request, appointment };
  }

  private activeFor(m: EntityManager, requestId: string) {
    return m.findOneBy(Appointment, { requestId, status: In([...ACTIVE_APPOINTMENT_STATUSES]) });
  }

  /** Serializa las operaciones que ocupan horario de un mismo profesional. */
  private async lockProfessional(m: EntityManager, professionalId: string): Promise<ProfessionalProfile> {
    return m.findOneOrFail(ProfessionalProfile, {
      where: { id: professionalId },
      lock: { mode: 'pessimistic_write' },
    });
  }

  /**
   * Dos citas CONFIRMED del mismo profesional no se pueden superponer. Las
   * propuestas, canceladas y rechazadas no bloquean. El error no dice con
   * quién choca: no expone datos de otro cliente.
   */
  private async assertNoOverlap(
    m: EntityManager,
    professionalId: string,
    start: Date,
    end: Date,
    exceptId?: string,
  ): Promise<void> {
    const overlapping = await m.existsBy(Appointment, {
      professionalId,
      status: AppointmentStatus.CONFIRMED,
      scheduledStart: LessThan(end),
      scheduledEnd: MoreThan(start),
      ...(exceptId ? { id: Not(exceptId) } : {}),
    });
    if (overlapping) {
      throw AppException.conflict(
        ErrorCode.APPOINTMENT_OVERLAP,
        'Ya tenés otro trabajo agendado en ese horario',
      );
    }
  }
}

/** Ítem de agenda: solo lo necesario para la grilla (sin teléfono ni dirección). */
function toAgendaItem(a: Appointment) {
  return {
    id: a.id,
    requestId: a.requestId,
    status: a.status,
    startsAt: a.scheduledStart,
    endsAt: a.scheduledEnd,
    durationMinutes: presentAppointment(a).durationMinutes,
    /** Horario confirmado ya terminado y trabajo sin cerrar ("Pendiente de cierre"). */
    completionDue: isCompletionDue(a.request.status, a),
    title: a.request.title,
    service: { id: a.request.service.id, name: a.request.service.name },
    zone: { id: a.request.zone.id, name: a.request.zone.name },
    client: { firstName: a.request.client.firstName, lastInitial: a.request.client.lastName.charAt(0) },
  };
}
