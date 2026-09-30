import { MigrationInterface, QueryRunner } from 'typeorm';

/** Fase 4: capacity, reversible portfolio archive and optional quote presentation fields. */
export class Phase4PortfolioAndQuoteDetails1792200000000 implements MigrationInterface {
  name = 'Phase4PortfolioAndQuoteDetails1792200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "professional_work_photos" ADD "archived_by_plan" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "professional_work_photos" ADD "featured" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_professional_work_photos_featured" ON "professional_work_photos" ("professional_id") WHERE "featured" = true`,
    );

    await queryRunner.query(`ALTER TABLE "quotes" ADD "note" text`);
    await queryRunner.query(`ALTER TABLE "quotes" ADD "estimated_duration" character varying(80)`);

    await queryRunner.query(`ALTER TABLE "quote_items" ADD "sort_order" integer NOT NULL DEFAULT 0`);
    // Preserve the database's existing row order for legacy detailed quotes.
    await queryRunner.query(`
      WITH ranked AS (
        SELECT "id", row_number() OVER (PARTITION BY "quote_id" ORDER BY ctid) - 1 AS position
        FROM "quote_items"
      )
      UPDATE "quote_items" AS item SET "sort_order" = ranked.position
      FROM ranked WHERE item."id" = ranked."id"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "quote_items" DROP COLUMN "sort_order"`);
    await queryRunner.query(`ALTER TABLE "quotes" DROP COLUMN "estimated_duration"`);
    await queryRunner.query(`ALTER TABLE "quotes" DROP COLUMN "note"`);
    await queryRunner.query(`DROP INDEX "public"."UQ_professional_work_photos_featured"`);
    await queryRunner.query(`ALTER TABLE "professional_work_photos" DROP COLUMN "featured"`);
    await queryRunner.query(`ALTER TABLE "professional_work_photos" DROP COLUMN "archived_by_plan"`);
  }
}
