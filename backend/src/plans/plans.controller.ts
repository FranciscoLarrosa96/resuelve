import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/auth/public.decorator';
import { PRO_FEATURE_FLAGS } from './plan';
import { freeQuoteLimit } from './quote-quota';

/**
 * Condiciones comerciales configurables (sin billing). La página de planes
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
      '{ free: { monthlyQuoteLimit | null }, pro: { monthlyPriceArs, selfServe: false, features } }',
  })
  get() {
    return {
      /** null = sin límite (`FREE_MONTHLY_QUOTE_LIMIT=0`). */
      free: { monthlyQuoteLimit: freeQuoteLimit(this.config) },
      pro: {
        /** Precio real (`PRO_MONTHLY_PRICE_ARS`, default 19000). Todavía sin cobro online. */
        monthlyPriceArs: this.config.get<number>('PRO_MONTHLY_PRICE_ARS', 19000),
        /** false = no se puede contratar desde la app (se activa manualmente). */
        selfServe: false,
        /** Funcionalidades en desarrollo (false = no se muestran como disponibles). */
        features: { ...PRO_FEATURE_FLAGS },
      },
    };
  }
}
