import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { parseArgs } from '../common/cli';
import { buildDataSourceOptions } from '../database/typeorm.options';
import { formatReport, marketplaceReport, REPORT_BREAKDOWNS, ReportBreakdown } from './marketplace-report';

/**
 * Reporte del marketplace (SOLO LECTURA, agregado, sin datos personales). Apunta a la base de
 * `DATABASE_URL`: consultar producción requiere que una persona autorizada lo corra con su acceso.
 *
 *   npm run marketplace:report                                  últimos 30 días, todo junto
 *   npm run marketplace:report -- --from 2026-09-01 --to 2026-10-01 --by city
 *   npm run marketplace:report -- --by service --json
 */
const HELP = `Uso:
  npm run marketplace:report                                    pedidos enviados en los últimos 30 días
  npm run marketplace:report -- --from AAAA-MM-DD [--to AAAA-MM-DD]
        [--by none|city|service|city-service] [--city <id>] [--service <id>] [--json]`;

const DAY_MS = 24 * 3600 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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
  const by = (flags.by === undefined ? 'none' : flags.by) as ReportBreakdown;
  const cityId = flags.city;
  const serviceId = flags.service;
  if (
    !to || !from || from >= to ||
    !REPORT_BREAKDOWNS.includes(by) ||
    (cityId !== undefined && !(typeof cityId === 'string' && UUID.test(cityId))) ||
    (serviceId !== undefined && !(typeof serviceId === 'string' && UUID.test(serviceId)))
  ) {
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
      return marketplaceReport(m, {
        from,
        to,
        now,
        by,
        cityId: typeof cityId === 'string' ? cityId : undefined,
        serviceId: typeof serviceId === 'string' ? serviceId : undefined,
      });
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
