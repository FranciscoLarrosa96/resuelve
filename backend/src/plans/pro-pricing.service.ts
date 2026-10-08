import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-codes';
import { defaultProMonthlyPrice, introOffer, minProMonthlyPrice, offerPricing, proMonthlyPrice } from './pro-offers';

export interface ProPriceChange {
  priceArs: number;
  previousPriceArs: number;
  changedBy: string;
  createdAt: string;
}

/** Cobra a una persona a su monto actual: cuántas suscripciones vivas hay por monto. */
export interface ProPriceInUse {
  amountArs: number;
  subscriptions: number;
}

/**
 * Precio mensual de PRO administrable (panel admin). El precio vigente lo lee
 * `proMonthlyPrice` (única fuente). Un cambio rige para suscripciones NUEVAS: el
 * monto de cada preapproval ya creado queda como está en Mercado Pago y en
 * `billing_subscriptions`, así nadie paga distinto de lo que aceptó.
 */
@Injectable()
export class ProPricingService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  async overview() {
    const [price, history, inUse] = await Promise.all([
      proMonthlyPrice(this.dataSource, this.config),
      this.history(),
      this.inUse(),
    ]);
    const offer = introOffer(this.config);
    return {
      monthlyPriceArs: price,
      /** ADMIN = lo fijó el panel; CONFIG = sigue el default de `PRO_MONTHLY_PRICE_ARS`. */
      source: history.length ? ('ADMIN' as const) : ('CONFIG' as const),
      defaultPriceArs: defaultProMonthlyPrice(this.config),
      /** Piso: Mercado Pago no cobra menos de $15, tampoco con la oferta de bienvenida. */
      minPriceArs: minProMonthlyPrice(this.config),
      introOffer: offer
        ? {
            code: offer.code,
            discountPercent: offer.discountPercent,
            cycles: offer.cycles,
            discountedPriceArs: offerPricing(offer, price).discountedPriceArs,
          }
        : null,
      /** El cobro real depende de `BILLING_PROVIDER`: con `none` el precio solo se muestra. */
      selfServe: this.config.get<string>('BILLING_PROVIDER', 'none') !== 'none',
      history,
      inUse,
    };
  }

  async change(priceArs: number, changedBy: string): Promise<ProPriceChange> {
    const min = minProMonthlyPrice(this.config);
    if (priceArs < min) {
      throw new AppException(
        ErrorCode.PRO_PRICE_TOO_LOW,
        `El precio mínimo es $ ${min.toLocaleString('es-AR')}: Mercado Pago no cobra menos de $ 15, tampoco con la oferta de bienvenida.`,
        HttpStatus.BAD_REQUEST,
        { minPriceArs: min },
      );
    }
    return this.dataSource.transaction(async (m) => {
      // Un cambio a la vez: `previous_price_ars` siempre es el vigente real.
      await m.query(`SELECT pg_advisory_xact_lock(hashtext('pro_price_changes'))`);
      const previous = await proMonthlyPrice(m, this.config);
      if (previous === priceArs) {
        throw AppException.conflict(ErrorCode.PRO_PRICE_UNCHANGED, 'Ese ya es el precio vigente');
      }
      const rows = await m.query<{ created_at: Date }[]>(
        `INSERT INTO pro_price_changes (price_ars, previous_price_ars, changed_by)
         VALUES ($1, $2, $3) RETURNING created_at`,
        [priceArs, previous, changedBy.slice(0, 80)],
      );
      return {
        priceArs,
        previousPriceArs: previous,
        changedBy,
        createdAt: new Date(rows[0].created_at).toISOString(),
      };
    });
  }

  private async history(): Promise<ProPriceChange[]> {
    const rows = await this.dataSource.query<
      { price_ars: number; previous_price_ars: number; changed_by: string; created_at: Date }[]
    >(`SELECT price_ars, previous_price_ars, changed_by, created_at FROM pro_price_changes ORDER BY id DESC LIMIT 20`);
    return rows.map((r) => ({
      priceArs: Number(r.price_ars),
      previousPriceArs: Number(r.previous_price_ars),
      changedBy: r.changed_by,
      createdAt: new Date(r.created_at).toISOString(),
    }));
  }

  private async inUse(): Promise<ProPriceInUse[]> {
    const rows = await this.dataSource.query<{ amount: string; n: string }[]>(
      `SELECT current_amount AS amount, count(*) AS n
         FROM billing_subscriptions
        WHERE status IN ('ACTIVE', 'PAST_DUE')
        GROUP BY current_amount ORDER BY current_amount`,
    );
    return rows.map((r) => ({ amountArs: Number(r.amount), subscriptions: Number(r.n) }));
  }
}
