import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Precio de Resuelve PRO administrable. Cada cambio es una fila (historial);
 * el precio vigente es la última. Sin filas rige `PRO_MONTHLY_PRICE_ARS`.
 * Rige solo para suscripciones NUEVAS: las existentes conservan su monto
 * (`billing_subscriptions.base_amount`/`current_amount`).
 */
export class ProPriceChanges1793300000000 implements MigrationInterface {
  name = 'ProPriceChanges1793300000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "pro_price_changes" (
         "id" bigserial NOT NULL,
         "price_ars" integer NOT NULL,
         "previous_price_ars" integer NOT NULL,
         "changed_by" character varying(80) NOT NULL,
         "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
         CONSTRAINT "PK_pro_price_changes" PRIMARY KEY ("id"),
         CONSTRAINT "ck_pro_price_changes_price" CHECK ("price_ars" BETWEEN 1000 AND 10000000))`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "pro_price_changes"`);
  }
}
