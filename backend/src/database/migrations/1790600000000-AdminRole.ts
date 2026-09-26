import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Rol de administrador (panel de matrículas). Nadie lo es por defecto y no hay
 * endpoint para otorgarlo: solo `npm run admin:grant -- <email>` desde la terminal.
 */
export class AdminRole1790600000000 implements MigrationInterface {
  name = 'AdminRole1790600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "is_admin" boolean NOT NULL DEFAULT false`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "is_admin"`);
  }
}
