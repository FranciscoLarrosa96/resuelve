import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Avisos por email. `users.email_notifications` es la preferencia (default
 * true, se puede apagar en Mi perfil o con el enlace de baja). En
 * `notifications`, `email_status` NULL = pendiente de decidir; el job lo
 * pasa a SENDING / SENT / SKIPPED / FAILED. Las notificaciones que ya
 * existen se marcan SKIPPED: activar el envío nunca manda avisos viejos.
 */
export class EmailNotifications1793500000000 implements MigrationInterface {
  name = 'EmailNotifications1793500000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "email_notifications" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications"
         ADD "email_status" character varying(10),
         ADD "emailed_at" TIMESTAMP WITH TIME ZONE,
         ADD "email_attempts" smallint NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `UPDATE "notifications" SET "email_status" = 'SKIPPED', "emailed_at" = now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD CONSTRAINT "ck_notifications_email_status"
         CHECK ("email_status" IS NULL OR "email_status" IN ('SENDING', 'SENT', 'SKIPPED', 'FAILED'))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_notifications_email_pending" ON "notifications" ("created_at")
         WHERE "email_status" IS NULL OR "email_status" = 'SENDING'`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_notifications_email_sent" ON "notifications" ("user_id", "emailed_at")
         WHERE "email_status" = 'SENT'`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_notifications_email_sent"`);
    await queryRunner.query(`DROP INDEX "IDX_notifications_email_pending"`);
    await queryRunner.query(`ALTER TABLE "notifications" DROP CONSTRAINT "ck_notifications_email_status"`);
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP COLUMN "email_attempts", DROP COLUMN "emailed_at", DROP COLUMN "email_status"`,
    );
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "email_notifications"`);
  }
}
