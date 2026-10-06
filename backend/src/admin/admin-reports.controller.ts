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
import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-codes';
import { ReviewModerationService } from '../reviews/review-moderation.service';
import { AdminReportsQueryDto, HideReviewDto } from './admin.dto';

const ADMIN_WRITE_LIMIT = Number(process.env.THROTTLE_ADMIN_LIMIT ?? 30);

/**
 * Panel de reportes de reseñas. Solo `is_admin` (AdminGuard: 404 para el resto).
 * Misma lógica que `npm run reviews:moderation`; ocultar no borra y se puede restaurar.
 */
@ApiExcludeController()
@ApiBearerAuth()
@UseGuards(AdminGuard)
@Controller('admin/reports')
export class AdminReportsController {
  constructor(private readonly moderation: ReviewModerationService) {}

  @Get()
  async list(@Query() query: AdminReportsQueryDto) {
    const open = (query.status ?? 'open') === 'open';
    const [items, openCount] = await Promise.all([
      open ? this.moderation.listOpen() : this.moderation.listResolved(),
      this.moderation.countOpen(),
    ]);
    return { items, openCount };
  }

  @Post(':id/hide')
  @HttpCode(200)
  @Throttle({ default: { limit: ADMIN_WRITE_LIMIT, ttl: 60_000 } })
  @ApiConflictResponse({ description: 'REPORT_ALREADY_RESOLVED' })
  async hide(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: HideReviewDto,
    @CurrentUser() user: AuthUser,
  ) {
    await this.requireOpen(id);
    return this.moderation.hide(id, user.email, dto.reason);
  }

  @Post(':id/dismiss')
  @HttpCode(200)
  @Throttle({ default: { limit: ADMIN_WRITE_LIMIT, ttl: 60_000 } })
  @ApiConflictResponse({ description: 'REPORT_ALREADY_RESOLVED' })
  async dismiss(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    await this.requireOpen(id);
    return this.moderation.dismiss(id, user.email);
  }

  /** Vuelve a mostrar una reseña oculta (y a contarla). */
  @Post('reviews/:reviewId/restore')
  @HttpCode(200)
  @Throttle({ default: { limit: ADMIN_WRITE_LIMIT, ttl: 60_000 } })
  async restore(@Param('reviewId', ParseUUIDPipe) reviewId: string) {
    await this.moderation.restore(reviewId);
    return { restored: true };
  }

  private async requireOpen(id: string): Promise<void> {
    const item = await this.moderation.show(id);
    if (item.status !== 'OPEN') {
      throw AppException.conflict(ErrorCode.REPORT_ALREADY_RESOLVED, 'Este reporte ya fue resuelto');
    }
  }
}
