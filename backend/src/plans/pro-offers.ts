import type { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import type { EntityManager } from 'typeorm';
import { businessToday } from '../common/time';
import { ProfessionalProfile } from '../professionals/professional-profile.entity';
import { PlanTier } from '../professionals/professional.enums';
import { effectivePlan, PlanFields } from './plan';
import { ProOfferEvent, ProOfferEventType, ProOfferSurface } from './pro-offer-event.entity';
import { ProOfferRedemption } from './pro-offer-redemption.entity';
import { freeQuoteLimit, monthlyQuoteUsage } from './quote-quota';

/**
 * Ofertas comerciales de PRO. Única fuente de qué oferta existe, cuánto
 * descuenta y quién puede usarla: la UI solo decide CUÁNDO mostrarla.
 *
 * - Cada oferta tiene un código estable (`PRO_FIRST_MONTH_20`) y un tipo. Hoy
 *   existe solo `INTRO` (bienvenida, desde env `PRO_INTRO_OFFER_*`); sumar
 *   `PRO_FOUNDERS` o `PRO_WINBACK` es otro tipo con su propia regla en
 *   `offerIneligibility`, sin tocar el resto.
 * - Precio y descuento se recalculan SIEMPRE acá (`offerPricing`): el frontend
 *   solo manda el código.
 * - Una sola vez: `pro_offer_redemptions` (unique profesional + código) y
 *   `first_paid_pro_at` (quien ya pagó PRO no vuelve a tener bienvenida). Con
 *   billing se consume con el primer cobro promocional APROBADO, nunca al
 *   crear el checkout.
 * - Sin urgencia inventada: la oferta dura mientras siga siendo elegible o
 *   hasta que se apague por config.
 */

export type ProOfferKind = 'INTRO';

export interface ProOffer {
  code: string;
  kind: ProOfferKind;
  discountPercent: number;
  /** Meses con descuento; después, precio base. */
  cycles: number;
  /** Presupuestos del mes desde los que se ofrece (acotado al cupo FREE). */
  minFreeUsage: number;
}

export type ProOfferIneligibility =
  | 'OFFER_DISABLED'
  | 'NOT_FREE'
  /** FREE sin tope configurado: no hay límite que resolver. */
  | 'NO_FREE_LIMIT'
  | 'USAGE_BELOW_THRESHOLD'
  | 'ALREADY_HAD_PRO'
  | 'ALREADY_REDEEMED';

export const OFFER_CODE_PATTERN = /^[A-Z0-9_]{3,40}$/;

/** Oferta de bienvenida configurada (null = apagada con `PRO_INTRO_OFFER_ENABLED=false`). */
export function introOffer(config: ConfigService): ProOffer | null {
  if (!config.get<boolean>('PRO_INTRO_OFFER_ENABLED', true)) return null;
  return {
    code: config.get<string>('PRO_INTRO_OFFER_CODE', 'PRO_FIRST_MONTH_20'),
    kind: 'INTRO',
    discountPercent: config.get<number>('PRO_INTRO_OFFER_DISCOUNT_PERCENT', 20),
    cycles: config.get<number>('PRO_INTRO_OFFER_CYCLES', 1),
    minFreeUsage: config.get<number>('PRO_INTRO_OFFER_MIN_FREE_USAGE', 9),
  };
}

/** Ofertas vigentes por config. Hoy una; el resto del código busca por código. */
export function configuredOffers(config: ConfigService): ProOffer[] {
  return [introOffer(config)].filter((o): o is ProOffer => o !== null);
}

export function findOffer(config: ConfigService, code: string): ProOffer | null {
  return configuredOffers(config).find((o) => o.code === code) ?? null;
}

export const proMonthlyPrice = (config: ConfigService): number =>
  config.get<number>('PRO_MONTHLY_PRICE_ARS', 19000);

/** Precio con descuento de los primeros `cycles` meses, en pesos enteros. */
export function offerPricing(offer: ProOffer, basePriceArs: number) {
  return {
    basePriceArs,
    discountPercent: offer.discountPercent,
    cycles: offer.cycles,
    discountedPriceArs: Math.round((basePriceArs * (100 - offer.discountPercent)) / 100),
  };
}

export interface OfferContext {
  profile: PlanFields & Pick<ProfessionalProfile, 'firstPaidProAt' | 'proInterestOfferCode'>;
  /** Presupuestos del mes (solicitudes distintas, `monthlyQuoteUsage`). */
  used: number;
  /** Tope FREE configurado (null = sin límite). */
  freeLimit: number | null;
  /** Ya existe una redención de este código para este profesional. */
  redeemed: boolean;
  now?: Date;
}

/**
 * Por qué NO puede usar la oferta (null = elegible). Bienvenida:
 * FREE efectivo + cupo con tope + nunca pagó PRO + no la usó + (llegó a
 * `minFreeUsage` este mes O ya la había reservado al pedir PRO).
 */
export function offerIneligibility(offer: ProOffer, ctx: OfferContext): ProOfferIneligibility | null {
  switch (offer.kind) {
    case 'INTRO': {
      if (effectivePlan(ctx.profile, ctx.now) !== PlanTier.FREE) return 'NOT_FREE';
      if (ctx.redeemed) return 'ALREADY_REDEEMED';
      if (ctx.profile.firstPaidProAt) return 'ALREADY_HAD_PRO';
      if (ctx.freeLimit === null) return 'NO_FREE_LIMIT';
      const reserved = ctx.profile.proInterestOfferCode === offer.code;
      if (!reserved && ctx.used < Math.min(offer.minFreeUsage, ctx.freeLimit)) return 'USAGE_BELOW_THRESHOLD';
      return null;
    }
  }
}

/** ¿Ya la usó? (una fila por profesional + código). */
export async function isRedeemed(
  m: Pick<EntityManager, 'query'>,
  professionalId: string,
  offerCode: string,
): Promise<boolean> {
  const rows = await m.query<unknown[]>(
    `SELECT 1 FROM pro_offer_redemptions WHERE professional_id = $1 AND offer_code = $2 LIMIT 1`,
    [professionalId, offerCode],
  );
  return rows.length > 0;
}

/**
 * Lo que ve el propio profesional (`/pro/me` → `proIntroOffer` y el 403 del
 * cupo). Si no es elegible no se detalla el descuento: la UI no tiene nada
 * que mostrar ni que inferir.
 */
export type PresentedOffer =
  | {
      eligible: true;
      offerCode: string;
      discountPercent: number;
      appliesToCycles: number;
      basePriceArs: number;
      discountedPriceArs: number;
      /** La reservó al pedir PRO (sigue valiendo aunque el cupo vuelva a 0). */
      reserved: boolean;
    }
  | { eligible: false; reason: ProOfferIneligibility };

/** Elegibilidad completa de una oferta (con la consulta de redención solo si hace falta). */
export async function offerReason(
  m: Pick<EntityManager, 'query'>,
  offer: ProOffer,
  profile: OfferContext['profile'] & Pick<ProfessionalProfile, 'id'>,
  used: number,
  config: ConfigService,
  now = new Date(),
): Promise<ProOfferIneligibility | null> {
  const ctx = { profile, used, freeLimit: freeQuoteLimit(config), redeemed: false, now };
  // Sin query si ya queda afuera por plan, historial o uso.
  const cheap = offerIneligibility(offer, ctx);
  if (cheap) return cheap;
  return offerIneligibility(offer, { ...ctx, redeemed: await isRedeemed(m, profile.id, offer.code) });
}

export async function presentIntroOffer(
  m: Pick<EntityManager, 'query'>,
  profile: OfferContext['profile'] & Pick<ProfessionalProfile, 'id'>,
  used: number,
  config: ConfigService,
  now = new Date(),
): Promise<PresentedOffer> {
  const offer = introOffer(config);
  if (!offer) return { eligible: false, reason: 'OFFER_DISABLED' };
  const reason = await offerReason(m, offer, profile, used, config, now);
  if (reason) return { eligible: false, reason };
  const pricing = offerPricing(offer, proMonthlyPrice(config));
  return {
    eligible: true,
    offerCode: offer.code,
    discountPercent: pricing.discountPercent,
    appliesToCycles: pricing.cycles,
    basePriceArs: pricing.basePriceArs,
    discountedPriceArs: pricing.discountedPriceArs,
    reserved: profile.proInterestOfferCode === offer.code,
  };
}

/**
 * Dedupe de eventos: SHOWN/CLICKED una vez por profesional + oferta +
 * superficie + día de Argentina; REDEEMED una vez por profesional + oferta.
 */
export function offerEventDedupeKey(
  type: ProOfferEventType,
  professionalId: string,
  offerCode: string,
  surface: ProOfferSurface | null,
  now = new Date(),
): string {
  const parts =
    type === ProOfferEventType.REDEEMED
      ? [type, professionalId, offerCode]
      : [type, professionalId, offerCode, surface ?? '-', businessToday(now)];
  return createHash('sha256').update(parts.join('|')).digest('hex');
}

export type RedeemResult =
  | { ok: true; redemption: ProOfferRedemption }
  | { ok: false; reason: ProOfferIneligibility | 'UNKNOWN_OFFER' };

/**
 * Usa una oferta desde `plan:set --offer` (PRO manual). Con billing la
 * redención la hace la reconciliación con el primer cobro promocional
 * aprobado (`billing/billing-reconciler.service.ts`), sobre la misma tabla y
 * unique. Dentro de la transacción de quien activa PRO:
 * 1. bloquea el perfil (`FOR UPDATE`) y revalida la elegibilidad en el servidor;
 * 2. inserta la redención con `ON CONFLICT DO NOTHING` (unique profesional +
 *    código): de dos intentos simultáneos, uno solo la obtiene;
 * 3. registra `REDEEMED` y marca `first_paid_pro_at`.
 * Los montos salen de la config, nunca de quien llama.
 */
export async function redeemOffer(
  m: EntityManager,
  professionalId: string,
  offerCode: string,
  config: ConfigService,
  now = new Date(),
): Promise<RedeemResult> {
  const offer = findOffer(config, offerCode);
  if (!offer) return { ok: false, reason: 'UNKNOWN_OFFER' };
  const profile = await m.findOneOrFail(ProfessionalProfile, {
    where: { id: professionalId },
    lock: { mode: 'pessimistic_write' },
  });
  const reason = offerIneligibility(offer, {
    profile,
    used: await monthlyQuoteUsage(m, professionalId),
    freeLimit: freeQuoteLimit(config),
    redeemed: await isRedeemed(m, professionalId, offer.code),
    now,
  });
  if (reason) return { ok: false, reason };

  const pricing = offerPricing(offer, proMonthlyPrice(config));
  const inserted = await m
    .createQueryBuilder()
    .insert()
    .into(ProOfferRedemption)
    .values({ professionalId, offerCode: offer.code, ...pricing })
    .orIgnore()
    .returning('id')
    .execute();
  if (!(inserted.raw as unknown[]).length) return { ok: false, reason: 'ALREADY_REDEEMED' };

  await m
    .createQueryBuilder()
    .insert()
    .into(ProOfferEvent)
    .values({
      type: ProOfferEventType.REDEEMED,
      surface: null,
      professionalId,
      offerCode: offer.code,
      dedupeKey: offerEventDedupeKey(ProOfferEventType.REDEEMED, professionalId, offer.code, null, now),
    })
    .orIgnore()
    .execute();
  await m.update(ProfessionalProfile, professionalId, { firstPaidProAt: profile.firstPaidProAt ?? now });
  const redemption = await m.findOneByOrFail(ProOfferRedemption, { professionalId, offerCode: offer.code });
  return { ok: true, redemption };
}
