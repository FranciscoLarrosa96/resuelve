import { Body, Controller, Get, HttpCode, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiConflictResponse, ApiExcludeController } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AdminGuard } from '../common/auth/admin.guard';
import type { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { ProPricingService } from '../plans/pro-pricing.service';
import { SetProPriceDto } from './admin.dto';

const ADMIN_WRITE_LIMIT = Number(process.env.THROTTLE_ADMIN_LIMIT ?? 30);

/**
 * Precio mensual de Resuelve PRO. Solo `is_admin` (AdminGuard: 404 para el resto).
 * Rige para suscripciones nuevas; las existentes conservan su monto.
 */
@ApiExcludeController()
@ApiBearerAuth()
@UseGuards(AdminGuard)
@Controller('admin/pricing')
export class AdminPricingController {
  constructor(private readonly pricing: ProPricingService) {}

  @Get()
  overview() {
    return this.pricing.overview();
  }

  @Put()
  @HttpCode(200)
  @Throttle({ default: { limit: ADMIN_WRITE_LIMIT, ttl: 60_000 } })
  @ApiConflictResponse({ description: 'PRO_PRICE_UNCHANGED' })
  async set(@Body() dto: SetProPriceDto, @CurrentUser() user: AuthUser) {
    await this.pricing.change(dto.monthlyPriceArs, user.email);
    return this.pricing.overview();
  }
}
