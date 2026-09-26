import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { confirmWord, isRemoteDatabase, parseArgs } from '../common/cli';
import { buildDataSourceOptions } from '../database/typeorm.options';
import { ProfessionalProfile } from '../professionals/professional-profile.entity';
import { PlanTier } from '../professionals/professional.enums';
import { effectivePlan } from './plan';

/**
 * Cambia el plan de un profesional. Hasta que exista billing es la ÚNICA
 * forma: no hay endpoint (ni oculto) que lo permita.
 *
 *   npm run plan:set -- <email | id de perfil> --plan PRO
 *   npm run plan:set -- <email | id de perfil> --plan PRO --days 90
 *   npm run plan:set -- <email | id de perfil> --plan PRO --until 2026-12-31
 *   npm run plan:set -- <email | id de perfil> --plan FREE
 *   npm run plan:set -- list
 *
 * Al vencer un PRO temporal el plan efectivo vuelve a FREE solo, sin borrar
 * nada. Contra una base remota pide escribir PLAN. Nunca imprime la URL de la base.
 */

const HELP = `Uso:
  npm run plan:set -- <email | id de perfil> --plan PRO               PRO sin vencimiento
  npm run plan:set -- <email | id de perfil> --plan PRO --days 90     PRO por 90 días
  npm run plan:set -- <email | id de perfil> --plan PRO --until 2026-12-31
  npm run plan:set -- <email | id de perfil> --plan FREE              vuelve a Free
  npm run plan:set -- list                                            PRO vigentes y vencidos`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY_MS = 24 * 3600 * 1000;

/** Vencimiento pedido: `--days N` o `--until YYYY-MM-DD` (fin de ese día en Argentina). */
export function parseExpiry(flags: Record<string, string | true>, now = new Date()): Date | null | 'invalid' {
  if (flags.days !== undefined && flags.until !== undefined) return 'invalid';
  if (flags.days !== undefined) {
    const days = Number(flags.days);
    return Number.isInteger(days) && days > 0 && days <= 3650
      ? new Date(now.getTime() + days * DAY_MS)
      : 'invalid';
  }
  if (flags.until !== undefined) {
    if (typeof flags.until !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(flags.until)) return 'invalid';
    const end = new Date(`${flags.until}T23:59:59-03:00`);
    return Number.isNaN(end.getTime()) || end <= now ? 'invalid' : end;
  }
  return null;
}

async function main(): Promise<number> {
  config({ quiet: true });
  const { command, flags } = parseArgs(process.argv.slice(2));
  if (command === 'help' || command.startsWith('--')) {
    console.log(HELP);
    return command === 'help' ? 0 : 1;
  }
  if (!process.env.DATABASE_URL) {
    console.error('Falta DATABASE_URL.');
    return 1;
  }
  const plan = typeof flags.plan === 'string' ? flags.plan.toUpperCase() : undefined;
  if (command !== 'list' && plan !== PlanTier.PRO && plan !== PlanTier.FREE) {
    console.error('Indicá --plan PRO o --plan FREE.\n\n' + HELP);
    return 1;
  }
  const expiry = parseExpiry(flags);
  if (expiry === 'invalid' || (plan === PlanTier.FREE && expiry)) {
    console.error(
      'Vencimiento inválido: usá --days N (1–3650) o --until AAAA-MM-DD futuro, solo con --plan PRO.',
    );
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
    const profiles = ds.getRepository(ProfessionalProfile);
    if (command === 'list') {
      const pros = await profiles.find({
        where: { planTier: PlanTier.PRO },
        relations: { user: true },
        order: { createdAt: 'ASC' },
      });
      if (!pros.length) console.log('Nadie tiene PRO.');
      for (const p of pros) {
        const state = effectivePlan(p) === PlanTier.PRO ? 'vigente' : 'vencido';
        const until = p.planExpiresAt
          ? ` hasta ${p.planExpiresAt.toISOString().slice(0, 10)}`
          : ' sin vencimiento';
        console.log(`${p.user.email}  ${p.id}  PRO ${state}${until}`);
      }
      return 0;
    }

    const target = command.trim();
    const profile = UUID.test(target)
      ? await profiles.findOne({ where: { id: target }, relations: { user: true } })
      : await profiles
          .createQueryBuilder('p')
          .innerJoinAndSelect('p.user', 'u')
          .where('lower(u.email) = :email', { email: target.toLowerCase() })
          .getOne();
    if (!profile) {
      console.error('No existe un perfil profesional con ese email o id.');
      return 1;
    }
    if (isRemoteDatabase(process.env.DATABASE_URL) && !(await confirmWord('PLAN'))) {
      console.log('Cancelado: no se modificó nada.');
      return 1;
    }
    await profiles.update(profile.id, { planTier: plan as PlanTier, planExpiresAt: expiry });
    console.log(
      plan === PlanTier.PRO
        ? `Listo: ${profile.user.email} tiene PRO${expiry ? ` hasta ${expiry.toISOString().slice(0, 10)}` : ' sin vencimiento'}.`
        : `Listo: ${profile.user.email} vuelve a Free (no se borró nada).`,
    );
    return 0;
  } catch (error) {
    console.error(`Error: ${(error as Error).message}`);
    return 1;
  } finally {
    await ds.destroy();
  }
}

if (require.main === module) {
  void main().then((code) => process.exit(code));
}
