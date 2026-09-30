import { QueryRunner } from 'typeorm';
import { Phase5JobsCrm1792300000000 } from './1792300000000-Phase5JobsCrm';

describe('Phase5JobsCrm migration', () => {
  it('creates unique job ownership keys and idempotently backfills accepted quotes only', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const runner = { query } as unknown as QueryRunner;

    await new Phase5JobsCrm1792300000000().up(runner);

    const statements = query.mock.calls.map(([sql]) => String(sql));
    expect(statements[0]).toContain('EXCEPTION WHEN duplicate_object');
    expect(statements[1]).toContain('UNIQUE ("request_id")');
    expect(statements[1]).toContain('UNIQUE ("accepted_quote_id")');
    const backfill = statements.find((sql) => sql.includes('INSERT INTO "jobs"'));
    expect(backfill).toContain('q."id" = r."accepted_quote_id"');
    expect(backfill).toContain('ON CONFLICT DO NOTHING');
    expect(backfill).toContain("'America/Argentina/Buenos_Aires'");
    expect(backfill).not.toContain('desired_date');
    const events = statements.find((sql) => sql.includes('INSERT INTO "job_events"'));
    expect(events).toContain('NOT EXISTS');
  });

  it('reverts history and jobs before the status enum', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    await new Phase5JobsCrm1792300000000().down({ query } as unknown as QueryRunner);
    expect(query.mock.calls.map(([sql]) => String(sql))).toEqual([
      'DROP TABLE IF EXISTS "job_events"',
      'DROP TABLE IF EXISTS "jobs"',
      'DROP TYPE IF EXISTS "public"."job_status"',
    ]);
  });
});
