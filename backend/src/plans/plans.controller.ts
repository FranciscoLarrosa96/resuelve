import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentProfessional, ProfessionalGuard } from '../common/auth/professional.guard';
import { Public } from '../common/auth/public.decorator';
import type { ProfessionalProfile } from '../professionals/professional-profile.entity';
import { ProOfferEventDto } from './dto/pro-offer.dto';
import { PRO_FEATURE_FLAGS } from './plan';
import { introOffer, offerPricing, proMonthlyPrice } from './pro-offers';
import { ProOffersService } from './pro-offers.service';
import { freeQuoteLimit } from './quote-quota';

/**
 * Condiciones comerciales configurables. La página de planes
 * las lee de acá: nada de precios, pruebas ni límites escritos a mano en el frontend.
 */
@ApiTags('plans')
@Controller('plans')
export class PlansController {
  constructor(private readonly config: ConfigService) {}

  @Public()
  @Get()
  @ApiOkResponse({
    description:
      '{ free: { monthlyQuoteLimit | null }, pro: { monthlyPriceArs, selfServe, features }, introOffer | null }',
  })
  get() {
    const price = proMonthlyPrice(this.config);
    const offer = introOffer(this.config);
    return {
      /** null = sin límite (`FREE_MONTHLY_QUOTE_LIMIT=0`). */
      free: { monthlyQuoteLimit: freeQuoteLimit(this.config) },
      pro: {
        /** Precio real (`PRO_MONTHLY_PRICE_ARS`, default 15000). */
        monthlyPriceArs: price,
        /** true = se contrata online con Mercado Pago (`BILLING_PROVIDER`); false = solo activación manual. */
        selfServe: this.config.get<string>('BILLING_PROVIDER', 'none') !== 'none',
        /** Funcionalidades en desarrollo (false = no se muestran como disponibles). */
        features: { ...PRO_FEATURE_FLAGS },
      },
      /**
       * Oferta de bienvenida configurada (null = apagada). Es la condición
       * general: si UN profesional puede usarla lo dice `/pro/me` → `proIntroOffer`.
       */
      introOffer: offer
        ? (() => {
            const p = offerPricing(offer, price);
            return {
              code: offer.code,
              discountPercent: p.discountPercent,
              cycles: p.cycles,
              discountedPriceArs: p.discountedPriceArs,
            };
          })()
        : null,
    };
  }
}

@ApiTags('pro')
@ApiBearerAuth()
@Controller('pro/plan')
export class ProPlanController {
  constructor(private readonly offers: ProOffersService) {}

  /**
   * Embudo de la oferta: SHOWN / CLICKED por superficie (REQUESTS_USAGE,
   * LIMIT_MODAL, PLAN_PAGE). Deduplicado por día; se descarta si hoy no es
   * elegible. REDEEMED no se acepta: lo escribe el servidor al usarla.
   */
  @UseGuards(ProfessionalGuard)
  @Post('offer-events')
  @HttpCode(200)
  @ApiOkResponse({ description: '{ recorded: boolean }' })
  offerEvent(@CurrentProfessional() profile: ProfessionalProfile, @Body() dto: ProOfferEventDto) {
    return this.offers.recordEvent(profile, dto);
  }
}
