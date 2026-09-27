import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Verificación real de email por código de 6 dígitos.
 *
 * `users.email_verified_at`: null hasta que el usuario demuestra que controla
 * el email (nunca se marca automáticamente para cuentas existentes: quedan en
 * null y se les pide verificar; ver `backend/README.md`).
 *
 * `email_verification_codes`: un código por propósito/usuario a la vez (el
 * anterior se consume al generar uno nuevo). Solo se guarda el hash, nunca el
 * código en texto plano.
 */
export class EmailVerification1791400000000 implements MigrationInterface {
  name = 'EmailVerification1791400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "email_verified_at" TIMESTAMP WITH TIME ZONE`);

    await queryRunner.query(`
      CREATE TABLE "email_verification_codes" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "purpose" character varying(32) NOT NULL,
        "code_hash" character varying(64) NOT NULL,
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "attempts" smallint NOT NULL DEFAULT '0',
        "sent_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "consumed_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_email_verification_codes" PRIMARY KEY ("id")
      )`);
    await queryRunner.query(
      `ALTER TABLE "email_verification_codes" ADD CONSTRAINT "FK_email_verification_codes_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE`,
    );
    // Búsqueda del código activo y conteo de envíos por hora (rate limit), ambos por usuario+propósito.
    await queryRunner.query(
      `CREATE INDEX "idx_email_verification_codes_user_purpose" ON "email_verification_codes" ("user_id", "purpose", "created_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."idx_email_verification_codes_user_purpose"`);
    await queryRunner.query(`DROP TABLE "email_verification_codes"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "email_verified_at"`);
  }
}
