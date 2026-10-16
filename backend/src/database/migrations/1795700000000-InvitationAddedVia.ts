import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fase 2 de la auditoría ("Sumar profesionales"): marca, en la invitación, que se sumó desde esa
 * acción del detalle del pedido. Mínimo para medir cuántos pedidos la usaron y cuántos recibieron
 * después su primer presupuesto, sin atribuirle causalidad. Nullable: lo anterior queda en null.
 */
export class InvitationAddedVia1795700000000 implements MigrationInterface {
  name = 'InvitationAddedVia1795700000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "request_invitations" ADD COLUMN "added_via" character varying(32)`);
    await q.query(
      `CREATE INDEX "IDX_request_invitations_added_via" ON "request_invitations" ("request_id") WHERE "added_via" IS NOT NULL`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX "IDX_request_invitations_added_via"`);
    await q.query(`ALTER TABLE "request_invitations" DROP COLUMN "added_via"`);
  }
}
