import { MigrationInterface, QueryRunner } from 'typeorm';

/** Fase 5: registro operativo liviano derivado del presupuesto aceptado. */
export class Phase5JobsCrm1792300000000 implements MigrationInterface {
  name = 'Phase5JobsCrm1792300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DO $$ BEGIN
      CREATE TYPE "public"."job_status" AS ENUM('TO_COORDINATE', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "jobs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "request_id" uuid NOT NULL,
        "accepted_quote_id" uuid NOT NULL,
        "professional_id" uuid NOT NULL,
        "client_id" uuid NOT NULL,
        "status" "public"."job_status" NOT NULL DEFAULT 'TO_COORDINATE',
        "scheduled_date" date,
        "scheduled_time" time,
        "duration_minutes" integer,
        "started_at" timestamptz,
        "completed_at" timestamptz,
        "cancelled_at" timestamptz,
        "cancelled_by" "public"."appointment_party",
        "private_notes" character varying(2000) NOT NULL DEFAULT '',
        "checklist" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_jobs_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_jobs_request_id" UNIQUE ("request_id"),
        CONSTRAINT "UQ_jobs_accepted_quote_id" UNIQUE ("accepted_quote_id"),
        CONSTRAINT "FK_jobs_request" FOREIGN KEY ("request_id") REFERENCES "service_requests"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_jobs_accepted_quote" FOREIGN KEY ("accepted_quote_id") REFERENCES "quotes"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_jobs_professional" FOREIGN KEY ("professional_id") REFERENCES "professional_profiles"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_jobs_client" FOREIGN KEY ("client_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "ck_jobs_duration" CHECK ("duration_minutes" IS NULL OR "duration_minutes" BETWEEN 1 AND 1440),
        CONSTRAINT "ck_jobs_checklist_array" CHECK (jsonb_typeof("checklist") = 'array')
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_jobs_professional_scheduled_date" ON "jobs" ("professional_id", "scheduled_date")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "job_events" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "job_id" uuid NOT NULL,
        "actor_user_id" uuid,
        "type" character varying(40) NOT NULL,
        "details" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_job_events_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_job_events_job" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_job_events_actor" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_job_events_job_created" ON "job_events" ("job_id", "created_at")`);

    // Backfill only the accepted quote. Desired dates are intentionally ignored:
    // without a confirmed appointment, the job must remain TO_COORDINATE.
    await queryRunner.query(`
      INSERT INTO "jobs" (
        "request_id", "accepted_quote_id", "professional_id", "client_id", "status",
        "scheduled_date", "scheduled_time", "duration_minutes", "completed_at", "cancelled_at", "cancelled_by"
      )
      SELECT r."id", q."id", q."professional_id", r."client_id",
        CASE
          WHEN r."status" IN ('COMPLETED', 'CLOSED', 'AWAITING_REVIEW') THEN 'COMPLETED'::"public"."job_status"
          WHEN r."status" = 'CANCELLED' THEN 'CANCELLED'::"public"."job_status"
          WHEN a."status" IN ('CONFIRMED', 'COMPLETED') THEN 'SCHEDULED'::"public"."job_status"
          ELSE 'TO_COORDINATE'::"public"."job_status"
        END,
        CASE WHEN a."status" IN ('CONFIRMED', 'COMPLETED')
          THEN (a."scheduled_start" AT TIME ZONE 'America/Argentina/Buenos_Aires')::date ELSE NULL END,
        CASE WHEN a."status" IN ('CONFIRMED', 'COMPLETED')
          THEN (a."scheduled_start" AT TIME ZONE 'America/Argentina/Buenos_Aires')::time(0) ELSE NULL END,
        CASE WHEN a."status" IN ('CONFIRMED', 'COMPLETED')
          THEN greatest(1, ceil(extract(epoch FROM (a."scheduled_end" - a."scheduled_start")) / 60)::int) ELSE NULL END,
        CASE WHEN r."status" IN ('COMPLETED', 'CLOSED', 'AWAITING_REVIEW') THEN r."completed_at" ELSE NULL END,
        CASE WHEN r."status" = 'CANCELLED' THEN r."cancelled_at" ELSE NULL END,
        NULL
      FROM "service_requests" r
      JOIN "quotes" q ON q."id" = r."accepted_quote_id" AND q."status" = 'ACCEPTED'
      LEFT JOIN LATERAL (
        SELECT ap."status", ap."scheduled_start", ap."scheduled_end"
          FROM "appointments" ap
         WHERE ap."request_id" = r."id"
         ORDER BY ap."created_at" DESC, ap."id" DESC
         LIMIT 1
      ) a ON true
      WHERE r."accepted_quote_id" IS NOT NULL
      ON CONFLICT DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO "job_events" ("job_id", "type", "details")
      SELECT j."id", 'BACKFILLED', jsonb_build_object('status', j."status")
        FROM "jobs" j
       WHERE NOT EXISTS (SELECT 1 FROM "job_events" e WHERE e."job_id" = j."id" AND e."type" = 'BACKFILLED')
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "job_events"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "jobs"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."job_status"`);
  }
}
