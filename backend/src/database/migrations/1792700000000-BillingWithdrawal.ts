import { MigrationInterface, QueryRunner } from 'typeorm';

const PREVIOUS = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'];

/**
 * Botón de arrepentimiento de Resuelve PRO.
 *
 * - `billing_subscriptions.withdrawn_at`: el profesional revocó la contratación
 *   dentro de la ventana legal (cancela la renovación, quita PRO en el acto y
 *   reembolsa lo cobrado).
 * - `billing_payments.refunded_at` / `provider_refund_id`: el reembolso del cobro
 *   y su id en el proveedor. `refunded_at` null con el cobro APPROVED en una
 *   suscripción revocada = reembolso pendiente de reintento.
 * - `billing_payment_status` suma `REFUNDED` (se recrea el tipo para poder
 *   usarlo y revertir limpio).
 */
export class BillingWithdrawal1792700000000 implements MigrationInterface {
  name = 'BillingWithdrawal1792700000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "billing_subscriptions" ADD COLUMN "withdrawn_at" TIMESTAMP WITH TIME ZONE`);
    await q.query(`ALTER TABLE "billing_payments"
      ADD COLUMN "refunded_at" TIMESTAMP WITH TIME ZONE,
      ADD COLUMN "provider_refund_id" character varying(64)`);
    await this.recreateType(q, [...PREVIOUS, 'REFUNDED']);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`UPDATE "billing_payments" SET "status" = 'CANCELLED' WHERE "status"::text = 'REFUNDED'`);
    await this.recreateType(q, PREVIOUS);
    await q.query(`ALTER TABLE "billing_payments" DROP COLUMN "provider_refund_id", DROP COLUMN "refunded_at"`);
    await q.query(`ALTER TABLE "billing_subscriptions" DROP COLUMN "withdrawn_at"`);
  }

  private async recreateType(q: QueryRunner, values: string[]): Promise<void> {
    await q.query(`ALTER TYPE "public"."billing_payment_status" RENAME TO "billing_payment_status_old"`);
    await q.query(
      `CREATE TYPE "public"."billing_payment_status" AS ENUM(${values.map((v) => `'${v}'`).join(', ')})`,
    );
    await q.query(
      `ALTER TABLE "billing_payments" ALTER COLUMN "status" TYPE "public"."billing_payment_status" USING "status"::text::"public"."billing_payment_status"`,
    );
    await q.query(`DROP TYPE "public"."billing_payment_status_old"`);
  }
}
