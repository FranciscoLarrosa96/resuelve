import 'reflect-metadata';
import type { ConfigService } from '@nestjs/config';
import { config } from 'dotenv';
import { DataSource, IsNull, Not } from 'typeorm';
import { confirmWord, isRemoteDatabase, parseArgs } from '../common/cli';
import { buildDataSourceOptions } from '../database/typeorm.options';
import { ProfessionalProfile } from '../professionals/professional-profile.entity';
import { PlanTier } from '../professionals/professional.enums';
import { effectivePlan } from './plan';
import { OFFER_CODE_PATTERN, configuredOffers, redeemOffer } from './pro-offers';

/**
 * Cambia el plan de un profesional. Hasta que exista billing es la ÚNICA
 * forma: no hay endpoint (ni oculto) que lo permita.
 *
 *   npm run plan:set -- <email | id de perfil> --plan PRO
 *   npm run plan:set -- <email | id de perfil> --plan PRO --days 90
 *   npm run plan:set -- <email | id de perfil> --plan PRO --until 2026-12-31
 *   npm run plan:set -- <email | id de perfil> --plan FREE
 *   npm run plan:set -- <email | id de perfil> --plan PRO --days 30 --offer PRO_FIRST_MONTH_20
 *   npm run plan:set -- <email | id de perfil> --plan PRO --days 90 --courtesy
 *   npm run plan:set -- list
 *   npm run plan:set -- offers
 *
 * PRO sin `--courtesy` cuenta como PRO pago (`first_paid_pro_at`): después ya
 * no tiene oferta de bienvenida. `--offer` usa la oferta (una sola vez,
 * revalidada en el servidor) e imprime cuánto cobrar el primer mes.
 *
 * Al vencer un PRO temporal el plan efectivo vuelve a FREE solo, sin borrar
 * nada. Contra una base remota pide escribir PLAN. Nunca imprime la URL de la base.
 */

const HELP = `Uso:
  npm run plan:set -- <email | id de perfil> --plan PRO               PRO sin vencimiento
  npm run plan:set -- <email | id de perfil> --plan PRO --days 90     PRO por 90 días
  npm run plan:set -- <email | id de perfil> --plan PRO --until 2026-12-31
  npm run plan:set -- <email | id de perfil> --plan FREE              vuelve a Free
  npm run plan:set -- <…> --plan PRO --days 30 --offer PRO_FIRST_MONTH_20   usa la oferta (una vez)
  npm run plan:set -- <…> --plan PRO --days 90 --courtesy             PRO de cortesía (no cuenta como pago)
  npm run plan:set -- list                                            PRO vigentes/vencidos y pedidos "Quiero PRO"
  npm run plan:set -- offers                                          embudo de ofertas (mostrada, click, pedida, usada)`;

/** ConfigService mínimo para el CLI: lee process.env con el tipo del default (sin exigir JWT ni el resto). */
export function envConfig(env: NodeJS.ProcessEnv = process.env): ConfigService {
  const get = (key: string, fallback?: unknown): unknown => {
    const raw = env[key];
    if (raw === undefined || raw === '') return fallback;
    if (typeof fallback === 'number') return Number(raw);
    if (typeof fallback === 'boolean') return raw === 'true';
    return raw;
  };
  return { get } as unknown as ConfigService;
}

const ars = (n: number) => `$${n.toLocaleString('es-AR')}`;

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
  const offerCode = typeof flags.offer === 'string' ? flags.offer.toUpperCase() : undefined;
  const courtesy = flags.courtesy === true;
  if (
    flags.offer !== undefined &&
    (plan !== PlanTier.PRO || !offerCode || !OFFER_CODE_PATTERN.test(offerCode) || courtesy)
  ) {
    console.error('--offer CODIGO va solo con --plan PRO y sin --courtesy.');
    return 1;
  }
  if (courtesy && plan !== PlanTier.PRO) {
    console.error('--courtesy va solo con --plan PRO.');
    return 1;
  }
  if (command !== 'list' && command !== 'offers' && plan !== PlanTier.PRO && plan !== PlanTier.FREE) {
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
      // Pedidos "Quiero PRO" desde la app de quienes hoy no lo tienen vigente.
      const asked = (
        await profiles.find({
          where: { proInterestAt: Not(IsNull()) },
          relations: { user: true },
          order: { proInterestAt: 'ASC' },
        })
      ).filter((p) => effectivePlan(p) !== PlanTier.PRO);
      if (asked.length) {
        console.log('\nPidieron PRO desde la app:');
        for (const p of asked) {
          const offer = p.proInterestOfferCode ? `  con ${p.proInterestOfferCode}` : '';
          console.log(
            `${p.user.email}  ${p.id}  desde ${p.proInterestAt!.toISOString().slice(0, 10)}${offer}`,
          );
        }
      }
      return 0;
    }

    if (command === 'offers') {
      // Profesionales distintos por paso (los eventos ya vienen deduplicados por día).
      const rows = await ds.query<{ offer_code: string; type: string; pros: number }[]>(
        `SELECT offer_code, type::text, count(DISTINCT professional_id)::int AS pros
           FROM pro_offer_events GROUP BY offer_code, type ORDER BY offer_code, type`,
      );
      const reserved = await ds.query<{ code: string; pros: number }[]>(
        `SELECT pro_interest_offer_code AS code, count(*)::int AS pros FROM professional_profiles
          WHERE pro_interest_offer_code IS NOT NULL GROUP BY 1`,
      );
      const codes = new Set([
        ...configuredOffers(envConfig()).map((o) => o.code),
        ...rows.map((r) => r.offer_code),
      ]);
      if (!codes.size) console.log('No hay ofertas configuradas ni eventos.');
      for (const code of codes) {
        const n = (type: string) => rows.find((r) => r.offer_code === code && r.type === type)?.pros ?? 0;
        const asked = reserved.find((r) => r.code === code)?.pros ?? 0;
        console.log(
          `${code}: mostrada ${n('SHOWN')} · click ${n('CLICKED')} · pidieron PRO ${asked} · usada ${n('REDEEMED')} (profesionales)`,
        );
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
    const outcome = await ds.transaction(async (m) => {
      // La oferta se revalida y se usa ANTES de activar PRO (sigue siendo Free al chequear).
      const redeemed = offerCode ? await redeemOffer(m, profile.id, offerCode, envConfig()) : null;
      if (redeemed && !redeemed.ok) return redeemed;
      await m.update(ProfessionalProfile, profile.id, { planTier: plan as PlanTier, planExpiresAt: expiry });
      if (plan === PlanTier.PRO && !courtesy) {
        await m.query(
          `UPDATE professional_profiles SET first_paid_pro_at = coalesce(first_paid_pro_at, now()) WHERE id = $1`,
          [profile.id],
        );
      }
      return redeemed;
    });
    if (outcome && !outcome.ok) {
      console.error(`No se puede usar ${offerCode}: ${outcome.reason}. No se modificó nada.`);
      return 1;
    }
    console.log(
      plan === PlanTier.PRO
        ? `Listo: ${profile.user.email} tiene PRO${courtesy ? ' de cortesía' : ''}${expiry ? ` hasta ${expiry.toISOString().slice(0, 10)}` : ' sin vencimiento'}.`
        : `Listo: ${profile.user.email} vuelve a Free (no se borró nada).`,
    );
    if (outcome?.ok) {
      const r = outcome.redemption;
      const months = r.cycles === 1 ? 'el primer mes' : `los primeros ${r.cycles} meses`;
      console.log(
        `${r.offerCode}: ${ars(r.discountedPriceArs)} ${months} (${r.discountPercent}% OFF), después ${ars(r.basePriceArs)} / mes.`,
      );
    }
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
