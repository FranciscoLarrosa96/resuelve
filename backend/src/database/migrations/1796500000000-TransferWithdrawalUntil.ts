import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Vencimiento comunicado para pedir la devolución de un pago por transferencia: 10 días corridos
 * desde el inicio efectivo del período pago (se puede pedir desde la confirmación). Se guarda para que
 * un reajuste de fechas nunca acorte una ventana ya informada.
 *
 * Los pagos confirmados ANTES de esta regla quedan con la columna vacía y siguen contando
 * BILLING_WITHDRAWAL_DAYS desde la confirmación (lo que se les informó): no se reducen ni se extienden. Las solicitudes ya registradas no se tocan.
 */
export class TransferWithdrawalUntil1796500000000 implements MigrationInterface {
  name = 'TransferWithdrawalUntil1796500000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "transfer_payments" ADD COLUMN "withdrawal_until" TIMESTAMP WITH TIME ZONE`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "transfer_payments" DROP COLUMN "withdrawal_until"`);
  }
}
