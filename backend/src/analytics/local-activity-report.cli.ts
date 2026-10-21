import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { parseArgs } from '../common/cli';
import { buildDataSourceOptions } from '../database/typeorm.options';
import { localActivityReport } from './local-activity-report';

async function main() {
  const { flags } = parseArgs(['report', ...process.argv.slice(2)]);
  if (flags.help) {
    console.log(
      'npm run local:report -- --from AAAA-MM-DD --to AAAA-MM-DD (fin exclusivo, día de Argentina; solo lectura)',
    );
    return;
  }
  const parse = (v: string | true | undefined) =>
    typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00-03:00`) : null;
  const to = flags.to === undefined ? new Date() : parse(flags.to);
  const from = flags.from === undefined ? new Date(Date.now() - 30 * 86_400_000) : parse(flags.from);
  if (!from || !to || !Number.isFinite(+from) || !Number.isFinite(+to) || from >= to)
    throw new Error('Período inválido');
  config({ quiet: true });
  if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL');
  const db = new DataSource({
    ...buildDataSourceOptions({
      DATABASE_URL: process.env.DATABASE_URL,
      DATABASE_SSL: process.env.DATABASE_SSL,
    }),
    logging: false,
  });
  await db.initialize();
  try {
    console.log(JSON.stringify(await localActivityReport(db.manager, from, to), null, 2));
  } finally {
    await db.destroy();
  }
}
main().catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});
