import type { EntityManager } from 'typeorm';
import { JobStatus } from './job.entity';

export interface JobSummary {
  id: string;
  status: JobStatus;
  scheduledDate: string | null;
  scheduledTime: string | null;
  durationMinutes: number | null;
}

export async function jobSummaries(
  manager: EntityManager,
  requestIds: readonly string[],
  professionalId?: string,
): Promise<Map<string, JobSummary>> {
  if (!requestIds.length) return new Map();
  const rows = await manager.query<
    { request_id: string; id: string; status: JobStatus; scheduled_date: string | null; scheduled_time: string | null; duration_minutes: number | null }[]
  >(
    `SELECT request_id, id, status, scheduled_date, scheduled_time, duration_minutes
       FROM jobs
      WHERE request_id = ANY($1::uuid[])
        AND ($2::uuid IS NULL OR professional_id = $2)`,
    [requestIds, professionalId ?? null],
  );
  return new Map(rows.map((row) => [
    row.request_id,
    {
      id: row.id,
      status: row.status,
      scheduledDate: row.scheduled_date,
      scheduledTime: row.scheduled_time ? String(row.scheduled_time).slice(0, 5) : null,
      durationMinutes: row.duration_minutes,
    },
  ]));
}
