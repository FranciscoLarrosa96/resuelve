import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentProfessional, ProfessionalGuard } from '../common/auth/professional.guard';
import { RequestVerificationDto, UploadTicketDto } from '../professionals/dto/professional.dto';
import { ProfessionalProfile } from '../professionals/professional-profile.entity';
import { VerificationsService } from './verifications.service';

/** Envíos por minuto (firma + confirmación): corta el spam sin trabar una corrección. */
const VERIFICATION_LIMIT = Number(process.env.THROTTLE_VERIFICATION_LIMIT ?? 10);

@ApiTags('pro')
@ApiBearerAuth()
@UseGuards(ProfessionalGuard)
@Controller('pro/verifications')
export class VerificationsController {
  constructor(private readonly service: VerificationsService) {}

  /** Firma temporal para subir el documento directo al almacenamiento privado (el archivo no pasa por la API). */
  @Post('upload')
  @Throttle({ default: { limit: VERIFICATION_LIMIT, ttl: 60_000 } })
  @ApiOkResponse({ description: '{ uploadUrl, fields, publicId, allowedFormats, maxBytes, expiresAt }' })
  @ApiConflictResponse({ description: 'VERIFICATION_ALREADY_ACTIVE' })
  @ApiServiceUnavailableResponse({ description: 'UPLOADS_NOT_CONFIGURED' })
  upload(@CurrentProfessional() profile: ProfessionalProfile, @Body() dto: UploadTicketDto) {
    return this.service.uploadTicket(profile, dto.serviceId);
  }

  /**
   * Envía (o reenvía después de un rechazo/vencimiento) una verificación. Queda
   * PENDING: la aprueba o rechaza un revisor con `npm run verification:review`.
   */
  @Post()
  @Throttle({ default: { limit: VERIFICATION_LIMIT, ttl: 60_000 } })
  @ApiConflictResponse({ description: 'VERIFICATION_ALREADY_ACTIVE' })
  @ApiNotFoundResponse({ description: 'Documento inexistente o ajeno' })
  @ApiUnprocessableEntityResponse({ description: 'VALIDATION_ERROR · INVALID_DOCUMENT' })
  submit(@CurrentProfessional() profile: ProfessionalProfile, @Body() dto: RequestVerificationDto) {
    return this.service.submit(profile, dto);
  }
}
