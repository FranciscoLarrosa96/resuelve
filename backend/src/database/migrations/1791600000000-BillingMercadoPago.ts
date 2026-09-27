import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Billing real de Resuelve PRO con Mercado Pago (suscripciones sin plan):
 *
 * - `billing_subscriptions`: una fila por intento de suscripción. `id` =
 *   `external_reference`. Unique (proveedor, id del preapproval) y UNA sola
 *   suscripción abierta (PENDING/ACTIVE/PAST_DUE/PAUSED) por profesional
 *   (índice único parcial): un doble click nunca deja dos.
 * - `billing_payments`: cobros recurrentes (authorized payments), unique por
 *   id del proveedor. Sin datos de tarjeta.
 * - `billing_webhook_events`: entregas procesadas (sin body ni firma).
 * - `professional_profiles.billing_pro_until`: PRO derivado de billing,
 *   separado del PRO manual (`plan_tier`/`plan_expires_at`).
 *
 * La oferta de bienvenida sigue usando `pro_offer_redemptions` (unique
 * profesional + código): se redime con el primer cobro promocional aprobado.
 */
export class BillingMercadoPago1791600000000 implements MigrationInterface {
  name = 'BillingMercadoPago1791600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "professional_profiles" ADD "billing_pro_until" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(`CREATE TYPE "public"."billing_provider" AS ENUM('MERCADO_PAGO')`);
    await queryRunner.query(
      `CREATE TYPE "public"."billing_subscription_status" AS ENUM('PENDING', 'ACTIVE', 'PAST_DUE', 'PAUSED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."billing_payment_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "billing_subscriptions" ("id" uuid NOT NULL, "professional_id" uuid NOT NULL, "provider" "public"."billing_provider" NOT NULL, "provider_subscription_id" character varying(64), "status" "public"."billing_subscription_status" NOT NULL DEFAULT 'PENDING', "provider_status" character varying(32), "checkout_url" character varying(500), "base_amount" integer NOT NULL, "current_amount" integer NOT NULL, "currency" character(3) NOT NULL, "offer_code" character varying(40), "offer_cycles" smallint, "offer_redeemed_at" TIMESTAMP WITH TIME ZONE, "offer_regular_price_applied_at" TIMESTAMP WITH TIME ZONE, "return_path" character varying(200), "authorized_at" TIMESTAMP WITH TIME ZONE, "past_due_since" TIMESTAMP WITH TIME ZONE, "cancelled_at" TIMESTAMP WITH TIME ZONE, "access_until" TIMESTAMP WITH TIME ZONE, "next_payment_at" TIMESTAMP WITH TIME ZONE, "last_payment_at" TIMESTAMP WITH TIME ZONE, "provider_updated_at" TIMESTAMP WITH TIME ZONE, "last_provider_sync_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_billing_subscriptions" PRIMARY KEY ("id"), CONSTRAINT "ck_billing_subscriptions_amounts" CHECK ("base_amount" > 0 AND "current_amount" > 0))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_billing_subscriptions_provider_id" ON "billing_subscriptions" ("provider", "provider_subscription_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_billing_subscriptions_one_open" ON "billing_subscriptions" ("professional_id") WHERE "status" IN ('PENDING', 'ACTIVE', 'PAST_DUE', 'PAUSED')`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_billing_subscriptions_status" ON "billing_subscriptions" ("status")`,
    );
    await queryRunner.query(
      `ALTER TABLE "billing_subscriptions" ADD CONSTRAINT "FK_billing_subscriptions_professional" FOREIGN KEY ("professional_id") REFERENCES "professional_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `CREATE TABLE "billing_payments" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "billing_subscription_id" uuid NOT NULL, "provider_authorized_payment_id" character varying(64) NOT NULL, "provider_payment_id" character varying(64), "amount" integer NOT NULL, "currency" character(3) NOT NULL, "status" "public"."billing_payment_status" NOT NULL, "status_detail" character varying(80), "retry_attempt" smallint, "debit_date" TIMESTAMP WITH TIME ZONE, "provider_updated_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_billing_payments_authorized_payment" UNIQUE ("provider_authorized_payment_id"), CONSTRAINT "PK_billing_payments" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_billing_payments_subscription" ON "billing_payments" ("billing_subscription_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "billing_payments" ADD CONSTRAINT "FK_billing_payments_subscription" FOREIGN KEY ("billing_subscription_id") REFERENCES "billing_subscriptions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `CREATE TABLE "billing_webhook_events" ("id" BIGSERIAL NOT NULL, "provider" "public"."billing_provider" NOT NULL, "topic" character varying(60) NOT NULL, "provider_resource_id" character varying(64) NOT NULL, "request_id" character varying(100) NOT NULL DEFAULT '', "signature_timestamp" bigint, "result" character varying(20) NOT NULL, "processed_at" TIMESTAMP WITH TIME ZONE, "received_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_billing_webhook_events" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_billing_webhook_events_delivery" ON "billing_webhook_events" ("provider", "topic", "provider_resource_id", "request_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."UQ_billing_webhook_events_delivery"`);
    await queryRunner.query(`DROP TABLE "billing_webhook_events"`);
    await queryRunner.query(
      `ALTER TABLE "billing_payments" DROP CONSTRAINT "FK_billing_payments_subscription"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_billing_payments_subscription"`);
    await queryRunner.query(`DROP TABLE "billing_payments"`);
    await queryRunner.query(
      `ALTER TABLE "billing_subscriptions" DROP CONSTRAINT "FK_billing_subscriptions_professional"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_billing_subscriptions_status"`);
    await queryRunner.query(`DROP INDEX "public"."UQ_billing_subscriptions_one_open"`);
    await queryRunner.query(`DROP INDEX "public"."UQ_billing_subscriptions_provider_id"`);
    await queryRunner.query(`DROP TABLE "billing_subscriptions"`);
    await queryRunner.query(`DROP TYPE "public"."billing_payment_status"`);
    await queryRunner.query(`DROP TYPE "public"."billing_subscription_status"`);
    await queryRunner.query(`DROP TYPE "public"."billing_provider"`);
    await queryRunner.query(`ALTER TABLE "professional_profiles" DROP COLUMN "billing_pro_until"`);
  }
}
