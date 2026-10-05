import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Baja de cuenta: `users.deleted_at`. La cuenta NUNCA se borra de la base
 * (todas las claves hacia `users` son ON DELETE CASCADE y se llevarían el
 * historial de otras personas): se anonimiza y queda marcada.
 */
export class AccountDeletion1792800000000 implements MigrationInterface {
  name = 'AccountDeletion1792800000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "users" ADD COLUMN "deleted_at" TIMESTAMP WITH TIME ZONE`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "users" DROP COLUMN "deleted_at"`);
  }
}
