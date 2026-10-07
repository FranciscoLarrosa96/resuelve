import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Referidos simples: el premio sale al crear el perfil profesional y se
 * festeja una vez. `referral_rewards.celebrated_at` = la persona ya vio el
 * festejo. Los premios que ya existían se marcan como vistos: activar esto
 * nunca festeja premios viejos.
 */
export class ReferralCelebration1793600000000 implements MigrationInterface {
  name = 'ReferralCelebration1793600000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "referral_rewards" ADD "celebrated_at" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`UPDATE "referral_rewards" SET "celebrated_at" = "granted_at"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_referral_rewards_pending_celebration" ON "referral_rewards" ("professional_id") WHERE "celebrated_at" IS NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_referral_rewards_pending_celebration"`);
    await queryRunner.query(`ALTER TABLE "referral_rewards" DROP COLUMN "celebrated_at"`);
  }
}
