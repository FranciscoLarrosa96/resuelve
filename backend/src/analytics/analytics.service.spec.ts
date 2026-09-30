import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { AnalyticsService } from './analytics.service';

describe('analytics compatibility with operational jobs', () => {
  it('uses Job as primary source and counts legacy rows only when no job exists', async () => {
    const query = jest.fn().mockResolvedValue([{
      requests_cur: 0, requests_prev: 0, sent_cur: 0, sent_prev: 0, sent_accepted_cur: 0,
      accepted_cur: 0, accepted_prev: 0, value_cur: '0', value_prev: '0',
      scheduled_cur: 1, scheduled_prev: 0, done_cur: 1, done_prev: 0,
      reviews_cur: 0, reviews_prev: 0,
    }]);
    const service = new AnalyticsService(
      { query } as unknown as DataSource,
      { get: jest.fn() } as unknown as ConfigService,
    );
    const run = (service as unknown as {
      counts: (
        id: string,
        previousStart: Date,
        previousEnd: Date,
        start: Date,
        end: Date,
      ) => Promise<{ current: { scheduledJobs: number; completedJobs: number } }>;
    }).counts;
    const result = await run.call(
      service,
      'pro-1',
      new Date('2026-08-01T03:00:00Z'),
      new Date('2026-09-01T03:00:00Z'),
      new Date('2026-09-01T03:00:00Z'),
      new Date('2026-10-01T03:00:00Z'),
    );
    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain('FROM jobs');
    expect(sql).toContain("status IN ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED')");
    expect(sql).toContain("status = 'COMPLETED'");
    expect(sql.match(/NOT EXISTS \(SELECT 1 FROM jobs/g)?.length).toBe(2);
    expect(result.current).toMatchObject({ scheduledJobs: 1, completedJobs: 1 });
  });
});
