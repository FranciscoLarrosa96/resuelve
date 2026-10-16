import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Versión de la interfaz del pedido en la medición del recorrido (`flow_version`): 1 = asistente de
 * 5 pasos, 2 = asistente de 4. Todo lo registrado hasta ahora (eventos del navegador) es la versión 1.
 * SENT lo escribe el servidor y NO lleva versión (NULL): un valor por defecto lo haría "de la versión 1"
 * y volvería MIXTO a todo intento de la 2. Los porcentajes de cada versión se calculan por separado.
 */
export class RequestJourneyFlowVersion1796000000000 implements MigrationInterface {
  name = 'RequestJourneyFlowVersion1796000000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "request_journey_events" ADD "flow_version" smallint`);
    await q.query(`UPDATE "request_journey_events" SET "flow_version" = 1 WHERE "type" <> 'SENT'`);
    await q.query(
      `ALTER TABLE "request_journey_events"
         ADD CONSTRAINT "CK_request_journey_events_flow_version" CHECK ("flow_version" IS NULL OR "flow_version" IN (1,2)),
         ADD CONSTRAINT "CK_request_journey_events_flow_version_sent" CHECK (("type" = 'SENT') = ("flow_version" IS NULL)),
         ADD CONSTRAINT "CK_request_journey_events_step_v2" CHECK ("step" IS NULL OR "flow_version" IS DISTINCT FROM 2 OR "step" <= 3)`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "request_journey_events"
         DROP CONSTRAINT "CK_request_journey_events_step_v2",
         DROP CONSTRAINT "CK_request_journey_events_flow_version_sent",
         DROP CONSTRAINT "CK_request_journey_events_flow_version"`,
    );
    // Los eventos de la versión 2 se pierden al revertir: sus pasos no existen en el modelo anterior.
    await q.query(`DELETE FROM "request_journey_events" WHERE "flow_version" = 2`);
    await q.query(`ALTER TABLE "request_journey_events" DROP COLUMN "flow_version"`);
  }
}
