import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeController } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AdminGuard } from '../../common/auth/admin.guard';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import {
  AdminTransferApproveDto,
  AdminTransferRecordDto,
  AdminTransferRejectDto,
  AdminTransfersQueryDto,
  TransferAccountDto,
} from './transfer.dto';
import { TransferService } from './transfer.service';

const ADMIN_WRITE_LIMIT = Number(process.env.THROTTLE_ADMIN_LIMIT ?? 30);

/**
 * Pagos de PRO por transferencia: revisar, confirmar o rechazar, marcar
 * devoluciones, anotar un pago recibido por fuera y cargar los datos
 * bancarios. Solo `is_admin` (AdminGuard: 404 para el resto).
 */
@ApiExcludeController()
@ApiBearerAuth()
@UseGuards(AdminGuard)
@Controller('admin')
export class AdminTransfersController {
  constructor(private readonly transfers: TransferService) {}

  @Get('transfers')
  list(@Query() query: AdminTransfersQueryDto) {
    return this.transfers.adminList(query.status);
  }

  @Get('transfers/:id')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.transfers.adminDetail(id);
  }

  @Post('transfers/:id/approve')
  @HttpCode(200)
  @Throttle({ default: { limit: ADMIN_WRITE_LIMIT, ttl: 60_000 } })
  approve(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AdminTransferApproveDto, @CurrentUser() admin: AuthUser) {
    return this.transfers.approve(id, admin.userId, dto.note);
  }

  @Post('transfers/:id/reject')
  @HttpCode(200)
  @Throttle({ default: { limit: ADMIN_WRITE_LIMIT, ttl: 60_000 } })
  reject(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AdminTransferRejectDto, @CurrentUser() admin: AuthUser) {
    return this.transfers.reject(id, admin.userId, dto.reason);
  }

  @Post('transfers/:id/refunded')
  @HttpCode(200)
  @Throttle({ default: { limit: ADMIN_WRITE_LIMIT, ttl: 60_000 } })
  refunded(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() admin: AuthUser) {
    return this.transfers.markRefunded(id, admin.userId);
  }

  /** Anota un pago por transferencia recibido por fuera (desde la ficha del usuario). */
  @Post('users/:id/plan/transfer')
  @HttpCode(200)
  @Throttle({ default: { limit: ADMIN_WRITE_LIMIT, ttl: 60_000 } })
  async record(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminTransferRecordDto,
    @CurrentUser() admin: AuthUser,
  ) {
    await this.transfers.record(id, admin.userId, dto.months, dto.amountArs, dto.note);
    return { ok: true };
  }

  @Get('transfer-account')
  account() {
    return this.transfers.account();
  }

  @Put('transfer-account')
  @HttpCode(200)
  @Throttle({ default: { limit: ADMIN_WRITE_LIMIT, ttl: 60_000 } })
  setAccount(@Body() dto: TransferAccountDto, @CurrentUser() admin: AuthUser) {
    return this.transfers.setAccount(
      { enabled: dto.enabled, holder: dto.holder, alias: dto.alias, cbu: dto.cbu ?? null, bank: dto.bank ?? null, cuit: dto.cuit ?? null },
      admin.email,
    );
  }
}
