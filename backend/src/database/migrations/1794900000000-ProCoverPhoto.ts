import { MigrationInterface, QueryRunner } from 'typeorm';

/** Foto de portada del perfil (beneficio PRO): Cloudinary público `resuelve/covers/<id>`. */
export class ProCoverPhoto1794900000000 implements MigrationInterface {
  name = 'ProCoverPhoto1794900000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE professional_profiles ADD COLUMN cover_public_id varchar(255) NULL`);
    await q.query(`ALTER TABLE professional_profiles ADD COLUMN cover_url varchar(500) NULL`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE professional_profiles DROP COLUMN cover_url`);
    await q.query(`ALTER TABLE professional_profiles DROP COLUMN cover_public_id`);
  }
}
