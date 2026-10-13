import type { DataSource } from 'typeorm';
import { businessDayStart, businessToday } from '../../common/time';
import { EARLY_AHEAD_OF_FREE_SQL } from '../../funnel/funnel';
import { EFFECTIVE_PRO_SQL } from '../../plans/plan';
import { NotificationType, WeeklySummaryCounts } from '../notification.entity';
import { notify } from '../notify';

/** Hora de Argentina desde la que sale el resumen del lunes (nunca de madrugada). */
export const WEEKLY_SUMMARY_HOUR = 9;
const DAY_MS = 86_400_000;

export interface WeeklyWindow {
  /** Lunes 00:00 de la semana que se resume (hora de Argentina). */
  start: Date;
  /** Lunes 00:00 de esta semana: fin (exclusivo) de la semana que se resume. */
  end: Date;
  /** Desde cuándo se puede mandar (este lunes a las 9). */
  sendFrom: Date;
  /** "2026-10-05": lunes de la semana resumida (clave del aviso). */
  key: string;
}

/** La semana anterior completa (lunes a domingo, hora de Argentina) respecto de `now`. */
export function weeklyWindow(now = new Date()): WeeklyWindow {
  const today = businessToday(now);
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay(); // 0 = domingo
  const thisMonday = new Date(Date.parse(`${today}T12:00:00Z`) - ((weekday + 6) % 7) * DAY_MS)
    .toISOString()
    .slice(0, 10);
  const lastMonday = new Date(Date.parse(`${thisMonday}T12:00:00Z`) - 7 * DAY_MS).toISOString().slice(0, 10);
  const end = businessDayStart(thisMonday);
  return {
    start: businessDayStart(lastMonday),
    end,
    sendFrom: new Date(end.getTime() + WEEKLY_SUMMARY_HOUR * 3_600_000),
    key: lastMonday,
  };
}

/** Hubo algo que contar (nunca se manda un resumen en cero). */
export const hasWeeklyNews = (c: WeeklySummaryCounts): boolean => c.featured + c.early + c.views > 0;

/**
 * "Tu semana con PRO": a cada PRO vigente, lo que pasó en su perfil la semana anterior
 * (apariciones en Destacados, solicitudes que le llegaron antes que a un Free, visitas).
 * Solo si hubo algo. Un aviso por persona y semana (`dedupe_key`): el job puede correr
 * cada hora y desde el lunes a las 9 lo crea una sola vez; push lo manda el dispatcher de
 * siempre (silencio 23–8). Devuelve cuántos avisos nuevos intentó crear.
 */
export async function sendProWeeklySummaries(ds: DataSource, now = new Date()): Promise<number> {
  const w = weeklyWindow(now);
  if (now < w.sendFrom) return 0;
  const rows = await ds.query<{ id: string; user_id: string; featured: number; early: number; views: number }[]>(
    `SELECT p.id, p.user_id,
            (SELECT count(*) FROM exposure_events e
              WHERE e.professional_id = p.id AND e.type = 'SEARCH_IMPRESSION' AND e.is_featured_placement
                AND e.occurred_at >= $1 AND e.occurred_at < $2)::int AS featured,
            (SELECT count(DISTINCT f.ref) FROM pro_funnel_events f
              WHERE f.professional_id = p.id AND ${EARLY_AHEAD_OF_FREE_SQL('f')}
                AND f.occurred_at >= $1 AND f.occurred_at < $2)::int AS early,
            (SELECT count(*) FROM exposure_events e
              WHERE e.professional_id = p.id AND e.type = 'PROFILE_VIEW'
                AND e.occurred_at >= $1 AND e.occurred_at < $2)::int AS views
       FROM professional_profiles p
      WHERE ${EFFECTIVE_PRO_SQL}
        AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.dedupe_key = $3 || p.id || ':' || $4)`,
    [w.start, w.end, `${NotificationType.PRO_WEEKLY_SUMMARY}:`, w.key],
  );
  let created = 0;
  for (const r of rows) {
    const weekly = { featured: Number(r.featured), early: Number(r.early), views: Number(r.views) };
    if (!hasWeeklyNews(weekly)) continue;
    await ds.transaction((m) =>
      notify(
        m,
        { userId: r.user_id, type: NotificationType.PRO_WEEKLY_SUMMARY, dedupeRef: `${r.id}:${w.key}`, payload: { weekly } },
        null,
      ),
    );
    created++;
  }
  return created;
}
