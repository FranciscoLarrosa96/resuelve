import { Body, Controller, Delete, Post, Put, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentProfessional, ProfessionalGuard } from '../../common/auth/professional.guard';
import { SetCoverDto } from '../dto/professional.dto';
import { ProfessionalProfile } from '../professional-profile.entity';
import { ProfessionalCoverService } from './cover.service';

const UPLOAD_LIMIT = Number(process.env.THROTTLE_VERIFICATION_LIMIT ?? 10);

@ApiTags('pro')
@ApiBearerAuth()
@UseGuards(ProfessionalGuard)
@Controller('pro/profile/cover')
export class ProfessionalCoverController {
  constructor(private readonly covers: ProfessionalCoverService) {}

  /** Firma temporal para subir la portada directo a Cloudinary. Solo PRO vigente. */
  @Post('upload')
  @Throttle({ default: { limit: UPLOAD_LIMIT, ttl: 60_000 } })
  @ApiOkResponse({ description: '{ uploadUrl, fields, publicId, allowedFormats, maxBytes, expiresAt }' })
  @ApiForbiddenResponse({ description: 'PRO_REQUIRED' })
  @ApiServiceUnavailableResponse({ description: 'UPLOADS_NOT_CONFIGURED' })
  upload(@CurrentProfessional() profile: ProfessionalProfile) {
    return this.covers.uploadTicket(profile);
  }

  /** Confirma la portada subida (reemplaza la anterior). Devuelve el perfil propio (`/pro/me`). */
  @Put()
  @Throttle({ default: { limit: UPLOAD_LIMIT, ttl: 60_000 } })
  @ApiForbiddenResponse({ description: 'PRO_REQUIRED' })
  @ApiNotFoundResponse({ description: 'Foto inexistente o de otra carpeta' })
  @ApiUnprocessableEntityResponse({ description: 'INVALID_IMAGE (formato o peso real)' })
  set(@CurrentProfessional() profile: ProfessionalProfile, @Body() dto: SetCoverDto) {
    return this.covers.set(profile, dto.publicId);
  }

  /** Quita la portada (también sin PRO). */
  @Delete()
  remove(@CurrentProfessional() profile: ProfessionalProfile) {
    return this.covers.remove(profile);
  }
}
