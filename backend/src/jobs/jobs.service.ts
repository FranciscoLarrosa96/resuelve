import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-codes';
import { businessToday } from '../common/time';
import { recalculateProfessionalMetrics } from '../professionals/professional-metrics';
import { ProfessionalProfile } from '../professionals/professional-profile.entity';
import { Quote } from '../quotes/quote.entity';
import { presentQuote } from '../quotes/quote.presenter';
import { assertTransition, CONTACT_SHARED_STATUSES } from '../requests/request-state-machine';
import { Party, RequestStatus } from '../requests/request.enums';
import { ServiceRequest } from '../requests/service-request.entity';
import { JobChecklistItem, JobStatus } from './job.entity';
import { assertJobTransition } from './job-state';
import { JobChecklistDto, JobNotesDto, ScheduleJobDto } from './dto/job.dto';

interface LockedJob {
  id: string;
  request_id: string;
  accepted_quote_id: string;
  professional_id: string;
  client_id: string;
  status: JobStatus;
  scheduled_date: string | null;
  scheduled_time: string | null;
  duration_minutes: number | null;
  private_notes: string;
  checklist: JobChecklistItem[];
  started_at: Date | null;
  completed_at: Date | null;
  cancelled_at: Date | null;
  request_status: RequestStatus;
}

interface JobRow {
  id: string;
  request_id: string;
  status: JobStatus;
  scheduled_date: string | Date | null;
  scheduled_time: string | null;
  duration_minutes: number | null;
  started_at: Date | null;
  completed_at: Date | null;
  cancelled_at: Date | null;
  title: string;
  service_name: string;
  zone_name: string;
  first_name: string;
  last_name: string;
}

interface JobDetailRow extends JobRow {
  request_id: string;
  accepted_quote_id: string;
  client_id: string;
  description: string;
  urgency: string;
  request_status: RequestStatus;
  exact_address: string | null;
  service_id: string;
  zone_id: string;
  phone: string | null;
  private_notes: string;
  checklist: JobChecklistItem[] | null;
}

interface JobEventRow {
  id: string;
  type: string;
  details: Record<string, unknown>;
  created_at: Date;
  actor_user_id: string | null;
  first_name: string | null;
  last_name: string | null;
}

const NOT_FOUND = () => AppException.notFound('Trabajo');

@Injectable()
export class JobsService {
  constructor(private readonly dataSource: DataSource) {}

  async list(pro: ProfessionalProfile) {
    const rows = await this.dataSource.query<JobRow[]>(
      `SELECT j.id, j.request_id, j.status, j.scheduled_date, j.scheduled_time,
              j.duration_minutes, j.started_at, j.completed_at, j.cancelled_at,
              r.title, s.name AS service_name, z.name AS zone_name,
              u.first_name, u.last_name
         FROM jobs j
         JOIN service_requests r ON r.id = j.request_id
         JOIN services s ON s.id = r.service_id
         JOIN zones z ON z.id = r.zone_id
         JOIN users u ON u.id = j.client_id
        WHERE j.professional_id = $1
        ORDER BY
          CASE WHEN j.status = 'TO_COORDINATE' THEN 0 WHEN j.scheduled_date = $2 THEN 1
               WHEN j.status = 'IN_PROGRESS' THEN 2 WHEN j.status = 'SCHEDULED' THEN 3 ELSE 4 END,
          j.scheduled_date ASC NULLS LAST, j.scheduled_time ASC NULLS LAST, j.updated_at DESC`,
      [pro.id, businessToday()],
    );
    const items = rows.map((row) => this.presentListItem(row));
    return {
      items,
      counts: {
        toCoordinate: items.filter((item) => item.status === JobStatus.TO_COORDINATE).length,
        today: items.filter((item) => item.scheduledDate === businessToday() && item.status !== JobStatus.CANCELLED).length,
        inProgress: items.filter((item) => item.status === JobStatus.IN_PROGRESS).length,
        completed: items.filter((item) => item.status === JobStatus.COMPLETED).length,
      },
    };
  }

  async get(pro: ProfessionalProfile, id: string) {
    const rows = await this.dataSource.query<JobDetailRow[]>(
      `SELECT j.*, r.title, r.description, r.urgency, r.status AS request_status,
              r.exact_address, s.id AS service_id, s.name AS service_name,
              z.id AS zone_id, z.name AS zone_name,
              u.first_name, u.last_name, u.phone
         FROM jobs j
         JOIN service_requests r ON r.id = j.request_id
         JOIN services s ON s.id = r.service_id
         JOIN zones z ON z.id = r.zone_id
         JOIN users u ON u.id = j.client_id
        WHERE j.id = $1 AND j.professional_id = $2`,
      [id, pro.id],
    );
    const row = rows[0];
    if (!row) throw NOT_FOUND();

    const quote = await this.dataSource.getRepository(Quote).findOne({
      where: { id: row.accepted_quote_id, requestId: row.request_id, professionalId: pro.id },
      relations: { items: true },
    });
    if (!quote) throw NOT_FOUND();

    const events = await this.dataSource.query<JobEventRow[]>(
      `SELECT e.id, e.type, e.details, e.created_at, u.id AS actor_user_id, u.first_name, u.last_name
         FROM job_events e
         LEFT JOIN users u ON u.id = e.actor_user_id
        WHERE e.job_id = $1
        ORDER BY e.created_at DESC, e.id DESC`,
      [id],
    );
    const canSeeContact = CONTACT_SHARED_STATUSES.includes(row.request_status);
    return {
      ...this.presentListItem(row),
      acceptedQuoteId: row.accepted_quote_id,
      clientId: row.client_id,
      description: row.description,
      urgency: row.urgency,
      requestStatus: row.request_status,
      service: { id: row.service_id, name: row.service_name },
      zone: { id: row.zone_id, name: row.zone_name },
      client: {
        firstName: row.first_name,
        lastInitial: row.last_name?.charAt(0) ?? '',
        fullName: canSeeContact ? row.first_name + ' ' + row.last_name : row.first_name + ' ' + (row.last_name?.charAt(0) ?? '') + '.',
        phone: canSeeContact ? row.phone : null,
        exactAddress: canSeeContact ? row.exact_address : null,
      },
      acceptedQuote: presentQuote(quote),
      privateNotes: row.private_notes,
      checklist: row.checklist ?? [],
      history: events.map((event) => ({
        id: event.id,
        type: event.type,
        details: event.details,
        actor: event.actor_user_id === pro.userId
          ? 'Vos'
          : event.actor_user_id === row.client_id
            ? 'Cliente'
            : event.actor_user_id
              ? event.first_name + ' ' + event.last_name
              : 'Sistema',
        createdAt: event.created_at,
      })),
    };
  }

  async schedule(pro: ProfessionalProfile, id: string, dto: ScheduleJobDto) {
    this.validateSchedule(dto);
    await this.dataSource.transaction(async (m) => {
      const job = await this.lockJob(m, pro.id, id);
      assertJobTransition(job.status, JobStatus.SCHEDULED);
      if (![RequestStatus.PROFESSIONAL_SELECTED, RequestStatus.SCHEDULED].includes(job.request_status)) {
        throw AppException.conflict(ErrorCode.INVALID_REQUEST_STATE, 'Este trabajo ya no se puede coordinar');
      }
      const previous = { date: job.scheduled_date, time: job.scheduled_time };
      await m.query(
        `UPDATE jobs
            SET status = 'SCHEDULED', scheduled_date = $2, scheduled_time = $3,
                duration_minutes = $4, cancelled_at = NULL, cancelled_by = NULL, updated_at = now()
          WHERE id = $1`,
        [id, dto.scheduledDate, dto.scheduledTime ?? null, dto.durationMinutes ?? null],
      );
      if (job.request_status === RequestStatus.PROFESSIONAL_SELECTED) {
        assertTransition(job.request_status, RequestStatus.SCHEDULED);
        await m.update(ServiceRequest, job.request_id, { status: RequestStatus.SCHEDULED });
      }
      await m.query(
        `UPDATE appointments SET status = 'CANCELLED', cancelled_by = 'PROFESSIONAL'
          WHERE request_id = $1 AND status IN ('PROPOSED', 'CONFIRMED')`,
        [job.request_id],
      );
      await this.event(m, id, pro.userId, previous.date ? 'RESCHEDULED' : 'SCHEDULED', {
        date: dto.scheduledDate,
        time: dto.scheduledTime ?? null,
        durationMinutes: dto.durationMinutes ?? null,
      });
    });
    return this.get(pro, id);
  }

  async start(pro: ProfessionalProfile, id: string) {
    await this.dataSource.transaction(async (m) => {
      const job = await this.lockJob(m, pro.id, id);
      if (job.status === JobStatus.IN_PROGRESS) return;
      assertJobTransition(job.status, JobStatus.IN_PROGRESS);
      await m.query(`UPDATE jobs SET status = 'IN_PROGRESS', started_at = now(), updated_at = now() WHERE id = $1`, [id]);
      await this.event(m, id, pro.userId, 'STARTED', {});
    });
    return this.get(pro, id);
  }

  async complete(pro: ProfessionalProfile, id: string) {
    await this.dataSource.transaction(async (m) => {
      const job = await this.lockJob(m, pro.id, id);
      if (job.status === JobStatus.COMPLETED) return;
      assertJobTransition(job.status, JobStatus.COMPLETED);
      assertTransition(job.request_status, RequestStatus.COMPLETED);
      await m.query(`UPDATE jobs SET status = 'COMPLETED', completed_at = now(), updated_at = now() WHERE id = $1`, [id]);
      await m.update(ServiceRequest, job.request_id, {
        status: RequestStatus.COMPLETED,
        completedAt: new Date(),
        completedBy: Party.PROFESSIONAL,
      });
      await m.query(
        `UPDATE appointments SET status = 'COMPLETED'
          WHERE request_id = $1 AND status = 'CONFIRMED'`,
        [job.request_id],
      );
      await this.event(m, id, pro.userId, 'COMPLETED', {});
      await recalculateProfessionalMetrics(m, pro.id);
    });
    return this.get(pro, id);
  }

  async cancel(pro: ProfessionalProfile, id: string) {
    await this.dataSource.transaction(async (m) => {
      const job = await this.lockJob(m, pro.id, id);
      if (job.status === JobStatus.CANCELLED) return;
      assertJobTransition(job.status, JobStatus.CANCELLED);
      if (job.request_status !== RequestStatus.CANCELLED) {
        assertTransition(job.request_status, RequestStatus.CANCELLED);
        await m.update(ServiceRequest, job.request_id, {
          status: RequestStatus.CANCELLED,
          cancelledAt: new Date(),
        });
      }
      await m.query(
        `UPDATE jobs SET status = 'CANCELLED', cancelled_at = now(), cancelled_by = 'PROFESSIONAL',
                updated_at = now() WHERE id = $1`,
        [id],
      );
      await m.query(
        `UPDATE appointments SET status = 'CANCELLED', cancelled_by = 'PROFESSIONAL'
          WHERE request_id = $1 AND status IN ('PROPOSED', 'CONFIRMED')`,
        [job.request_id],
      );
      await this.event(m, id, pro.userId, 'CANCELLED', { cancelledBy: Party.PROFESSIONAL });
    });
    return this.get(pro, id);
  }

  async updateNotes(pro: ProfessionalProfile, id: string, dto: JobNotesDto) {
    if (dto.privateNotes.length > 2000) {
      throw AppException.unprocessable(ErrorCode.VALIDATION_ERROR, 'Las notas no pueden superar 2000 caracteres');
    }
    await this.dataSource.transaction(async (m) => {
      await this.lockJob(m, pro.id, id);
      await m.query(`UPDATE jobs SET private_notes = $2, updated_at = now() WHERE id = $1`, [id, dto.privateNotes]);
      await this.event(m, id, pro.userId, 'NOTES_UPDATED', {});
    });
    return this.get(pro, id);
  }

  async updateChecklist(pro: ProfessionalProfile, id: string, dto: JobChecklistDto) {
    if (dto.items.length > 10) {
      throw AppException.unprocessable(ErrorCode.VALIDATION_ERROR, 'El checklist admite hasta 10 tareas');
    }
    const items = dto.items.map((item) => ({
      id: item.id || randomUUID(),
      text: item.text.trim(),
      done: item.done,
    }));
    if (items.some((item) => !item.text)) {
      throw AppException.unprocessable(ErrorCode.VALIDATION_ERROR, 'Cada tarea necesita un texto');
    }
    await this.dataSource.transaction(async (m) => {
      await this.lockJob(m, pro.id, id);
      await m.query(`UPDATE jobs SET checklist = $2::jsonb, updated_at = now() WHERE id = $1`, [id, JSON.stringify(items)]);
      await this.event(m, id, pro.userId, 'CHECKLIST_UPDATED', { items: items.length });
    });
    return this.get(pro, id);
  }

  private async lockJob(m: EntityManager, professionalId: string, id: string): Promise<LockedJob> {
    const rows = await m.query<LockedJob[]>(
      `SELECT j.*, r.status AS request_status
         FROM jobs j JOIN service_requests r ON r.id = j.request_id
        WHERE j.id = $1 AND j.professional_id = $2
        FOR UPDATE OF j, r`,
      [id, professionalId],
    );
    if (!rows[0]) throw NOT_FOUND();
    return rows[0];
  }

  private async event(m: EntityManager, jobId: string, actorUserId: string, type: string, details: object) {
    await m.query(
      `INSERT INTO job_events (job_id, actor_user_id, type, details) VALUES ($1, $2, $3, $4::jsonb)`,
      [jobId, actorUserId, type, JSON.stringify(details)],
    );
  }

  private validateSchedule(dto: ScheduleJobDto): void {
    const [year, month, day] = dto.scheduledDate.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day ||
      dto.scheduledDate < businessToday()
    ) {
      throw AppException.unprocessable(ErrorCode.VALIDATION_ERROR, 'Elegí una fecha válida desde hoy en adelante');
    }
    if (dto.scheduledTime && dto.scheduledDate === businessToday()) {
      const at = new Date(dto.scheduledDate + 'T' + dto.scheduledTime + ':00-03:00').getTime();
      if (at <= Date.now()) {
        throw AppException.unprocessable(ErrorCode.VALIDATION_ERROR, 'Elegí un horario futuro');
      }
    }
  }

  private presentListItem(row: JobRow | JobDetailRow) {
    const scheduledDate = row.scheduled_date instanceof Date
      ? row.scheduled_date.toISOString().slice(0, 10)
      : row.scheduled_date;
    return {
      id: row.id,
      requestId: row.request_id,
      status: row.status,
      scheduledDate,
      scheduledTime: row.scheduled_time ? String(row.scheduled_time).slice(0, 5) : null,
      durationMinutes: row.duration_minutes,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      cancelledAt: row.cancelled_at,
      title: row.title,
      service: { name: row.service_name },
      zone: { name: row.zone_name },
      client: {
        firstName: row.first_name,
        lastInitial: row.last_name?.charAt(0) ?? '',
      },
    };
  }
}
