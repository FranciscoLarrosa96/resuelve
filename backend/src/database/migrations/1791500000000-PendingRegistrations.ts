import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Registro pendiente: `POST /auth/register` ya no crea un `User` ni emite
 * tokens. Crea (o reemplaza) una fila acá, manda el código, y recién
 * `POST /auth/register/verify` crea el `User` real con `email_verified_at`
 * ya seteado. Los usuarios existentes con `email_verified_at IS NULL`
 * (creados antes de este cambio) no se tocan: siguen su flujo legacy de
 * login → verificar (`backend/README.md`).
 */
export class PendingRegistrations1791500000000 implements MigrationInterface {
  name = 'PendingRegistrations1791500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "pending_registrations" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "email" character varying(254) NOT NULL,
        "first_name" character varying(80) NOT NULL,
        "last_name" character varying(80) NOT NULL,
        "phone" character varying(32),
        "default_zone_id" uuid,
        "password_hash" character varying(255) NOT NULL,
        "verification_code_hash" character varying(64) NOT NULL,
        "verification_expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "verification_attempts" smallint NOT NULL DEFAULT '0',
        "last_code_sent_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        CONSTRAINT "PK_pending_registrations" PRIMARY KEY ("id")
      )`);
    // Sin unique: la app serializa el alta por email con un advisory lock (ver PendingRegistrationService)
    // y reemplaza la fila existente en vez de insertar una segunda para el mismo email.
    await queryRunner.query(
      `CREATE INDEX "idx_pending_registrations_email" ON "pending_registrations" (lower("email"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."idx_pending_registrations_email"`);
    await queryRunner.query(`DROP TABLE "pending_registrations"`);
  }
}
