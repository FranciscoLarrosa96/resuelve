import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Avisos push (Web Push, sin Firebase). `push_subscriptions` = un dispositivo
 * (navegador) de una persona: endpoint del servicio de push + claves para
 * cifrar. En `notifications`, `push_status` NULL = pendiente; el envío lo
 * pasa a SENDING / SENT / SKIPPED / FAILED. Las notificaciones que ya existen
 * se marcan SKIPPED: activar push nunca manda avisos viejos.
 */
export class PushNotifications1793800000000 implements MigrationInterface {
  name = 'PushNotifications1793800000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "push_subscriptions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "endpoint" character varying(1000) NOT NULL,
        "p256dh" character varying(200) NOT NULL,
        "auth" character varying(100) NOT NULL,
        "failures" smallint NOT NULL DEFAULT 0,
        "last_success_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_push_subscriptions_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_push_subscriptions_endpoint" UNIQUE ("endpoint"),
        CONSTRAINT "FK_push_subscriptions_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )`);
    await queryRunner.query(`CREATE INDEX "IDX_push_subscriptions_user" ON "push_subscriptions" ("user_id")`);
    await queryRunner.query(
      `ALTER TABLE "notifications"
         ADD "push_status" character varying(10),
         ADD "pushed_at" TIMESTAMP WITH TIME ZONE,
         ADD "push_attempts" smallint NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(`UPDATE "notifications" SET "push_status" = 'SKIPPED', "pushed_at" = now()`);
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD CONSTRAINT "ck_notifications_push_status"
         CHECK ("push_status" IS NULL OR "push_status" IN ('SENDING', 'SENT', 'SKIPPED', 'FAILED'))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_notifications_push_pending" ON "notifications" ("created_at") WHERE "push_status" IS NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_notifications_push_pending"`);
    await queryRunner.query(`ALTER TABLE "notifications" DROP CONSTRAINT "ck_notifications_push_status"`);
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP COLUMN "push_attempts", DROP COLUMN "pushed_at", DROP COLUMN "push_status"`,
    );
    await queryRunner.query(`DROP TABLE "push_subscriptions"`);
  }
}
