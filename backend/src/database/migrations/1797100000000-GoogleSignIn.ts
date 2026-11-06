import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ingreso con Google (`auth/google-sign-in.ts`): `users.google_sub` es el identificador
 * estable de la cuenta de Google (claim `sub`), único. NULL = nunca entró con Google.
 */
export class GoogleSignIn1797100000000 implements MigrationInterface {
  name = 'GoogleSignIn1797100000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "users" ADD "google_sub" character varying(255)`);
    await q.query(`CREATE UNIQUE INDEX "uq_users_google_sub" ON "users" ("google_sub") WHERE "google_sub" IS NOT NULL`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX "public"."uq_users_google_sub"`);
    await q.query(`ALTER TABLE "users" DROP COLUMN "google_sub"`);
  }
}
