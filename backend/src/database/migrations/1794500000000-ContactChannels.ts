import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Canales de contacto del profesional: WhatsApp, llamadas y solicitudes por Resuelve.
 *
 * - Los teléfonos de contacto son NUEVOS y separados de `users.phone` (dato privado de la
 *   cuenta): nunca se copia ni se publica el teléfono de la cuenta. Se guardan normalizados
 *   en E.164 (`+549…` celular, `+54…` fijo, o internacional).
 * - `contact_consent_at`: cuándo aceptó que sus números de contacto se muestren a otros
 *   usuarios. Sin consentimiento no hay WhatsApp ni llamadas (CHECK).
 * - Al menos un canal habilitado (CHECK). Los perfiles existentes conservan lo que tenían:
 *   solicitudes por Resuelve prendidas, WhatsApp y llamadas apagados.
 * - Clics de contacto: dos tipos nuevos en `exposure_events` (anónimos, sin el número).
 */
export class ContactChannels1794500000000 implements MigrationInterface {
  name = 'ContactChannels1794500000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "professional_profiles"
         ADD "contact_whatsapp_enabled" boolean NOT NULL DEFAULT false,
         ADD "contact_calls_enabled" boolean NOT NULL DEFAULT false,
         ADD "contact_requests_enabled" boolean NOT NULL DEFAULT true,
         ADD "contact_whatsapp_number" character varying(16),
         ADD "contact_phone_number" character varying(16),
         ADD "contact_consent_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "professional_profiles"
         ADD CONSTRAINT "ck_professional_profiles_contact_channel"
           CHECK ("contact_whatsapp_enabled" OR "contact_calls_enabled" OR "contact_requests_enabled"),
         ADD CONSTRAINT "ck_professional_profiles_contact_whatsapp"
           CHECK (NOT "contact_whatsapp_enabled" OR ("contact_whatsapp_number" IS NOT NULL AND "contact_consent_at" IS NOT NULL)),
         ADD CONSTRAINT "ck_professional_profiles_contact_calls"
           CHECK (NOT "contact_calls_enabled" OR ("contact_phone_number" IS NOT NULL AND "contact_consent_at" IS NOT NULL)),
         ADD CONSTRAINT "ck_professional_profiles_contact_numbers"
           CHECK (("contact_whatsapp_number" IS NULL OR "contact_whatsapp_number" ~ '^\\+[1-9][0-9]{7,14}$')
              AND ("contact_phone_number" IS NULL OR "contact_phone_number" ~ '^\\+[1-9][0-9]{7,14}$'))`,
    );
    await queryRunner.query(`ALTER TYPE "public"."exposure_event_type" ADD VALUE IF NOT EXISTS 'WHATSAPP_CLICK'`);
    await queryRunner.query(`ALTER TYPE "public"."exposure_event_type" ADD VALUE IF NOT EXISTS 'PHONE_CLICK'`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Postgres no quita valores de un enum: se recrea sin los clics (que se descartan).
    await queryRunner.query(`DELETE FROM "exposure_events" WHERE "type" IN ('WHATSAPP_CLICK', 'PHONE_CLICK')`);
    await queryRunner.query(`ALTER TYPE "public"."exposure_event_type" RENAME TO "exposure_event_type_old"`);
    await queryRunner.query(`CREATE TYPE "public"."exposure_event_type" AS ENUM('SEARCH_IMPRESSION', 'PROFILE_VIEW')`);
    await queryRunner.query(
      `ALTER TABLE "exposure_events" ALTER COLUMN "type" TYPE "public"."exposure_event_type"
         USING "type"::text::"public"."exposure_event_type"`,
    );
    await queryRunner.query(`DROP TYPE "public"."exposure_event_type_old"`);
    await queryRunner.query(
      `ALTER TABLE "professional_profiles"
         DROP CONSTRAINT "ck_professional_profiles_contact_numbers",
         DROP CONSTRAINT "ck_professional_profiles_contact_calls",
         DROP CONSTRAINT "ck_professional_profiles_contact_whatsapp",
         DROP CONSTRAINT "ck_professional_profiles_contact_channel"`,
    );
    await queryRunner.query(
      `ALTER TABLE "professional_profiles"
         DROP COLUMN "contact_consent_at",
         DROP COLUMN "contact_phone_number",
         DROP COLUMN "contact_whatsapp_number",
         DROP COLUMN "contact_requests_enabled",
         DROP COLUMN "contact_calls_enabled",
         DROP COLUMN "contact_whatsapp_enabled"`,
    );
  }
}
