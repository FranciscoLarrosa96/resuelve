import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Coordinación del trabajo, Agenda real y trabajo realizado:
 *
 * - `request_status` suma COMPLETED ("trabajo realizado", sin depender de una
 *   reseña). Las filas AWAITING_REVIEW (terminadas, sin reseña) pasan a
 *   COMPLETED. AWAITING_REVIEW y CLOSED quedan en el tipo como legacy de solo
 *   lectura: no se borran valores de un enum con datos en producción.
 * - `appointment_status` pasa a PROPOSED / CONFIRMED / DECLINED / CANCELLED /
 *   COMPLETED. Las citas SCHEDULED e IN_PROGRESS (el cliente las cargaba ya
 *   acordadas) pasan a CONFIRMED.
 * - Citas con historial: se reemplaza el índice único por solicitud por uno
 *   parcial (como máximo una PROPOSED/CONFIRMED por solicitud).
 * - `note` (opcional, del profesional) y `cancelled_by` (CLIENT / PROFESSIONAL).
 *
 * Los tipos se recrean (columna → text → tipo nuevo) en vez de `ADD VALUE`:
 * así los valores nuevos se pueden usar en la misma transacción.
 */
export class AppointmentsAgenda1790700000000 implements MigrationInterface {
  name = 'AppointmentsAgenda1790700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---- request_status + COMPLETED ------------------------------------------
    await queryRunner.query(`ALTER TABLE "service_requests" ALTER COLUMN "status" DROP DEFAULT`);
    await queryRunner.query(
      `ALTER TABLE "service_requests" ALTER COLUMN "status" TYPE text USING "status"::text`,
    );
    await queryRunner.query(`DROP TYPE "public"."request_status"`);
    await queryRunner.query(
      `CREATE TYPE "public"."request_status" AS ENUM('DRAFT', 'WAITING_QUOTES', 'QUOTES_RECEIVED', 'PROFESSIONAL_SELECTED', 'SCHEDULED', 'COMPLETED', 'AWAITING_REVIEW', 'CLOSED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `UPDATE "service_requests" SET "status" = 'COMPLETED' WHERE "status" = 'AWAITING_REVIEW'`,
    );
    await queryRunner.query(
      `ALTER TABLE "service_requests" ALTER COLUMN "status" TYPE "public"."request_status" USING "status"::"public"."request_status"`,
    );
    await queryRunner.query(`ALTER TABLE "service_requests" ALTER COLUMN "status" SET DEFAULT 'DRAFT'`);

    // ---- appointment_status ---------------------------------------------------
    await queryRunner.query(`ALTER TABLE "appointments" ALTER COLUMN "status" DROP DEFAULT`);
    await queryRunner.query(
      `ALTER TABLE "appointments" ALTER COLUMN "status" TYPE text USING "status"::text`,
    );
    await queryRunner.query(`DROP TYPE "public"."appointment_status"`);
    await queryRunner.query(
      `CREATE TYPE "public"."appointment_status" AS ENUM('PROPOSED', 'CONFIRMED', 'DECLINED', 'CANCELLED', 'COMPLETED')`,
    );
    await queryRunner.query(
      `UPDATE "appointments" SET "status" = 'CONFIRMED' WHERE "status" IN ('SCHEDULED', 'IN_PROGRESS')`,
    );
    // Coherencia con la solicitud: antes cancelar la solicitud no tocaba su turno.
    await queryRunner.query(
      `UPDATE "appointments" a SET "status" = 'CANCELLED'
         FROM "service_requests" r
        WHERE r."id" = a."request_id" AND r."status" = 'CANCELLED' AND a."status" = 'CONFIRMED'`,
    );
    await queryRunner.query(
      `UPDATE "appointments" a SET "status" = 'COMPLETED'
         FROM "service_requests" r
        WHERE r."id" = a."request_id" AND r."status" IN ('COMPLETED', 'CLOSED') AND a."status" = 'CONFIRMED'`,
    );
    await queryRunner.query(
      `ALTER TABLE "appointments" ALTER COLUMN "status" TYPE "public"."appointment_status" USING "status"::"public"."appointment_status"`,
    );
    await queryRunner.query(`ALTER TABLE "appointments" ALTER COLUMN "status" SET DEFAULT 'PROPOSED'`);

    // ---- columnas nuevas ------------------------------------------------------
    await queryRunner.query(`CREATE TYPE "public"."appointment_party" AS ENUM('CLIENT', 'PROFESSIONAL')`);
    await queryRunner.query(`ALTER TABLE "appointments" ADD "note" character varying(280)`);
    await queryRunner.query(`ALTER TABLE "appointments" ADD "cancelled_by" "public"."appointment_party"`);

    // ---- historial: una activa por solicitud ----------------------------------
    await queryRunner.query(`DROP INDEX "public"."IDX_e3c35b1e1bc9f9d6b4fd75d398"`);
    await queryRunner.query(`CREATE INDEX "IDX_appointments_request_id" ON "appointments" ("request_id")`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_appointments_active_per_request" ON "appointments" ("request_id")
         WHERE "status" IN ('PROPOSED', 'CONFIRMED')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Una cita por solicitud otra vez: se conserva la más reciente de cada una.
    await queryRunner.query(`DROP INDEX "public"."uq_appointments_active_per_request"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_appointments_request_id"`);
    await queryRunner.query(
      `DELETE FROM "appointments" a USING "appointments" b
        WHERE a."request_id" = b."request_id" AND (a."created_at", a."id") < (b."created_at", b."id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_e3c35b1e1bc9f9d6b4fd75d398" ON "appointments" ("request_id")`,
    );

    await queryRunner.query(`ALTER TABLE "appointments" DROP COLUMN "cancelled_by"`);
    await queryRunner.query(`ALTER TABLE "appointments" DROP COLUMN "note"`);
    await queryRunner.query(`DROP TYPE "public"."appointment_party"`);

    // El modelo anterior solo conocía turnos ya acordados: propuestas y rechazos quedan cancelados.
    await queryRunner.query(`ALTER TABLE "appointments" ALTER COLUMN "status" DROP DEFAULT`);
    await queryRunner.query(
      `ALTER TABLE "appointments" ALTER COLUMN "status" TYPE text USING "status"::text`,
    );
    await queryRunner.query(`DROP TYPE "public"."appointment_status"`);
    await queryRunner.query(
      `CREATE TYPE "public"."appointment_status" AS ENUM('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')`,
    );
    await queryRunner.query(`UPDATE "appointments" SET "status" = 'SCHEDULED' WHERE "status" = 'CONFIRMED'`);
    await queryRunner.query(
      `UPDATE "appointments" SET "status" = 'CANCELLED' WHERE "status" IN ('PROPOSED', 'DECLINED')`,
    );
    await queryRunner.query(
      `ALTER TABLE "appointments" ALTER COLUMN "status" TYPE "public"."appointment_status" USING "status"::"public"."appointment_status"`,
    );
    await queryRunner.query(`ALTER TABLE "appointments" ALTER COLUMN "status" SET DEFAULT 'SCHEDULED'`);

    // COMPLETED vuelve a ser "terminado, pendiente de reseña".
    await queryRunner.query(`ALTER TABLE "service_requests" ALTER COLUMN "status" DROP DEFAULT`);
    await queryRunner.query(
      `ALTER TABLE "service_requests" ALTER COLUMN "status" TYPE text USING "status"::text`,
    );
    await queryRunner.query(`DROP TYPE "public"."request_status"`);
    await queryRunner.query(
      `CREATE TYPE "public"."request_status" AS ENUM('DRAFT', 'WAITING_QUOTES', 'QUOTES_RECEIVED', 'PROFESSIONAL_SELECTED', 'SCHEDULED', 'AWAITING_REVIEW', 'CLOSED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `UPDATE "service_requests" SET "status" = 'AWAITING_REVIEW' WHERE "status" = 'COMPLETED'`,
    );
    await queryRunner.query(
      `ALTER TABLE "service_requests" ALTER COLUMN "status" TYPE "public"."request_status" USING "status"::"public"."request_status"`,
    );
    await queryRunner.query(`ALTER TABLE "service_requests" ALTER COLUMN "status" SET DEFAULT 'DRAFT'`);
  }
}
