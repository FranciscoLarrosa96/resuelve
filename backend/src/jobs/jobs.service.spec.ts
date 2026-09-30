import { DataSource, EntityManager } from 'typeorm';
import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-codes';
import { ProfessionalProfile } from '../professionals/professional-profile.entity';
import { RequestStatus } from '../requests/request.enums';
import { JobStatus } from './job.entity';
import { JobsService } from './jobs.service';

const PRO = { id: 'pro-owned', userId: 'user-owned' } as ProfessionalProfile;
const QUOTE = {
  id: 'quote-1', requestId: 'request-1', professionalId: PRO.id,
  description: 'Reparación', note: null, estimatedDuration: null,
  laborAmount: '100.00', materialsAmount: '0.00', totalAmount: '100.00',
  availableFrom: null, validUntil: null, status: 'ACCEPTED', items: [],
  createdAt: new Date(), updatedAt: new Date(),
};

function harness(status = JobStatus.TO_COORDINATE, requestStatus = RequestStatus.PROFESSIONAL_SELECTED) {
  const locked = {
    id: 'job-1', request_id: 'request-1', accepted_quote_id: 'quote-1',
    professional_id: PRO.id, client_id: 'client-1', status, request_status: requestStatus,
    scheduled_date: status === JobStatus.SCHEDULED ? '2099-05-03' : null,
    scheduled_time: status === JobStatus.SCHEDULED ? '09:30:00' : null,
    duration_minutes: null, private_notes: '', checklist: [], started_at: null,
    completed_at: null, cancelled_at: null,
  };
  const detail = {
    ...locked, status, request_status: requestStatus, title: 'Trabajo de prueba',
    description: 'Detalle', urgency: 'FLEXIBLE', exact_address: 'Alem 455',
    service_id: 's1', service_name: 'Plomería', zone_id: 'z1', zone_name: 'Centro',
    first_name: 'Ana', last_name: 'Gómez', phone: '+54 249 400 0000',
  };
  const managerQuery = jest.fn(async (sql: string, _values?: unknown[]) => sql.includes('FOR UPDATE OF j, r') ? [locked] : []);
  const managerUpdate = jest.fn().mockResolvedValue(undefined);
  const manager = { query: managerQuery, update: managerUpdate } as unknown as EntityManager;
  const transaction = jest.fn((work: (manager: EntityManager) => Promise<unknown>) => work(manager));
  const dataQuery = jest.fn(async (sql: string) => sql.includes('FROM job_events') ? [] : [detail]);
  const getRepository = jest.fn(() => ({ findOne: jest.fn().mockResolvedValue(QUOTE) }));
  const service = new JobsService({ query: dataQuery, transaction, getRepository } as unknown as DataSource);
  return { service, managerQuery, managerUpdate, dataQuery, transaction, locked };
}

describe('JobsService ownership and lifecycle', () => {
  it('masks another professional’s job as not found on detail', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const service = new JobsService({ query } as unknown as DataSource);
    await expect(service.get(PRO, 'job-other')).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND });
    expect(query.mock.calls[0][0]).toContain('j.professional_id = $2');
    expect(query.mock.calls[0][1]).toEqual(['job-other', PRO.id]);
  });

  it('keeps contact details private after the request is completed or cancelled', async () => {
    const closed = harness(JobStatus.COMPLETED, RequestStatus.COMPLETED);
    const detail = await closed.service.get(PRO, 'job-1');
    expect(detail.client.fullName).toBe('Ana G.');
    expect(detail.client.phone).toBeNull();
    expect(detail.client.exactAddress).toBeNull();
  });

  it('returns an already completed job without applying a second completion write', async () => {
    const done = harness(JobStatus.COMPLETED, RequestStatus.COMPLETED);
    await done.service.complete(PRO, 'job-1');
    expect(done.managerQuery).toHaveBeenCalledTimes(1);
    expect(done.managerUpdate).not.toHaveBeenCalled();
  });

  it('does not write notes when the job is not owned by the professional', async () => {
    const managerQuery = jest.fn().mockResolvedValue([]);
    const transaction = jest.fn((work: (manager: EntityManager) => Promise<unknown>) =>
      work({ query: managerQuery } as unknown as EntityManager),
    );
    const service = new JobsService({ transaction } as unknown as DataSource);
    await expect(service.updateNotes(PRO, 'job-other', { privateNotes: 'privado' })).rejects.toBeInstanceOf(AppException);
    expect(managerQuery).toHaveBeenCalledTimes(1);
  });

  it('schedules and reschedules the same job, retaining the request/quote identity', async () => {
    const first = harness();
    await first.service.schedule(PRO, 'job-1', { scheduledDate: '2099-05-03', scheduledTime: '09:30', durationMinutes: 90 });
    expect(first.managerQuery).toHaveBeenCalledWith(expect.stringContaining("SET status = 'SCHEDULED'"), [
      'job-1', '2099-05-03', '09:30', 90,
    ]);
    expect(first.managerUpdate).toHaveBeenCalledWith(expect.any(Function), 'request-1', { status: RequestStatus.SCHEDULED });

    const later = harness(JobStatus.SCHEDULED, RequestStatus.SCHEDULED);
    await later.service.schedule(PRO, 'job-1', { scheduledDate: '2099-05-04' });
    expect(later.managerQuery).toHaveBeenCalledWith(expect.stringContaining("SET status = 'SCHEDULED'"), [
      'job-1', '2099-05-04', null, null,
    ]);
    expect(later.managerQuery.mock.calls.some(([sql, values]) =>
      String(sql).includes('INSERT INTO job_events') && (values ?? [])[2] === 'RESCHEDULED',
    )).toBe(true);
  });

  it('starts then completes a scheduled job and synchronizes the request', async () => {
    const starting = harness(JobStatus.SCHEDULED, RequestStatus.SCHEDULED);
    await starting.service.start(PRO, 'job-1');
    expect(starting.managerQuery).toHaveBeenCalledWith(
      expect.stringContaining("SET status = 'IN_PROGRESS'"),
      ['job-1'],
    );

    const completing = harness(JobStatus.IN_PROGRESS, RequestStatus.SCHEDULED);
    await completing.service.complete(PRO, 'job-1');
    expect(completing.managerQuery).toHaveBeenCalledWith(
      expect.stringContaining("SET status = 'COMPLETED'"),
      ['job-1'],
    );
    expect(completing.managerUpdate).toHaveBeenCalledWith(expect.any(Function), 'request-1', expect.objectContaining({
      status: RequestStatus.COMPLETED,
      completedBy: 'PROFESSIONAL',
    }));
  });

  it('cancels an active job with the professional actor and refuses to complete an uncoordinated one', async () => {
    const cancelling = harness();
    await cancelling.service.cancel(PRO, 'job-1');
    expect(cancelling.managerQuery).toHaveBeenCalledWith(
      expect.stringContaining("cancelled_by = 'PROFESSIONAL'"),
      ['job-1'],
    );
    expect(cancelling.managerUpdate).toHaveBeenCalledWith(expect.any(Function), 'request-1', expect.objectContaining({
      status: RequestStatus.CANCELLED,
    }));

    const uncoordinated = harness();
    await expect(uncoordinated.service.complete(PRO, 'job-1')).rejects.toBeInstanceOf(AppException);
  });

  it('stores private notes and a bounded checklist on the owned job', async () => {
    const notes = harness();
    await notes.service.updateNotes(PRO, 'job-1', { privateNotes: 'Llevar repuesto' });
    expect(notes.managerQuery).toHaveBeenCalledWith(
      expect.stringContaining('SET private_notes = $2'),
      ['job-1', 'Llevar repuesto'],
    );

    const checklist = harness();
    await checklist.service.updateChecklist(PRO, 'job-1', { items: [{ id: 'item-1', text: 'Revisar llave', done: false }] });
    expect(checklist.managerQuery).toHaveBeenCalledWith(
      expect.stringContaining('SET checklist = $2::jsonb'),
      ['job-1', JSON.stringify([{ id: 'item-1', text: 'Revisar llave', done: false }])],
    );
    await expect(checklist.service.updateChecklist(PRO, 'job-1', {
      items: Array.from({ length: 11 }, (_, index) => ({ id: 'item-' + index, text: 'Tarea', done: false })),
    })).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });
    await expect(notes.service.updateNotes(PRO, 'job-1', { privateNotes: 'x'.repeat(2001) }))
      .rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });
  });
});
