import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * "Suele responder en…" con datos reales: `average_response_minutes` existía pero no se
 * calculaba. Desde ahora lo recalcula cada presupuesto (`professionals/response-time.ts`);
 * acá se calcula para todos con lo que ya pasó (mediana de las últimas 20 respuestas,
 * mínimo 3; si no, null). La fórmula queda copiada para que la migración no cambie.
 */
export class ResponseTime1794800000000 implements MigrationInterface {
  name = 'ResponseTime1794800000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      UPDATE professional_profiles p SET average_response_minutes = (
        SELECT CASE WHEN count(*) >= 3
                    THEN round(percentile_cont(0.5) WITHIN GROUP (ORDER BY a.minutes))::int END
          FROM (SELECT EXTRACT(EPOCH FROM (qf.first_at - i.available_at)) / 60 AS minutes
                  FROM request_invitations i
                  JOIN LATERAL (SELECT min(created_at) AS first_at FROM quotes
                                 WHERE professional_id = i.professional_id AND request_id = i.request_id) qf
                    ON qf.first_at IS NOT NULL
                 WHERE i.professional_id = p.id AND qf.first_at >= i.available_at
                 ORDER BY qf.first_at DESC LIMIT 20) a)`);
  }

  public async down(): Promise<void> {
    // Solo datos: la columna ya existía y los valores calculados se conservan.
  }
}
