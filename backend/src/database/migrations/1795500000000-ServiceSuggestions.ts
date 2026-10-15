import { MigrationInterface, QueryRunner } from 'typeorm';

export class ServiceSuggestions1795500000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE service_suggestions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name varchar(80) NOT NULL,
      name_key varchar(120) NOT NULL,
      status varchar(12) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED')),
      service_id uuid REFERENCES services(id) ON DELETE RESTRICT,
      reason varchar(300),
      reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      reviewed_at timestamptz,
      CONSTRAINT ck_service_suggestion_review CHECK (
        (status = 'PENDING' AND service_id IS NULL AND reason IS NULL AND reviewed_at IS NULL) OR
        (status = 'APPROVED' AND service_id IS NOT NULL AND reason IS NULL AND reviewed_at IS NOT NULL) OR
        (status = 'REJECTED' AND service_id IS NULL AND reason IS NOT NULL AND reviewed_at IS NOT NULL)
      )
    )`);
    await q.query(`CREATE UNIQUE INDEX uq_pending_service_suggestion ON service_suggestions(user_id, name_key) WHERE status = 'PENDING'`);
    await q.query(`CREATE INDEX ix_service_suggestions_status ON service_suggestions(status, created_at, id)`);
    await q.query(`CREATE INDEX ix_service_suggestions_user ON service_suggestions(user_id, created_at DESC)`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE service_suggestions`);
  }
}
