import { EntityManager } from 'typeorm';

/** Portada de un trabajo realizado (la primera foto activa), para tarjetas y presupuestos. */
export interface WorkCover {
  title: string;
  url: string;
}

/** Portadas por profesional en tarjetas de resultados y presupuestos (presentación de PRO). */
export const WORK_COVERS_PER_PROFESSIONAL = 3;

/**
 * Portadas de hasta 3 trabajos públicos por profesional (misma regla que el perfil
 * público: trabajo y foto no archivados, del más reciente al más viejo, la primera
 * foto activa es la portada), en UNA consulta para toda la página. Quien llama decide
 * a quién se le muestran: solo a un PRO vigente.
 */
export async function workCoversFor(m: EntityManager, professionalIds: string[]): Promise<Map<string, WorkCover[]>> {
  const out = new Map<string, WorkCover[]>();
  if (!professionalIds.length) return out;
  const rows: { professional_id: string; title: string; url: string }[] = await m.query(
    `SELECT professional_id, title, url FROM (
       SELECT w.professional_id, w.title, cover.image_url AS url,
              row_number() OVER (PARTITION BY w.professional_id ORDER BY w.done_on DESC, w.created_at DESC) AS n
         FROM professional_works w
         JOIN LATERAL (
           SELECT ph.image_url FROM professional_work_photos ph
            WHERE ph.work_id = w.id AND NOT ph.archived_by_plan
            ORDER BY ph.sort_order ASC, ph.created_at ASC
            LIMIT 1
         ) cover ON true
        WHERE w.professional_id = ANY($1::uuid[]) AND NOT w.archived_by_plan
     ) t
     WHERE n <= $2
     ORDER BY professional_id, n`,
    [professionalIds, WORK_COVERS_PER_PROFESSIONAL],
  );
  for (const r of rows) {
    const list = out.get(r.professional_id) ?? [];
    list.push({ title: r.title, url: r.url });
    out.set(r.professional_id, list);
  }
  return out;
}
