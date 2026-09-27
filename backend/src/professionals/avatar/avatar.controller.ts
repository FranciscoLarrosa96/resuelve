import { Body, Controller, Delete, Post, Put, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentProfessional, ProfessionalGuard } from '../../common/auth/professional.guard';
import { SetAvatarDto } from '../dto/professional.dto';
import { ProfessionalProfile } from '../professional-profile.entity';
import { ProfessionalAvatarService } from './avatar.service';

/** Mismo límite que las subidas de matrícula: corta el spam sin trabar un reintento. */
const UPLOAD_LIMIT = Number(process.env.THROTTLE_VERIFICATION_LIMIT ?? 10);

@ApiTags('pro')
@ApiBearerAuth()
@UseGuards(ProfessionalGuard)
@Controller('pro/profile/avatar')
export class ProfessionalAvatarController {
  constructor(private readonly avatars: ProfessionalAvatarService) {}

  /** Firma temporal para subir la foto directo a Cloudinary (el archivo no pasa por la API). */
  @Post('upload')
  @Throttle({ default: { limit: UPLOAD_LIMIT, ttl: 60_000 } })
  @ApiOkResponse({ description: '{ uploadUrl, fields, publicId, allowedFormats, maxBytes, expiresAt }' })
  @ApiServiceUnavailableResponse({ description: 'UPLOADS_NOT_CONFIGURED' })
  upload(@CurrentProfessional() profile: ProfessionalProfile) {
    return this.avatars.uploadTicket(profile);
  }

  /** Confirma la foto subida (reemplaza la anterior). Devuelve el perfil propio (`/pro/me`). */
  @Put()
  @Throttle({ default: { limit: UPLOAD_LIMIT, ttl: 60_000 } })
  @ApiNotFoundResponse({ description: 'Foto inexistente o de otra carpeta' })
  @ApiUnprocessableEntityResponse({ description: 'INVALID_IMAGE (formato o peso real)' })
  set(@CurrentProfessional() profile: ProfessionalProfile, @Body() dto: SetAvatarDto) {
    return this.avatars.set(profile, dto.publicId);
  }

  /** Elimina la foto: vuelven las iniciales. */
  @Delete()
  remove(@CurrentProfessional() profile: ProfessionalProfile) {
    return this.avatars.remove(profile);
  }
}
