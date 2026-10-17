import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Solicitudes de arrepentimiento recibidas SIN sesión ("No puedo ingresar a mi cuenta"): datos mínimos
 * para localizar la contratación y contactar a la persona, fecha y hora del servidor (`requested_at`,
 * la que cuenta para el plazo) y un código propio. Registrarlas no toca cuentas, pagos ni acceso: un
 * admin verifica la identidad y las vincula con un pago (`linked_payment_id`) antes de resolverlas.
 */
export class WithdrawalContactRequests1796400000000 implements MigrationInterface {
  name = 'WithdrawalContactRequests1796400000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE "withdrawal_contact_requests" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "code" character varying(12) NOT NULL,
        "name" character varying(120) NOT NULL,
        "email" character varying(254) NOT NULL,
        "phone" character varying(30),
        "payment_reference" character varying(20),
        "note" character varying(500),
        "status" character varying(12) NOT NULL DEFAULT 'PENDING',
        "requested_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "linked_payment_id" uuid,
        "handled_by_user_id" uuid,
        "handled_at" TIMESTAMP WITH TIME ZONE,
        "admin_note" character varying(300),
        CONSTRAINT "PK_withdrawal_contact_requests" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_withdrawal_contact_requests_code" UNIQUE ("code"),
        CONSTRAINT "CHK_withdrawal_contact_requests_status" CHECK ("status" IN ('PENDING', 'LINKED', 'RESOLVED', 'DISMISSED')),
        CONSTRAINT "FK_withdrawal_contact_requests_payment" FOREIGN KEY ("linked_payment_id") REFERENCES "transfer_payments"("id") ON DELETE SET NULL
      )
    `);
    await q.query(`CREATE INDEX "IDX_withdrawal_contact_requests_status" ON "withdrawal_contact_requests" ("status", "requested_at")`);
    await q.query(`CREATE INDEX "IDX_withdrawal_contact_requests_email" ON "withdrawal_contact_requests" ("email", "requested_at")`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "withdrawal_contact_requests"`);
  }
}
