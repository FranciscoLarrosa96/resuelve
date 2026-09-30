import { MigrationInterface, QueryRunner } from 'typeorm';

/** Free opportunities are lifetime usage; retain the raw rows for rollback/audit. */
export class FreeLifetimeQuoteQuota1792400000000 implements MigrationInterface {
  name = 'FreeLifetimeQuoteQuota1792400000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "quote_quota_usages"
         ADD "consumes_free_quota" boolean NOT NULL DEFAULT false`,
    );

    // FREE_QUOTE_USED is authoritative for rows created by the instrumented flow.
    // The Phase 1 seed predates those event rows, so recover post-success
    // discovery usage only when available plan data does not indicate PRO.
    // Courtesy PRO periods already downgraded have no historical marker and
    // cannot be distinguished from Free in those pre-event rows.
    await queryRunner.query(
      `UPDATE "quote_quota_usages" u
          SET "consumes_free_quota" = EXISTS (
            SELECT 1 FROM "pro_funnel_events" e
             WHERE e."type" = 'FREE_QUOTE_USED'
               AND e."professional_id" = u."professional_id"
               AND e."ref" = u."request_id"::text
          ) OR EXISTS (
            SELECT 1
              FROM "quotes" q
              JOIN "professional_profiles" p ON p."id" = q."professional_id"
              JOIN "request_invitations" i
                ON i."professional_id" = q."professional_id" AND i."request_id" = q."request_id"
             WHERE q."professional_id" = u."professional_id"
               AND q."request_id" = u."request_id"
               AND p."first_success_at" IS NOT NULL
               AND q."created_at" >= p."first_success_at"
               AND NOT i."targeted"
               AND NOT (
                 p."plan_tier" = 'PRO'
                 AND q."created_at" >= COALESCE(p."first_paid_pro_at", p."updated_at")
                 AND (p."plan_expires_at" IS NULL OR q."created_at" < p."plan_expires_at")
               )
               AND NOT EXISTS (
                 SELECT 1 FROM "billing_subscriptions" bs
                  WHERE bs."professional_id" = p."id"
                    AND bs."authorized_at" IS NOT NULL
                    AND bs."authorized_at" <= q."created_at"
                    AND bs."status" IN ('ACTIVE', 'PAST_DUE', 'PAUSED', 'CANCELLED')
                    AND (bs."access_until" IS NULL OR q."created_at" < bs."access_until")
               )
          )`,
    );

    await queryRunner.query(
      `DROP INDEX "public"."IDX_quote_quota_usages_professional_consumed"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_quote_quota_usages_professional_free"
         ON "quote_quota_usages" ("professional_id") WHERE "consumes_free_quota"`,
    );
    // Keep prior limit-reached history, but make the first event the permanent
    // ONCE dedupe key so old accounts will not emit it again after this change.
    await queryRunner.query(
      `WITH first_limit_event AS (
         SELECT "id", row_number() OVER (PARTITION BY "professional_id" ORDER BY "occurred_at", "id") AS n
           FROM "pro_funnel_events" WHERE "type" = 'FREE_QUOTE_LIMIT_REACHED'
       )
       UPDATE "pro_funnel_events" e
          SET "dedupe_key" = 'FREE_QUOTE_LIMIT_REACHED:' || e."professional_id"::text
         FROM first_limit_event f WHERE e."id" = f."id" AND f.n = 1`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "pro_funnel_events"
          SET "dedupe_key" = 'FREE_QUOTE_LIMIT_REACHED:' || "professional_id"::text || ':' ||
            to_char("occurred_at" AT TIME ZONE 'America/Argentina/Buenos_Aires', 'YYYY-MM')
        WHERE "type" = 'FREE_QUOTE_LIMIT_REACHED'
          AND "dedupe_key" = 'FREE_QUOTE_LIMIT_REACHED:' || "professional_id"::text`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_quote_quota_usages_professional_free"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_quote_quota_usages_professional_consumed"
         ON "quote_quota_usages" ("professional_id", "consumed_at")`,
    );
    await queryRunner.query(`ALTER TABLE "quote_quota_usages" DROP COLUMN "consumes_free_quota"`);
  }
}
