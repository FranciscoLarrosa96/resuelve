import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Medición del recorrido del cliente al crear un pedido (auditoría original):
 * `request_journey_events`, anónima (clave aleatoria del intento, sin usuario, IP ni
 * texto del pedido). `dedupe_key` único. Sin historial previo: se cuenta desde ahora.
 */
export class RequestJourneyEvents1795900000000 implements MigrationInterface {
  name = 'RequestJourneyEvents1795900000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE TABLE "request_journey_events" (
         "id" BIGSERIAL NOT NULL,
         "attempt_id" uuid NOT NULL,
         "type" character varying(16) NOT NULL,
         "journey" character varying(16),
         "step" smallint,
         "entry" character varying(32),
         "request_id" uuid,
         "dedupe_key" character varying(80) NOT NULL,
         "occurred_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         CONSTRAINT "PK_request_journey_events" PRIMARY KEY ("id"),
         CONSTRAINT "UQ_request_journey_events_dedupe_key" UNIQUE ("dedupe_key"),
         CONSTRAINT "CK_request_journey_events_type" CHECK ("type" IN ('STARTED','STEP_VIEWED','QUOTE_VIEWED','AUTH_REQUIRED','AUTH_RETURNED','SENT')),
         CONSTRAINT "CK_request_journey_events_journey" CHECK ("journey" IS NULL OR "journey" IN ('REQUEST','DIRECT','COMPARE')),
         CONSTRAINT "CK_request_journey_events_step" CHECK ("step" IS NULL OR "step" BETWEEN 0 AND 4)
       )`,
    );
    await q.query(`CREATE INDEX "IDX_request_journey_events_attempt" ON "request_journey_events" ("attempt_id")`);
    await q.query(
      `CREATE INDEX "IDX_request_journey_events_type_occurred" ON "request_journey_events" ("type", "occurred_at")`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX "IDX_request_journey_events_type_occurred"`);
    await q.query(`DROP INDEX "IDX_request_journey_events_attempt"`);
    await q.query(`DROP TABLE "request_journey_events"`);
  }
}
