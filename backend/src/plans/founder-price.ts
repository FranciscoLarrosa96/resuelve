import type { ConfigService } from '@nestjs/config';
import type { EntityManager } from 'typeorm';
import { proMonthlyPrice } from './pro-offers';

/**
 * Precio fundador de PRO. Única regla de quién lo tiene y cuánto paga.
 *
 * - Los primeros `PRO_FOUNDER_SLOTS` profesionales con un cobro de PRO
 *   APROBADO (Mercado Pago o transferencia confirmada) guardan el precio
 *   mensual vigente en ese momento (`founder_price_ars`). Un PRO manual, una
 *   prueba o un checkout abandonado no ocupan lugar.
 * - Lo conservan para siempre en esa cuenta: cada compra nueva (suscripción o
 *   transferencia) usa el menor entre su precio fundador y el vigente. Una
 *   suscripción ya creada mantiene su monto como siempre.
 * - El contador es real: lugares configurados menos fundadores registrados.
 *   Lo escaso es la garantía de precio, no el precio de hoy: al completarse
 *   no cambia ningún precio por sí solo.
 * - `PRO_FOUNDER_SLOTS=0` lo apaga (no se muestra ni se asignan lugares).
 */

export interface FounderOverview {
  slots: number;
  taken: number;
  remaining: number;
  /** Precio que queda garantizado para quien ocupe un lugar hoy. */
  priceArs: number;
}

const FOUNDER_LOCK = 'pro_founder_seats';

export const founderSlots = (config: ConfigService): number => Math.max(0, config.get<number>('PRO_FOUNDER_SLOTS', 30));

export async function founderOverview(m: Pick<EntityManager, 'query'>, config: ConfigService): Promise<FounderOverview | null> {
  const slots = founderSlots(config);
  if (slots === 0) return null;
  const [{ taken }] = await m.query<{ taken: number }[]>(
    `SELECT count(*)::int AS taken FROM professional_profiles WHERE founder_at IS NOT NULL`,
  );
  return { slots, taken, remaining: Math.max(0, slots - taken), priceArs: await proMonthlyPrice(m, config) };
}

/**
 * Asigna un lugar al confirmarse un cobro aprobado, dentro de esa misma
 * transacción. Serializado: dos cobros simultáneos no ocupan el mismo último
 * lugar. Idempotente (quien ya es fundador no cambia de precio).
 */
export async function claimFounderSeat(
  m: EntityManager,
  config: ConfigService,
  professionalId: string,
  now: Date,
): Promise<boolean> {
  const slots = founderSlots(config);
  if (slots === 0) return false;
  await m.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [FOUNDER_LOCK]);
  const price = await proMonthlyPrice(m, config);
  const rows = await m.query<{ id: string }[]>(
    `UPDATE professional_profiles SET founder_price_ars = $2, founder_at = $3
      WHERE id = $1 AND founder_at IS NULL
        AND (SELECT count(*) FROM professional_profiles WHERE founder_at IS NOT NULL) < $4
      RETURNING id`,
    [professionalId, price, now, slots],
  );
  return rows.length > 0;
}

/** Precio mensual base de una compra nueva de PRO para este profesional. */
export const founderAwarePrice = (currentPriceArs: number, founderPriceArs: number | null | undefined): number =>
  founderPriceArs != null && founderPriceArs > 0 ? Math.min(currentPriceArs, founderPriceArs) : currentPriceArs;
