import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { CurrentProfessional, ProfessionalGuard } from '../common/auth/professional.guard';
import type { ProfessionalProfile } from '../professionals/professional-profile.entity';
import { BillingService } from './billing.service';
import { BillingCheckoutDto } from './dto/checkout.dto';

/** Crear o cancelar suscripciones cuesta llamadas al proveedor: límite propio. */
const BILLING_WRITE_LIMIT = Number(process.env.THROTTLE_BILLING_LIMIT ?? 6);

/**
 * Resuelve PRO pago (Mercado Pago). Solo el propio profesional; no exige
 * email verificado. Nunca expone credenciales: solo la URL de checkout.
 */
@ApiTags('billing')
@ApiBearerAuth()
@UseGuards(ProfessionalGuard)
@Controller('billing/pro')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Post('checkout')
  @HttpCode(200)
  @Throttle({ default: { limit: BILLING_WRITE_LIMIT, ttl: 60_000 } })
  @ApiOkResponse({
    description:
      '{ checkoutUrl (init_point de Mercado Pago), subscriptionId }. 409 BILLING_ALREADY_SUBSCRIBED | BILLING_MANUAL_PRO_ACTIVE · 502 BILLING_PROVIDER_ERROR · 503 BILLING_NOT_CONFIGURED',
  })
  checkout(
    @CurrentProfessional() profile: ProfessionalProfile,
    @CurrentUser() user: AuthUser,
    @Body() dto: BillingCheckoutDto,
  ) {
    return this.billing.checkout(profile, user.userId, dto.returnTo);
  }

  @Get('status')
  @ApiOkResponse({
    description:
      '{ enabled, plan, source, entitlements, subscription | null, canCheckout, checkoutPrice | null, hadSubscription }',
  })
  status(@CurrentProfessional() profile: ProfessionalProfile) {
    return this.billing.status(profile);
  }

  @Post('cancel')
  @HttpCode(200)
  @Throttle({ default: { limit: BILLING_WRITE_LIMIT, ttl: 60_000 } })
  @ApiOkResponse({ description: 'Mismo cuerpo que GET status, ya cancelada. 409 BILLING_NO_SUBSCRIPTION' })
  cancel(@CurrentProfessional() profile: ProfessionalProfile) {
    return this.billing.cancel(profile);
  }
}
