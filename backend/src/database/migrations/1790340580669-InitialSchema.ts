import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1790340580669 implements MigrationInterface {
  name = 'InitialSchema1790340580669';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "cities" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "name" character varying(120) NOT NULL, "slug" character varying(120) NOT NULL, "province" character varying(120) NOT NULL, "active" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_4762ffb6e5d198cfec5606bc11e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_8ef722e770798e37b3205370bf" ON "cities" ("slug") `);
    await queryRunner.query(
      `CREATE TABLE "zones" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "city_id" uuid NOT NULL, "name" character varying(120) NOT NULL, "slug" character varying(120) NOT NULL, "sort_order" integer NOT NULL DEFAULT '0', "active" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_880484a43ca311707b05895bd4a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_9c8106481f4f93a340a2d7e074" ON "zones" ("city_id", "slug") `,
    );
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "first_name" character varying(80) NOT NULL, "last_name" character varying(80) NOT NULL, "email" character varying(254) NOT NULL, "password_hash" character varying(255) NOT NULL, "phone" character varying(32), "phone_verified" boolean NOT NULL DEFAULT false, "avatar_url" character varying(500), "default_zone_id" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    // Email único sin importar mayúsculas (TypeORM no genera índices funcionales).
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_users_email_lower" ON "users" (lower("email"))`);
    await queryRunner.query(
      `CREATE TABLE "categories" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "name" character varying(120) NOT NULL, "slug" character varying(120) NOT NULL, "sort_order" integer NOT NULL DEFAULT '0', "active" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_24dbc6126a28ff948da33e97d3b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_420d9f679d41281f282f5bc7d0" ON "categories" ("slug") `);
    await queryRunner.query(
      `CREATE TABLE "services" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "category_id" uuid NOT NULL, "name" character varying(120) NOT NULL, "slug" character varying(120) NOT NULL, "requires_license" boolean NOT NULL DEFAULT false, "sort_order" integer NOT NULL DEFAULT '0', "active" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_ba2d347a3168a296416c6c5ccb2" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_02cf0d0f46e11d22d952f62367" ON "services" ("slug") `);
    await queryRunner.query(
      `CREATE TABLE "professional_services" ("professional_id" uuid NOT NULL, "service_id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_b3073a22d2e21fadf41fa8e2553" PRIMARY KEY ("professional_id", "service_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_2fad8b472d2afd9af6c048b715" ON "professional_services" ("service_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "professional_service_areas" ("professional_id" uuid NOT NULL, "zone_id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_aefd361fe44fb653bf7ba2105b2" PRIMARY KEY ("professional_id", "zone_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_fb6cdac33be5edd716347df0a2" ON "professional_service_areas" ("zone_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."verification_type" AS ENUM('IDENTITY', 'PHONE', 'LICENSE')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."verification_status" AS ENUM('PENDING', 'VERIFIED', 'REJECTED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "professional_verifications" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "professional_id" uuid NOT NULL, "type" "public"."verification_type" NOT NULL, "status" "public"."verification_status" NOT NULL DEFAULT 'PENDING', "service_id" uuid, "reference" character varying(120), "reviewed_at" TIMESTAMP WITH TIME ZONE, "expires_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_858646026a1d3c0c5d81d5409da" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_2aa5d749535cacce7b430f8021" ON "professional_verifications" ("professional_id", "type") `,
    );
    await queryRunner.query(
      `CREATE TABLE "portfolio_items" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "professional_id" uuid NOT NULL, "title" character varying(140) NOT NULL, "image_url" character varying(500) NOT NULL, "zone_id" uuid, "request_id" uuid, "sort_order" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_c636df11b3cc98f390c8efc656a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ba713dc8293c16417a2dae17e7" ON "portfolio_items" ("professional_id", "sort_order") `,
    );
    await queryRunner.query(`CREATE TYPE "public"."plan_tier" AS ENUM('FREE', 'PRO')`);
    await queryRunner.query(
      `CREATE TABLE "professional_profiles" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "user_id" uuid NOT NULL, "headline" character varying(120), "bio" text, "years_experience" smallint NOT NULL DEFAULT '0', "available_today" boolean NOT NULL DEFAULT false, "available_on" date, "average_response_minutes" integer, "average_rating" numeric(3,2) NOT NULL DEFAULT '0', "reviews_count" integer NOT NULL DEFAULT '0', "completed_jobs_count" integer NOT NULL DEFAULT '0', "plan_tier" "public"."plan_tier" NOT NULL DEFAULT 'FREE', "monthly_request_usage" integer NOT NULL DEFAULT '0', "usage_period_start" date, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "REL_ed5f5b62a353f11b36ceb7e2e8" UNIQUE ("user_id"), CONSTRAINT "ck_professional_profiles_rating" CHECK ("average_rating" >= 0 AND "average_rating" <= 5), CONSTRAINT "PK_b2140d2f56b0910e4c58ab4d2a2" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."invitation_status" AS ENUM('PENDING', 'QUOTED', 'DECLINED', 'SELECTED', 'NOT_SELECTED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "request_invitations" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "request_id" uuid NOT NULL, "professional_id" uuid NOT NULL, "status" "public"."invitation_status" NOT NULL DEFAULT 'PENDING', "sent_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "responded_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_46afcea04ece3822d3a3e128c8e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_38038ee77c1733c82fef9cea94" ON "request_invitations" ("professional_id", "status") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_33d31f72d66fe6675cf47a9809" ON "request_invitations" ("request_id", "professional_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "request_photos" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "request_id" uuid NOT NULL, "url" character varying(500) NOT NULL, "sort_order" smallint NOT NULL DEFAULT '0', CONSTRAINT "PK_67eee207111af392224fc8ed28d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_8153079b7a69a5d3d2571ac7d6" ON "request_photos" ("request_id", "sort_order") `,
    );
    await queryRunner.query(`CREATE TYPE "public"."request_urgency" AS ENUM('FLEXIBLE', 'TODAY', 'URGENT')`);
    await queryRunner.query(
      `CREATE TYPE "public"."request_status" AS ENUM('DRAFT', 'WAITING_QUOTES', 'QUOTES_RECEIVED', 'PROFESSIONAL_SELECTED', 'SCHEDULED', 'AWAITING_REVIEW', 'CLOSED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "service_requests" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "client_id" uuid NOT NULL, "service_id" uuid NOT NULL, "title" character varying(140) NOT NULL, "description" text NOT NULL, "urgency" "public"."request_urgency" NOT NULL DEFAULT 'FLEXIBLE', "zone_id" uuid NOT NULL, "desired_date" date, "desired_time_range" character varying(80), "status" "public"."request_status" NOT NULL DEFAULT 'DRAFT', "exact_address" character varying(240), "selected_professional_id" uuid, "accepted_quote_id" uuid, "completed_at" TIMESTAMP WITH TIME ZONE, "cancelled_at" TIMESTAMP WITH TIME ZONE, "version" integer NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_ee60bcd826b7e130bfbd97daf66" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_80d4e9cce72ad92b06085b69b5" ON "service_requests" ("status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_250af5a5028c55ea49435a3c8e" ON "service_requests" ("client_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "reviews" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "request_id" uuid NOT NULL, "professional_id" uuid NOT NULL, "client_id" uuid NOT NULL, "rating" smallint NOT NULL, "comment" text, "verified_work" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "ck_reviews_rating" CHECK ("rating" BETWEEN 1 AND 5), CONSTRAINT "PK_231ae565c273ee700b283f15c1d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_1711b6d0fb9351f3bbc9fe109f" ON "reviews" ("professional_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_6ea6d2328e7d32aa0b0970d8d9" ON "reviews" ("request_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "quote_items" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "quote_id" uuid NOT NULL, "description" character varying(200) NOT NULL, "quantity" numeric(10,2) NOT NULL, "unit_price" numeric(12,2) NOT NULL, CONSTRAINT "ck_quote_items_unit_price" CHECK ("unit_price" >= 0), CONSTRAINT "ck_quote_items_quantity" CHECK ("quantity" > 0), CONSTRAINT "PK_135ad3f02b5abcf65fb5cb20ad2" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."quote_status" AS ENUM('PENDING', 'ACCEPTED', 'REJECTED', 'WITHDRAWN', 'EXPIRED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "quotes" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "request_id" uuid NOT NULL, "professional_id" uuid NOT NULL, "description" text NOT NULL, "labor_amount" numeric(12,2) NOT NULL, "materials_amount" numeric(12,2) NOT NULL, "total_amount" numeric(12,2) NOT NULL, "available_from" TIMESTAMP WITH TIME ZONE, "valid_until" TIMESTAMP WITH TIME ZONE, "status" "public"."quote_status" NOT NULL DEFAULT 'PENDING', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_99a0e8bcbcd8719d3a41f23c263" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_quotes_active_per_professional" ON "quotes" ("request_id", "professional_id") WHERE "status" IN ('PENDING', 'ACCEPTED')`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_faf10995e9f52fd00b62af839b" ON "quotes" ("request_id", "status") `,
    );
    await queryRunner.query(
      `CREATE TABLE "refresh_tokens" ("id" uuid NOT NULL, "user_id" uuid NOT NULL, "token_hash" character varying(64) NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "revoked_at" TIMESTAMP WITH TIME ZONE, "replaced_by_id" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_7d8bee0204106019488c4c50ffa" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_3ddc983c5f7bcf132fd8732c3f" ON "refresh_tokens" ("user_id") `);
    await queryRunner.query(
      `CREATE TYPE "public"."appointment_status" AS ENUM('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "appointments" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "request_id" uuid NOT NULL, "quote_id" uuid NOT NULL, "professional_id" uuid NOT NULL, "client_id" uuid NOT NULL, "scheduled_start" TIMESTAMP WITH TIME ZONE NOT NULL, "scheduled_end" TIMESTAMP WITH TIME ZONE NOT NULL, "status" "public"."appointment_status" NOT NULL DEFAULT 'SCHEDULED', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "ck_appointments_range" CHECK ("scheduled_end" > "scheduled_start"), CONSTRAINT "PK_4a437a9a27e948726b8bb3e36ad" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ce7562a07c08d6e0ef000f9090" ON "appointments" ("professional_id", "scheduled_start") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_e3c35b1e1bc9f9d6b4fd75d398" ON "appointments" ("request_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "zones" ADD CONSTRAINT "FK_cd00194405d6fd971c4b3b3b788" FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "FK_909d40049e01bd526a8566baee3" FOREIGN KEY ("default_zone_id") REFERENCES "zones"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "services" ADD CONSTRAINT "FK_1f8d1173481678a035b4a81a4ec" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "professional_services" ADD CONSTRAINT "FK_34a4319abc2199d0e68811d1824" FOREIGN KEY ("professional_id") REFERENCES "professional_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "professional_services" ADD CONSTRAINT "FK_2fad8b472d2afd9af6c048b715c" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "professional_service_areas" ADD CONSTRAINT "FK_b61a2f497de0d945ae9c4375c52" FOREIGN KEY ("professional_id") REFERENCES "professional_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "professional_service_areas" ADD CONSTRAINT "FK_fb6cdac33be5edd716347df0a28" FOREIGN KEY ("zone_id") REFERENCES "zones"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "professional_verifications" ADD CONSTRAINT "FK_4ff0f3be4ea54eebd78b0253a7f" FOREIGN KEY ("professional_id") REFERENCES "professional_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "professional_verifications" ADD CONSTRAINT "FK_e078920c27bd2c7aa0a75a7d84f" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "portfolio_items" ADD CONSTRAINT "FK_a5b919269cbc4b54747420011e1" FOREIGN KEY ("professional_id") REFERENCES "professional_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "portfolio_items" ADD CONSTRAINT "FK_7c221edddf48a88dc09872848be" FOREIGN KEY ("zone_id") REFERENCES "zones"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "professional_profiles" ADD CONSTRAINT "FK_ed5f5b62a353f11b36ceb7e2e8e" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "request_invitations" ADD CONSTRAINT "FK_406e366db7bc28836681a1eff9c" FOREIGN KEY ("request_id") REFERENCES "service_requests"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "request_invitations" ADD CONSTRAINT "FK_24a11a06504411b7660237ce927" FOREIGN KEY ("professional_id") REFERENCES "professional_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "request_photos" ADD CONSTRAINT "FK_289473f745aafd42bfe6a424817" FOREIGN KEY ("request_id") REFERENCES "service_requests"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "service_requests" ADD CONSTRAINT "FK_0f0523ef455e70bfe9a330342cc" FOREIGN KEY ("client_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "service_requests" ADD CONSTRAINT "FK_1c2a35adb9aed8807aae3d51ee7" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "service_requests" ADD CONSTRAINT "FK_50c85dfcaf983e9cb3c6ede3e0f" FOREIGN KEY ("zone_id") REFERENCES "zones"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "service_requests" ADD CONSTRAINT "FK_c5de0e0b46f2af8eac22d13a0da" FOREIGN KEY ("selected_professional_id") REFERENCES "professional_profiles"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "service_requests" ADD CONSTRAINT "FK_2cbbb15e17dc81aa77eac706266" FOREIGN KEY ("accepted_quote_id") REFERENCES "quotes"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "reviews" ADD CONSTRAINT "FK_6ea6d2328e7d32aa0b0970d8d96" FOREIGN KEY ("request_id") REFERENCES "service_requests"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "reviews" ADD CONSTRAINT "FK_5f6682d4c520380ddffafa43213" FOREIGN KEY ("professional_id") REFERENCES "professional_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "reviews" ADD CONSTRAINT "FK_d4e7e923e6bb78a8f0add754493" FOREIGN KEY ("client_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "quote_items" ADD CONSTRAINT "FK_c11d594b8cf436caaee20122fd8" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "quotes" ADD CONSTRAINT "FK_0c53b33e44ecbc5e82486c076a8" FOREIGN KEY ("request_id") REFERENCES "service_requests"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "quotes" ADD CONSTRAINT "FK_0598ad9cb27b9aa8f92caf59013" FOREIGN KEY ("professional_id") REFERENCES "professional_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" ADD CONSTRAINT "FK_3ddc983c5f7bcf132fd8732c3f4" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "appointments" ADD CONSTRAINT "FK_e3c35b1e1bc9f9d6b4fd75d3981" FOREIGN KEY ("request_id") REFERENCES "service_requests"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "appointments" ADD CONSTRAINT "FK_804fce91eb6f9ce6803eca0d6c9" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "appointments" ADD CONSTRAINT "FK_60b7a60cf6727d87d525a750414" FOREIGN KEY ("professional_id") REFERENCES "professional_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "appointments" ADD CONSTRAINT "FK_ccc5bbce58ad6bc96faa428b1e4" FOREIGN KEY ("client_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "appointments" DROP CONSTRAINT "FK_ccc5bbce58ad6bc96faa428b1e4"`);
    await queryRunner.query(`ALTER TABLE "appointments" DROP CONSTRAINT "FK_60b7a60cf6727d87d525a750414"`);
    await queryRunner.query(`ALTER TABLE "appointments" DROP CONSTRAINT "FK_804fce91eb6f9ce6803eca0d6c9"`);
    await queryRunner.query(`ALTER TABLE "appointments" DROP CONSTRAINT "FK_e3c35b1e1bc9f9d6b4fd75d3981"`);
    await queryRunner.query(`ALTER TABLE "refresh_tokens" DROP CONSTRAINT "FK_3ddc983c5f7bcf132fd8732c3f4"`);
    await queryRunner.query(`ALTER TABLE "quotes" DROP CONSTRAINT "FK_0598ad9cb27b9aa8f92caf59013"`);
    await queryRunner.query(`ALTER TABLE "quotes" DROP CONSTRAINT "FK_0c53b33e44ecbc5e82486c076a8"`);
    await queryRunner.query(`ALTER TABLE "quote_items" DROP CONSTRAINT "FK_c11d594b8cf436caaee20122fd8"`);
    await queryRunner.query(`ALTER TABLE "reviews" DROP CONSTRAINT "FK_d4e7e923e6bb78a8f0add754493"`);
    await queryRunner.query(`ALTER TABLE "reviews" DROP CONSTRAINT "FK_5f6682d4c520380ddffafa43213"`);
    await queryRunner.query(`ALTER TABLE "reviews" DROP CONSTRAINT "FK_6ea6d2328e7d32aa0b0970d8d96"`);
    await queryRunner.query(
      `ALTER TABLE "service_requests" DROP CONSTRAINT "FK_2cbbb15e17dc81aa77eac706266"`,
    );
    await queryRunner.query(
      `ALTER TABLE "service_requests" DROP CONSTRAINT "FK_c5de0e0b46f2af8eac22d13a0da"`,
    );
    await queryRunner.query(
      `ALTER TABLE "service_requests" DROP CONSTRAINT "FK_50c85dfcaf983e9cb3c6ede3e0f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "service_requests" DROP CONSTRAINT "FK_1c2a35adb9aed8807aae3d51ee7"`,
    );
    await queryRunner.query(
      `ALTER TABLE "service_requests" DROP CONSTRAINT "FK_0f0523ef455e70bfe9a330342cc"`,
    );
    await queryRunner.query(`ALTER TABLE "request_photos" DROP CONSTRAINT "FK_289473f745aafd42bfe6a424817"`);
    await queryRunner.query(
      `ALTER TABLE "request_invitations" DROP CONSTRAINT "FK_24a11a06504411b7660237ce927"`,
    );
    await queryRunner.query(
      `ALTER TABLE "request_invitations" DROP CONSTRAINT "FK_406e366db7bc28836681a1eff9c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "professional_profiles" DROP CONSTRAINT "FK_ed5f5b62a353f11b36ceb7e2e8e"`,
    );
    await queryRunner.query(`ALTER TABLE "portfolio_items" DROP CONSTRAINT "FK_7c221edddf48a88dc09872848be"`);
    await queryRunner.query(`ALTER TABLE "portfolio_items" DROP CONSTRAINT "FK_a5b919269cbc4b54747420011e1"`);
    await queryRunner.query(
      `ALTER TABLE "professional_verifications" DROP CONSTRAINT "FK_e078920c27bd2c7aa0a75a7d84f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "professional_verifications" DROP CONSTRAINT "FK_4ff0f3be4ea54eebd78b0253a7f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "professional_service_areas" DROP CONSTRAINT "FK_fb6cdac33be5edd716347df0a28"`,
    );
    await queryRunner.query(
      `ALTER TABLE "professional_service_areas" DROP CONSTRAINT "FK_b61a2f497de0d945ae9c4375c52"`,
    );
    await queryRunner.query(
      `ALTER TABLE "professional_services" DROP CONSTRAINT "FK_2fad8b472d2afd9af6c048b715c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "professional_services" DROP CONSTRAINT "FK_34a4319abc2199d0e68811d1824"`,
    );
    await queryRunner.query(`ALTER TABLE "services" DROP CONSTRAINT "FK_1f8d1173481678a035b4a81a4ec"`);
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "FK_909d40049e01bd526a8566baee3"`);
    await queryRunner.query(`ALTER TABLE "zones" DROP CONSTRAINT "FK_cd00194405d6fd971c4b3b3b788"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_e3c35b1e1bc9f9d6b4fd75d398"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_ce7562a07c08d6e0ef000f9090"`);
    await queryRunner.query(`DROP TABLE "appointments"`);
    await queryRunner.query(`DROP TYPE "public"."appointment_status"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_3ddc983c5f7bcf132fd8732c3f"`);
    await queryRunner.query(`DROP TABLE "refresh_tokens"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_faf10995e9f52fd00b62af839b"`);
    await queryRunner.query(`DROP INDEX "public"."uq_quotes_active_per_professional"`);
    await queryRunner.query(`DROP TABLE "quotes"`);
    await queryRunner.query(`DROP TYPE "public"."quote_status"`);
    await queryRunner.query(`DROP TABLE "quote_items"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_6ea6d2328e7d32aa0b0970d8d9"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_1711b6d0fb9351f3bbc9fe109f"`);
    await queryRunner.query(`DROP TABLE "reviews"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_250af5a5028c55ea49435a3c8e"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_80d4e9cce72ad92b06085b69b5"`);
    await queryRunner.query(`DROP TABLE "service_requests"`);
    await queryRunner.query(`DROP TYPE "public"."request_status"`);
    await queryRunner.query(`DROP TYPE "public"."request_urgency"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_8153079b7a69a5d3d2571ac7d6"`);
    await queryRunner.query(`DROP TABLE "request_photos"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_33d31f72d66fe6675cf47a9809"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_38038ee77c1733c82fef9cea94"`);
    await queryRunner.query(`DROP TABLE "request_invitations"`);
    await queryRunner.query(`DROP TYPE "public"."invitation_status"`);
    await queryRunner.query(`DROP TABLE "professional_profiles"`);
    await queryRunner.query(`DROP TYPE "public"."plan_tier"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_ba713dc8293c16417a2dae17e7"`);
    await queryRunner.query(`DROP TABLE "portfolio_items"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_2aa5d749535cacce7b430f8021"`);
    await queryRunner.query(`DROP TABLE "professional_verifications"`);
    await queryRunner.query(`DROP TYPE "public"."verification_status"`);
    await queryRunner.query(`DROP TYPE "public"."verification_type"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_fb6cdac33be5edd716347df0a2"`);
    await queryRunner.query(`DROP TABLE "professional_service_areas"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_2fad8b472d2afd9af6c048b715"`);
    await queryRunner.query(`DROP TABLE "professional_services"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_02cf0d0f46e11d22d952f62367"`);
    await queryRunner.query(`DROP TABLE "services"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_420d9f679d41281f282f5bc7d0"`);
    await queryRunner.query(`DROP TABLE "categories"`);
    await queryRunner.query(`DROP INDEX "public"."uq_users_email_lower"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_9c8106481f4f93a340a2d7e074"`);
    await queryRunner.query(`DROP TABLE "zones"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_8ef722e770798e37b3205370bf"`);
    await queryRunner.query(`DROP TABLE "cities"`);
  }
}
