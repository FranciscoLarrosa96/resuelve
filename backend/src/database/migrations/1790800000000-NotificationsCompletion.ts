import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Notificaciones in-app y cierre del trabajo por cualquiera de las partes:
 *
 * - `notifications`: solo referencias (usuario, solicitud, presupuesto o
 *   cita). `dedupe_key` único = una notificación por evento aunque se
 *   reintente. Leer completa `read_at`; no se borra.
 * - `service_requests.completed_by` (CLIENT / PROFESSIONAL): quién confirmó
 *   que el trabajo se realizó. Reusa el tipo `appointment_party`. Los
 *   trabajos ya completados los marcaba siempre el profesional.
 */
export class NotificationsCompletion1790800000000 implements MigrationInterface {
  name = 'NotificationsCompletion1790800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."notification_type" AS ENUM('CLIENT_QUOTE_RECEIVED', 'CLIENT_APPOINTMENT_PROPOSED', 'CLIENT_APPOINTMENT_RESCHEDULED', 'PROFESSIONAL_SELECTED', 'PRO_APPOINTMENT_CONFIRMED', 'PRO_APPOINTMENT_DECLINED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "notifications" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "type" "public"."notification_type" NOT NULL,
        "request_id" uuid NOT NULL,
        "quote_id" uuid,
        "appointment_id" uuid,
        "dedupe_key" character varying(120) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "read_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_notifications" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_notifications_dedupe_key" ON "notifications" ("dedupe_key")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_notifications_unread" ON "notifications" ("user_id") WHERE "read_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_notifications_user_request" ON "notifications" ("user_id", "request_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD CONSTRAINT "FK_9a8a82462cab47c73d25f49261f" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD CONSTRAINT "FK_405532c368aba2c29129e583830" FOREIGN KEY ("request_id") REFERENCES "service_requests"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD CONSTRAINT "FK_644762ff42d4856b2c63d9cd301" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD CONSTRAINT "FK_9e2d01428faefb60e63c287c04a" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(`ALTER TABLE "service_requests" ADD "completed_by" "public"."appointment_party"`);
    await queryRunner.query(
      `UPDATE "service_requests" SET "completed_by" = 'PROFESSIONAL' WHERE "completed_at" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "service_requests" DROP COLUMN "completed_by"`);
    await queryRunner.query(`DROP TABLE "notifications"`);
    await queryRunner.query(`DROP TYPE "public"."notification_type"`);
  }
}
