import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/auth/public.decorator';
import { PRO_FEATURE_FLAGS } from './plan';

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
      '{ free: { monthlyQuoteLimit | null }, pro: { monthlyPriceArs | null, selfServe: false, features } }',
  })
  get() {
    const limit = this.config.get<number>('FREE_MONTHLY_QUOTE_LIMIT', 0);
    return {
      free: { monthlyQuoteLimit: limit > 0 ? limit : null },
      pro: {
        /** null = precio a confirmar. Solo informativo: todavía no hay cobro. */
        monthlyPriceArs: this.config.get<number>('PRO_MONTHLY_PRICE_ARS') ?? null,
        /** false = no se puede contratar desde la app (se activa manualmente). */
        selfServe: false,
        /** Funcionalidades en desarrollo (false = no se muestran como disponibles). */
        features: { ...PRO_FEATURE_FLAGS },
      },
    };
  }
}
