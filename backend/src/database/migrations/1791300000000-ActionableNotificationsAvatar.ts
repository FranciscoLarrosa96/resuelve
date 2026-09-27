import { MigrationInterface, QueryRunner } from 'typeorm';

const OLD_TYPES = [
  'CLIENT_QUOTE_RECEIVED',
  'CLIENT_APPOINTMENT_PROPOSED',
  'CLIENT_APPOINTMENT_RESCHEDULED',
  'PROFESSIONAL_SELECTED',
  'PRO_APPOINTMENT_CONFIRMED',
  'PRO_APPOINTMENT_DECLINED',
];

/**
 * Hardening V3:
 *
 * - `notification_type` suma `PRO_REQUEST_RECEIVED` ("Nueva solicitud" en la
 *   pestaña Nuevas). El tipo se recrea (en vez de `ADD VALUE`) para poder
 *   usar el valor en la misma transacción y revertirlo limpio.
 * - Backfill: una notificación sin leer por cada invitación que hoy sigue sin
 *   responder en una solicitud abierta (es lo que antes contaba el badge de
 *   Solicitudes), así el número no cambia al desplegar.
 * - `professional_profiles.avatar_public_id` / `avatar_url`: foto de perfil
 *   pública (Cloudinary). Solo el publicId y la URL de entrega; nunca el binario.
 */
export class ActionableNotificationsAvatar1791300000000 implements MigrationInterface {
  name = 'ActionableNotificationsAvatar1791300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.recreateType(queryRunner, [...OLD_TYPES, 'PRO_REQUEST_RECEIVED']);
    await queryRunner.query(`
      INSERT INTO "notifications" ("user_id", "type", "request_id", "dedupe_key", "created_at")
      SELECT p."user_id", 'PRO_REQUEST_RECEIVED', i."request_id",
             'PRO_REQUEST_RECEIVED:' || i."request_id" || ':' || i."professional_id", i."sent_at"
        FROM "request_invitations" i
        JOIN "professional_profiles" p ON p."id" = i."professional_id"
        JOIN "service_requests" r ON r."id" = i."request_id"
       WHERE i."status" = 'PENDING' AND r."status" IN ('WAITING_QUOTES', 'QUOTES_RECEIVED')
      ON CONFLICT ("dedupe_key") DO NOTHING`);

    await queryRunner.query(
      `ALTER TABLE "professional_profiles" ADD "avatar_public_id" character varying(255)`,
    );
    await queryRunner.query(`ALTER TABLE "professional_profiles" ADD "avatar_url" character varying(500)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "professional_profiles" DROP COLUMN "avatar_url"`);
    await queryRunner.query(`ALTER TABLE "professional_profiles" DROP COLUMN "avatar_public_id"`);
    await queryRunner.query(`DELETE FROM "notifications" WHERE "type" = 'PRO_REQUEST_RECEIVED'`);
    await this.recreateType(queryRunner, OLD_TYPES);
  }

  private async recreateType(queryRunner: QueryRunner, values: string[]): Promise<void> {
    await queryRunner.query(`ALTER TYPE "public"."notification_type" RENAME TO "notification_type_old"`);
    await queryRunner.query(
      `CREATE TYPE "public"."notification_type" AS ENUM(${values.map((v) => `'${v}'`).join(', ')})`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ALTER COLUMN "type" TYPE "public"."notification_type" USING "type"::text::"public"."notification_type"`,
    );
    await queryRunner.query(`DROP TYPE "public"."notification_type_old"`);
  }
}
