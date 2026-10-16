import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fase 1 (demora de Free): hoy/urgente ya no se demoran. Las invitaciones enviadas antes de esa
 * regla pueden tener una espera guardada (`available_at > sent_at`) que ahora se libera al leer.
 * Para no confundir "se liberó antes de vencer" con "la espera se cumplió" sin depender de cuándo
 * se lea, esta migración deja la prueba estable: `delay_served_at` = la espera de un pedido de
 * hoy/urgente que YA había vencido cuando se aplicó (con el código anterior se hacía cumplir, así
 * que ocurrió). Las que seguían por delante, o las creadas después, quedan en null y nunca
 * cuentan como demora. La aplicación no escribe esta columna.
 */
export class ServedExemptDelays1795650000000 implements MigrationInterface {
  name = 'ServedExemptDelays1795650000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "request_invitations" ADD COLUMN "delay_served_at" TIMESTAMP WITH TIME ZONE`);
    await q.query(`
      UPDATE request_invitations i SET delay_served_at = i.available_at
        FROM service_requests sr
       WHERE sr.id = i.request_id AND sr.urgency::text IN ('TODAY', 'URGENT')
         AND NOT i.targeted AND i.available_at > i.sent_at AND i.available_at <= now()`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "request_invitations" DROP COLUMN "delay_served_at"`);
  }
}
