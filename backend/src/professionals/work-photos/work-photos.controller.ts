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
import {
  AddWorkPhotoDto,
  CreateWorkDto,
  MoveWorkPhotoDto,
  ReorderWorkPhotosDto,
  SignWorkPhotoDto,
  UpdateWorkDto,
  UpdateWorkPhotoDto,
} from './work-photo.dto';
import { WorkPhotosService } from './work-photos.service';

/** Mismo límite que las otras subidas: corta el spam sin trabar un reintento. */
const UPLOAD_LIMIT = Number(process.env.THROTTLE_VERIFICATION_LIMIT ?? 10);

const LIST_DESCRIPTION =
  '{ items: [{ id, title, description, doneOn, archivedByPlan, photos: [{ id, url, caption, sortOrder, archivedByPlan }] }], maxWorks, activeWorks, maxStoredWorks, photosPerWork, activePhotos, maxBytes }';

/**
 * "Trabajos realizados" del profesional logueado: trabajos (Free 0 / PRO 30)
 * con hasta 5 fotos cada uno. Toda respuesta es la lista completa.
 */
@ApiTags('pro')
@ApiBearerAuth()
@UseGuards(ProfessionalGuard)
@Controller('pro/profile/works')
export class WorksController {
  constructor(private readonly works: WorkPhotosService) {}

  @Get()
  @ApiOkResponse({ description: LIST_DESCRIPTION })
  list(@CurrentProfessional() profile: ProfessionalProfile) {
    return this.works.list(profile);
  }

  @Post()
  @ApiConflictResponse({ description: 'WORKS_LIMIT_REACHED (Free 0 / PRO 30 trabajos activos)' })
  @ApiUnprocessableEntityResponse({ description: 'INVALID_WORK (nombre, descripción o fecha)' })
  create(@CurrentProfessional() profile: ProfessionalProfile, @Body() dto: CreateWorkDto) {
    return this.works.createWork(profile, dto);
  }

  @Patch(':id')
  @ApiForbiddenResponse({ description: 'El trabajo es de otro perfil' })
  @ApiUnprocessableEntityResponse({ description: 'INVALID_WORK' })
  update(@CurrentProfessional() profile: ProfessionalProfile, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateWorkDto) {
    return this.works.updateWork(profile, id, dto);
  }

  /** Vuelve a mostrar un trabajo archivado por plan (en Free reemplaza al que se muestra). */
  @Patch(':id/restore')
  restore(@CurrentProfessional() profile: ProfessionalProfile, @Param('id', ParseUUIDPipe) id: string) {
    return this.works.restoreWork(profile, id);
  }

  /** Borra el trabajo y sus fotos (Cloudinary + base). */
  @Delete(':id')
  @ApiForbiddenResponse({ description: 'El trabajo es de otro perfil' })
  @ApiBadGatewayResponse({ description: 'WORK_PHOTO_DELETE_FAILED (Cloudinary no respondió; lo que falta sigue)' })
  remove(@CurrentProfessional() profile: ProfessionalProfile, @Param('id', ParseUUIDPipe) id: string) {
    return this.works.removeWork(profile, id);
  }
}

/** Fotos de un trabajo. Toda respuesta es la lista completa de trabajos. */
@ApiTags('pro')
@ApiBearerAuth()
@UseGuards(ProfessionalGuard)
@Controller('pro/profile/work-photos')
export class WorkPhotosController {
  constructor(private readonly works: WorkPhotosService) {}

  /** Firma temporal para subir directo a Cloudinary (resuelve/professional-work/<id>/…). */
  @Post('sign')
  @Throttle({ default: { limit: UPLOAD_LIMIT, ttl: 60_000 } })
  @ApiOkResponse({ description: '{ uploadUrl, fields, publicId, allowedFormats, maxBytes, expiresAt }' })
  @ApiConflictResponse({ description: 'WORK_PHOTOS_LIMIT_REACHED (el trabajo ya tiene 5 fotos o está archivado)' })
  @ApiServiceUnavailableResponse({ description: 'UPLOADS_NOT_CONFIGURED' })
  sign(@CurrentProfessional() profile: ProfessionalProfile, @Body() dto: SignWorkPhotoDto) {
    return this.works.uploadTicket(profile, dto.workId);
  }

  /** Confirma la foto subida (formato y peso reales) y la agrega al final del trabajo. */
  @Post()
  @Throttle({ default: { limit: UPLOAD_LIMIT, ttl: 60_000 } })
  @ApiOkResponse({ description: LIST_DESCRIPTION })
  @ApiConflictResponse({ description: 'WORK_PHOTOS_LIMIT_REACHED' })
  @ApiNotFoundResponse({ description: 'Foto inexistente o de otra carpeta' })
  @ApiUnprocessableEntityResponse({ description: 'INVALID_IMAGE · INVALID_CAPTION' })
  add(@CurrentProfessional() profile: ProfessionalProfile, @Body() dto: AddWorkPhotoDto) {
    return this.works.addPhoto(profile, dto.workId, dto.publicId, dto.caption);
  }

  /** Nuevo orden de las fotos de un trabajo (todas, una vez cada una; la primera es la portada). */
  @Put('order')
  @ApiUnprocessableEntityResponse({ description: 'INVALID_WORK_PHOTO_ORDER' })
  reorder(@CurrentProfessional() profile: ProfessionalProfile, @Body() dto: ReorderWorkPhotosDto) {
    return this.works.reorder(profile, dto.workId, dto.ids);
  }

  @Patch(':id')
  @ApiForbiddenResponse({ description: 'La foto es de otro perfil' })
  @ApiUnprocessableEntityResponse({ description: 'INVALID_CAPTION' })
  update(
    @CurrentProfessional() profile: ProfessionalProfile,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWorkPhotoDto,
  ) {
    return this.works.updateCaption(profile, id, dto.caption);
  }

  /** Pasa la foto a otro trabajo (activo y con lugar). */
  @Patch(':id/move')
  @ApiConflictResponse({ description: 'WORK_PHOTOS_LIMIT_REACHED' })
  move(@CurrentProfessional() profile: ProfessionalProfile, @Param('id', ParseUUIDPipe) id: string, @Body() dto: MoveWorkPhotoDto) {
    return this.works.movePhoto(profile, id, dto.workId);
  }

  /** Reactiva una foto archivada por plan (el backend vuelve a revisar el lugar del trabajo). */
  @Patch(':id/restore')
  @ApiConflictResponse({ description: 'WORK_PHOTOS_LIMIT_REACHED' })
  restore(@CurrentProfessional() profile: ProfessionalProfile, @Param('id', ParseUUIDPipe) id: string) {
    return this.works.restorePhoto(profile, id);
  }

  /** Borra la foto (Cloudinary + base). */
  @Delete(':id')
  @ApiForbiddenResponse({ description: 'La foto es de otro perfil' })
  @ApiBadGatewayResponse({ description: 'WORK_PHOTO_DELETE_FAILED (Cloudinary no respondió; la foto sigue)' })
  remove(@CurrentProfessional() profile: ProfessionalProfile, @Param('id', ParseUUIDPipe) id: string) {
    return this.works.removePhoto(profile, id);
  }
}
