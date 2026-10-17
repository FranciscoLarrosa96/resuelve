import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Solicitud de arrepentimiento sobre un pago por transferencia que no se puede resolver sola:
 * hay pagos posteriores que dependen de sus fechas (p. ej. PRO Plus programado detrás de un PRO).
 * `withdrawal_requested_at` guarda CUÁNDO se pidió (la fecha de la solicitud es la que cuenta
 * para el plazo, no la de la resolución). Mientras no se resuelva el pago sigue APPROVED y el
 * acceso no cambia. No toca pagos ni fechas existentes.
 */
export class TransferWithdrawalRequest1796200000000 implements MigrationInterface {
  name = 'TransferWithdrawalRequest1796200000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "transfer_payments" ADD COLUMN "withdrawal_requested_at" TIMESTAMP WITH TIME ZONE`);
    await q.query(
      `CREATE INDEX "IDX_transfer_payments_withdrawal_requested" ON "transfer_payments" ("withdrawal_requested_at") WHERE "withdrawal_requested_at" IS NOT NULL`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX "public"."IDX_transfer_payments_withdrawal_requested"`);
    await q.query(`ALTER TABLE "transfer_payments" DROP COLUMN "withdrawal_requested_at"`);
  }
}
