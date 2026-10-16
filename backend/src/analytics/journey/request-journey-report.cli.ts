import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { parseArgs } from '../../common/cli';
import { buildDataSourceOptions } from '../../database/typeorm.options';
import { OBSERVATION_WINDOW_HOURS } from './request-journey';
import { formatReport, requestJourneyReport } from './request-journey-report';

/**
 * Recorrido del pedido del cliente (solo lectura, agregado, sin datos personales):
 *
 *   npm run journey:report                                  últimos 30 días
 *   npm run journey:report -- --from 2026-10-01 --to 2026-10-16 [--window-hours 12] [--json]
 */
const HELP = `Uso:
  npm run journey:report                                    últimos 30 días
  npm run journey:report -- --from AAAA-MM-DD [--to AAAA-MM-DD] [--window-hours N] [--json]`;

const DAY_MS = 24 * 3600 * 1000;
const date = (v: string | true | undefined) =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00-03:00`) : null;

async function main(): Promise<number> {
  config({ quiet: true });
  const { command, flags } = parseArgs(['report', ...process.argv.slice(2)]);
  if (flags.help || command === 'help') {
    console.log(HELP);
    return 0;
  }
  if (!process.env.DATABASE_URL) {
    console.error('Falta DATABASE_URL.');
    return 1;
  }
  const now = new Date();
  const to = flags.to !== undefined ? date(flags.to) : now;
  const from = flags.from !== undefined ? date(flags.from) : new Date(now.getTime() - 30 * DAY_MS);
  const windowHours = flags['window-hours'] !== undefined ? Number(flags['window-hours']) : OBSERVATION_WINDOW_HOURS;
  if (!to || !from || from >= to || !Number.isInteger(windowHours) || windowHours < 1 || windowHours > 168) {
    console.error('Parámetros inválidos.\n\n' + HELP);
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
    // Transacción de solo lectura: aunque alguien edite la consulta, no puede escribir.
    const report = await ds.transaction('REPEATABLE READ', async (m) => {
      await m.query('SET TRANSACTION READ ONLY');
      return requestJourneyReport(m, { from, to, now, windowHours });
    });
    console.log(flags.json ? JSON.stringify(report, null, 2) : formatReport(report));
    return 0;
  } finally {
    await ds.destroy();
  }
}

main().then(
  (code) => process.exit(code),
  (error: Error) => {
    console.error(error.message);
    process.exit(1);
  },
);
