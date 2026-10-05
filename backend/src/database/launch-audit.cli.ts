import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { maskEmail } from '../common/mask-email';
import { OFFERS_PUBLICLY_SQL } from '../professionals/professional-rules';
import { buildDataSourceOptions } from './typeorm.options';
import { isJunkComment, looksLikeQaEmail, looksLikeQaText } from './launch-audit';

/**
 * Auditoría previa al lanzamiento. SOLO LECTURA: no modifica nada ni imprime datos de contacto
 * completos (emails enmascarados, ids). Qué hacer con lo que aparece lo decide una persona.
 *
 *   npm run launch:audit
 *
 * Revisa: perfiles/cuentas de QA visibles, reseñas basura, solicitudes de prueba, perfiles activos
 * que no se pueden publicar y la oferta real por servicio (liquidez, antes de promocionar una categoría).
 */
async function main(): Promise<number> {
  config({ quiet: true });
  if (!process.env.DATABASE_URL) {
    console.error('Falta DATABASE_URL.');
    return 1;
  }
  const ds = new DataSource({
    ...buildDataSourceOptions({ DATABASE_URL: process.env.DATABASE_URL, DATABASE_SSL: process.env.DATABASE_SSL }),
    logging: false,
  });
  try {
    await ds.initialize();
  } catch (error) {
    console.error(`No se pudo conectar a la base: ${(error as Error).message}`);
    return 1;
  }
  try {
    let findings = 0;
    const section = (title: string, lines: string[]) => {
      console.log(`\n${title}: ${lines.length}`);
      for (const line of lines.slice(0, 50)) console.log(`  - ${line}`);
      if (lines.length > 50) console.log(`  … y ${lines.length - 50} más`);
      findings += lines.length;
    };

    const profiles: { id: string; slug: string; status: string; first: string; last: string; email: string; headline: string | null }[] =
      await ds.query(
        `SELECT p.id, p.slug, p.status, u.first_name AS first, u.last_name AS last, u.email, p.headline
           FROM professional_profiles p JOIN users u ON u.id = p.user_id`,
      );
    section(
      'Perfiles profesionales que parecen de QA (ACTIVE = visibles hoy)',
      profiles
        .filter((p) => looksLikeQaText(`${p.first} ${p.last}`) || looksLikeQaText(p.headline) || looksLikeQaEmail(p.email))
        .map((p) => `${p.status} ${p.id} /p/${p.slug} (${maskEmail(p.email)})`),
    );

    const reviews: { id: string; professional_id: string; rating: number; comment: string | null }[] = await ds.query(
      `SELECT id, professional_id, rating, comment FROM reviews`,
    );
    section(
      'Reseñas con comentario basura',
      reviews.filter((r) => isJunkComment(r.comment)).map((r) => `${r.id} (${r.rating}★, profesional ${r.professional_id})`),
    );

    const requests: { id: string; title: string; status: string }[] = await ds.query(
      `SELECT id, title, status FROM service_requests`,
    );
    section(
      'Solicitudes con título de prueba',
      requests.filter((r) => looksLikeQaText(r.title) || isJunkComment(r.title)).map((r) => `${r.status} ${r.id}`),
    );

    const unpublishable: { id: string; slug: string }[] = await ds.query(
      `SELECT p.id, p.slug FROM professional_profiles p
        WHERE p.status = 'ACTIVE' AND NOT EXISTS (
          SELECT 1 FROM professional_services ps JOIN services s ON s.id = ps.service_id
           WHERE ps.professional_id = p.id AND s.active AND ${OFFERS_PUBLICLY_SQL})`,
    );
    section('Perfiles ACTIVE sin ningún servicio publicable (no entran al sitemap)', unpublishable.map((p) => `${p.id} /p/${p.slug}`));

    const supply: { service: string; pros: number }[] = await ds.query(
      `SELECT s.name AS service, COUNT(DISTINCT p.id)::int AS pros
         FROM services s
         LEFT JOIN professional_services ps ON ps.service_id = s.id
         LEFT JOIN professional_profiles p ON p.id = ps.professional_id AND p.status = 'ACTIVE'
              AND (p.covers_entire_city OR EXISTS (SELECT 1 FROM professional_service_areas a WHERE a.professional_id = p.id))
        WHERE s.active GROUP BY s.id, s.name ORDER BY pros DESC, s.name`,
    );
    console.log('\nOferta real por servicio (profesionales activos con cobertura) — no promocionar los de 0:');
    for (const row of supply) console.log(`  ${String(row.pros).padStart(3)}  ${row.service}`);

    console.log(findings ? `\n${findings} hallazgo(s) para revisar a mano antes de lanzar.` : '\nSin hallazgos de QA.');
    return 0;
  } finally {
    await ds.destroy();
  }
}

void main().then((code) => process.exit(code));
