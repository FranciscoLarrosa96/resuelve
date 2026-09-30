import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, UseGuards } from '@nestjs/common';
import {
  ApiBadGatewayResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentProfessional, ProfessionalGuard } from '../../common/auth/professional.guard';
import { ProfessionalProfile } from '../professional-profile.entity';
import { AddWorkPhotoDto, ReorderWorkPhotosDto, SetWorkPhotoFeaturedDto, UpdateWorkPhotoDto } from './work-photo.dto';
import { WorkPhotosService } from './work-photos.service';

/** Mismo límite que las otras subidas: corta el spam sin trabar un reintento. */
const UPLOAD_LIMIT = Number(process.env.THROTTLE_VERIFICATION_LIMIT ?? 10);

/**
 * "Trabajos realizados" del profesional logueado (5 FREE / 20 PRO activas).
 * Las respuestas privadas devuelven `{ items, max, activeCount, maxStored, maxBytes }`.
 */
@ApiTags('pro')
@ApiBearerAuth()
@UseGuards(ProfessionalGuard)
@Controller('pro/profile/work-photos')
export class WorkPhotosController {
  constructor(private readonly photos: WorkPhotosService) {}

  @Get()
  @ApiOkResponse({ description: '{ items: [{ id, url, caption, sortOrder, archivedByPlan, featured }], max, activeCount, maxStored, maxBytes }' })
  list(@CurrentProfessional() profile: ProfessionalProfile) {
    return this.photos.list(profile);
  }

  /** Firma temporal para subir directo a Cloudinary (resuelve/professional-work/<id>/…). */
  @Post('sign')
  @Throttle({ default: { limit: UPLOAD_LIMIT, ttl: 60_000 } })
  @ApiOkResponse({ description: '{ uploadUrl, fields, publicId, allowedFormats, maxBytes, expiresAt }' })
  @ApiConflictResponse({ description: 'WORK_PHOTOS_LIMIT_REACHED (límite activo Free 5 / PRO 20)' })
  @ApiServiceUnavailableResponse({ description: 'UPLOADS_NOT_CONFIGURED' })
  sign(@CurrentProfessional() profile: ProfessionalProfile) {
    return this.photos.uploadTicket(profile);
  }

  /** Confirma la foto subida (formato y peso reales) y la agrega al final. */
  @Post()
  @Throttle({ default: { limit: UPLOAD_LIMIT, ttl: 60_000 } })
  @ApiConflictResponse({ description: 'WORK_PHOTOS_LIMIT_REACHED' })
  @ApiNotFoundResponse({ description: 'Foto inexistente o de otra carpeta' })
  @ApiUnprocessableEntityResponse({ description: 'INVALID_IMAGE · INVALID_CAPTION' })
  add(@CurrentProfessional() profile: ProfessionalProfile, @Body() dto: AddWorkPhotoDto) {
    return this.photos.add(profile, dto.publicId, dto.caption);
  }

  /** Nuevo orden (todas las fotos, una vez cada una). */
  @Put('order')
  @ApiUnprocessableEntityResponse({ description: 'INVALID_WORK_PHOTO_ORDER' })
  reorder(@CurrentProfessional() profile: ProfessionalProfile, @Body() dto: ReorderWorkPhotosDto) {
    return this.photos.reorder(profile, dto.ids);
  }

  @Patch(':id')
  @ApiForbiddenResponse({ description: 'La foto es de otro perfil' })
  @ApiUnprocessableEntityResponse({ description: 'INVALID_CAPTION' })
  update(
    @CurrentProfessional() profile: ProfessionalProfile,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWorkPhotoDto,
  ) {
    return this.photos.updateCaption(profile, id, dto.caption);
  }

  /** Reactiva una foto archivada de forma reversible (el backend vuelve a revisar el límite). */
  @Patch(':id/restore')
  restore(@CurrentProfessional() profile: ProfessionalProfile, @Param('id', ParseUUIDPipe) id: string) {
    return this.photos.restore(profile, id);
  }

  /** Marca la foto principal del portfolio; solo puede haber una activa. */
  @Patch(':id/featured')
  setFeatured(
    @CurrentProfessional() profile: ProfessionalProfile,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetWorkPhotoFeaturedDto,
  ) {
    return this.photos.setFeatured(profile, id, dto.featured);
  }

  /** Borra la foto (Cloudinary + base). */
  @Delete(':id')
  @ApiForbiddenResponse({ description: 'La foto es de otro perfil' })
  @ApiBadGatewayResponse({ description: 'WORK_PHOTO_DELETE_FAILED (Cloudinary no respondió; la foto sigue)' })
  remove(@CurrentProfessional() profile: ProfessionalProfile, @Param('id', ParseUUIDPipe) id: string) {
    return this.photos.remove(profile, id);
  }
}
