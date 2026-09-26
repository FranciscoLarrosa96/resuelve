import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiConflictResponse, ApiExcludeController } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AdminGuard } from '../common/auth/admin.guard';
import type { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { VerificationReviewService } from '../verifications/verification-review.service';
import { AdminVerificationsQueryDto, ApproveVerificationDto, RejectVerificationDto } from './admin.dto';

/** Decisiones por minuto: sobra para revisar de corrido y corta un script desbocado. */
const ADMIN_WRITE_LIMIT = Number(process.env.THROTTLE_ADMIN_LIMIT ?? 30);

/**
 * Panel de matrículas. Solo usuarios con `is_admin` (AdminGuard: 404 para el
 * resto). No figura en Swagger. Misma lógica que `npm run verification:review`.
 */
@ApiExcludeController()
@ApiBearerAuth()
@UseGuards(AdminGuard)
@Controller('admin/verifications')
export class AdminVerificationsController {
  constructor(private readonly review: VerificationReviewService) {}

  @Get()
  async list(@Query() query: AdminVerificationsQueryDto) {
    if ((query.status ?? 'pending') === 'pending') {
      const items = await this.review.listPending();
      return { items, pendingCount: items.length };
    }
    const [items, pendingCount] = await Promise.all([this.review.listReviewed(), this.review.countPending()]);
    return { items, pendingCount };
  }

  /** Incluye un link firmado al documento (vence en 10 min) si el profesional subió uno. */
  @Get(':id')
  show(@Param('id', ParseUUIDPipe) id: string) {
    return this.review.show(id);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @Throttle({ default: { limit: ADMIN_WRITE_LIMIT, ttl: 60_000 } })
  @ApiConflictResponse({ description: 'VERIFICATION_ALREADY_REVIEWED' })
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveVerificationDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.review.approve(
      id,
      user.email,
      dto.expiresAt ? { expiresAt: endOfArgentineDay(dto.expiresAt) } : {},
    );
  }

  @Post(':id/reject')
  @HttpCode(200)
  @Throttle({ default: { limit: ADMIN_WRITE_LIMIT, ttl: 60_000 } })
  @ApiConflictResponse({ description: 'VERIFICATION_ALREADY_REVIEWED' })
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectVerificationDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.review.reject(id, user.email, dto.reason);
  }

  /** Borra el archivo privado de una verificación ya decidida (la metadata queda). */
  @Post(':id/purge-document')
  @HttpCode(200)
  @Throttle({ default: { limit: ADMIN_WRITE_LIMIT, ttl: 60_000 } })
  purge(@Param('id', ParseUUIDPipe) id: string) {
    return this.review.purgeDocument(id);
  }
}

/** "2027-12-31" → vigente hasta el final de ese día en Argentina (igual que el CLI). */
export function endOfArgentineDay(isoDate: string): Date {
  return new Date(`${isoDate.slice(0, 10)}T23:59:59-03:00`);
}
