import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * El precio de PRO puede bajar hasta $1 desde el panel admin: sirve para probar
 * el cobro real (Mercado Pago de producción) con montos mínimos. El piso anterior
 * ($1.000) lo impedía. El tope no cambia.
 */
export class ProPriceMinimum1793400000000 implements MigrationInterface {
  name = 'ProPriceMinimum1793400000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "pro_price_changes" DROP CONSTRAINT "ck_pro_price_changes_price"`);
    await queryRunner.query(
      `ALTER TABLE "pro_price_changes" ADD CONSTRAINT "ck_pro_price_changes_price" CHECK ("price_ars" BETWEEN 1 AND 10000000)`,
    );
  }

  /** Volver al piso de $1.000: los precios de prueba más bajos quedan en $1.000 (el historial no se borra). */
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE "pro_price_changes" SET "price_ars" = 1000 WHERE "price_ars" < 1000`);
    await queryRunner.query(`UPDATE "pro_price_changes" SET "previous_price_ars" = 1000 WHERE "previous_price_ars" < 1000`);
    await queryRunner.query(`ALTER TABLE "pro_price_changes" DROP CONSTRAINT "ck_pro_price_changes_price"`);
    await queryRunner.query(
      `ALTER TABLE "pro_price_changes" ADD CONSTRAINT "ck_pro_price_changes_price" CHECK ("price_ars" BETWEEN 1000 AND 10000000)`,
    );
  }
}
