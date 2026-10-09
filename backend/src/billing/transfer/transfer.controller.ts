import { Body, Controller, Delete, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentProfessional, ProfessionalGuard } from '../../common/auth/professional.guard';
import type { ProfessionalProfile } from '../../professionals/professional-profile.entity';
import { TransferRequestDto, TransferSubmitDto, TransferWithdrawDto } from './transfer.dto';
import { TransferService } from './transfer.service';

const BILLING_WRITE_LIMIT = Number(process.env.THROTTLE_BILLING_LIMIT ?? 6);

/**
 * Resuelve PRO por transferencia, del lado del propio profesional. Todas las
 * respuestas devuelven el mismo cuerpo que GET (estado completo).
 */
@ApiTags('billing')
@ApiBearerAuth()
@UseGuards(ProfessionalGuard)
@Controller('billing/transfer')
export class TransferController {
  constructor(private readonly transfers: TransferService) {}

  @Get()
  @ApiOkResponse({
    description:
      '{ available, account, blocked, options[{ months, days, amountArs, basePriceArs, discountedFirstMonthArs, offerCode }], pending, last, proUntil, withdrawal, refundPending, proofUploads }',
  })
  overview(@CurrentProfessional() profile: ProfessionalProfile) {
    return this.transfers.overview(profile.id);
  }

  @Post()
  @HttpCode(200)
  @Throttle({ default: { limit: BILLING_WRITE_LIMIT, ttl: 60_000 } })
  @ApiOkResponse({ description: 'Pedido con código y monto. 409 TRANSFER_BLOCKED | TRANSFER_IN_REVIEW · 503 TRANSFER_NOT_AVAILABLE' })
  request(@CurrentProfessional() profile: ProfessionalProfile, @Body() dto: TransferRequestDto) {
    return this.transfers.request(profile.id, dto.months);
  }

  @Delete('pending')
  @HttpCode(200)
  @ApiOkResponse({ description: '409 TRANSFER_NO_PENDING | TRANSFER_IN_REVIEW' })
  cancel(@CurrentProfessional() profile: ProfessionalProfile) {
    return this.transfers.cancel(profile.id);
  }

  @Post('proof/upload')
  @HttpCode(200)
  @Throttle({ default: { limit: BILLING_WRITE_LIMIT, ttl: 60_000 } })
  @ApiOkResponse({ description: '{ uploadUrl, fields, publicId, allowedFormats, maxBytes, expiresAt } · 503 UPLOADS_NOT_CONFIGURED' })
  uploadTicket(@CurrentProfessional() profile: ProfessionalProfile) {
    return this.transfers.uploadTicket(profile.id);
  }

  @Post('submit')
  @HttpCode(200)
  @Throttle({ default: { limit: BILLING_WRITE_LIMIT, ttl: 60_000 } })
  @ApiOkResponse({ description: '"Ya transferí" (comprobante opcional). 409 TRANSFER_NO_PENDING · 422 INVALID_DOCUMENT' })
  submit(@CurrentProfessional() profile: ProfessionalProfile, @Body() dto: TransferSubmitDto) {
    return this.transfers.submit(profile.id, dto.proofPublicId);
  }

  @Post('withdraw')
  @HttpCode(200)
  @Throttle({ default: { limit: BILLING_WRITE_LIMIT, ttl: 60_000 } })
  @ApiOkResponse({ description: 'Botón de arrepentimiento: quita PRO y deja pendiente la devolución. 409 TRANSFER_WITHDRAWAL_EXPIRED' })
  withdraw(@CurrentProfessional() profile: ProfessionalProfile, @Body() dto: TransferWithdrawDto) {
    return this.transfers.withdraw(profile.id, dto.refundTo);
  }
}
