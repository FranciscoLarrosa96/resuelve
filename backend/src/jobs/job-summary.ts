import type { EntityManager } from 'typeorm';
import { JobStatus } from './job.entity';
import { jobCloseAt } from './job-closure';

export interface JobSummary {
  id: string;
  status: JobStatus;
  scheduledDate: string | null;
  scheduledTime: string | null;
  durationMinutes: number | null;
  /** Desde cuándo se puede cerrar (fin del horario). Null si no hay trabajo agendado abierto. */
  closesAt: Date | null;
  /** Misma regla que `POST /requests/:id/complete`: terminó el horario y el trabajo sigue abierto. */
  canComplete: boolean;
}

export async function jobSummaries(
  manager: EntityManager,
  requestIds: readonly string[],
  professionalId?: string,
): Promise<Map<string, JobSummary>> {
  if (!requestIds.length) return new Map();
  const rows = await manager.query<
    { request_id: string; id: string; status: JobStatus; scheduled_date: string | Date | null; scheduled_time: string | null; duration_minutes: number | null }[]
  >(
    `SELECT request_id, id, status, to_char(scheduled_date, 'YYYY-MM-DD') AS scheduled_date, scheduled_time, duration_minutes
       FROM jobs
      WHERE request_id = ANY($1::uuid[])
        AND ($2::uuid IS NULL OR professional_id = $2)`,
    [requestIds, professionalId ?? null],
  );
  return new Map(rows.map((row) => {
    const scheduledDate = row.scheduled_date as string | null;
    const scheduledTime = row.scheduled_time ? String(row.scheduled_time).slice(0, 5) : null;
    const open = row.status === JobStatus.SCHEDULED || row.status === JobStatus.IN_PROGRESS;
    const closesAt = open && scheduledDate ? jobCloseAt(scheduledDate, scheduledTime, row.duration_minutes) : null;
    return [
      row.request_id,
      {
        id: row.id,
        status: row.status,
        scheduledDate,
        scheduledTime,
        durationMinutes: row.duration_minutes,
        closesAt,
        canComplete: !!closesAt && closesAt.getTime() <= Date.now(),
      },
    ];
  }));
}
