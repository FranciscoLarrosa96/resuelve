import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { parseArgs } from '../common/cli';
import { buildDataSourceOptions } from '../database/typeorm.options';
import { FUNNEL_STEPS, funnelCounts, funnelRates } from './funnel-report';

/**
 * Embudo del profesional (solo lectura, sin datos personales):
 *
 *   npm run funnel:report                                   cohorte de los últimos 90 días
 *   npm run funnel:report -- --from 2026-09-01 --to 2026-10-01
 */
const HELP = `Uso:
  npm run funnel:report                                  registrados en los últimos 90 días
  npm run funnel:report -- --from AAAA-MM-DD [--to AAAA-MM-DD]`;

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
  const to = flags.to !== undefined ? date(flags.to) : new Date();
  const from = flags.from !== undefined ? date(flags.from) : new Date(Date.now() - 90 * DAY_MS);
  if (!to || !from || from >= to) {
    console.error('Fechas inválidas.\n\n' + HELP);
    return 1;
  }
  const ds = new DataSource({
    ...buildDataSourceOptions({
      DATABASE_URL: process.env.DATABASE_URL,
      DATABASE_SSL: process.env.DATABASE_SSL,
    }),
    logging: false,
  });
  try {
    await ds.initialize();
  } catch (error) {
    console.error(`No se pudo conectar a la base: ${(error as Error).message}`);
    return 1;
  }
  try {
    const counts = await funnelCounts(ds.manager, from, to);
    console.log(
      `Cohorte: profesionales registrados entre ${from.toISOString().slice(0, 10)} y ${to.toISOString().slice(0, 10)}\n`,
    );
    for (const s of FUNNEL_STEPS) console.log(`${s.label.padEnd(30)} ${String(counts[s.key]).padStart(6)}`);
    console.log(`${'Cancelaron'.padEnd(30)} ${String(counts.cancelled).padStart(6)}\n`);
    const r = funnelRates(counts);
    const show = (label: string, v: number | null) =>
      console.log(`${label.padEnd(30)} ${v === null ? '—' : `${v} %`}`);
    show('Activation Rate', r.activationRate);
    show('First Success Rate', r.firstSuccessRate);
    show('Free → PRO', r.freeToPro);
    show('First Success → PRO', r.firstSuccessToPro);
    show('PRO → segundo mes', r.proToSecondMonth);
    show('Cancelación', r.cancellation);
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
