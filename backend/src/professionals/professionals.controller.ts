import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PaginationQueryDto } from '../common/pagination/pagination';
import type { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { CurrentProfessional, ProfessionalGuard } from '../common/auth/professional.guard';
import { Public } from '../common/auth/public.decorator';
import {
  AvailabilityDto,
  CreateProfessionalProfileDto,
  ProfileStatusDto,
  SearchProfessionalsDto,
  UpdateProfessionalProfileDto,
} from './dto/professional.dto';
import { ProfessionalProfile } from './professional-profile.entity';
import { ProfessionalsService } from './professionals.service';

@ApiTags('professionals')
@Controller('professionals')
export class ProfessionalsController {
  constructor(private readonly service: ProfessionalsService) {}

  @Public()
  @Get()
  @ApiOkResponse({
    description: 'Paginado: { items, page, pageSize, total }. Orden: disponibles hoy, rating, reseñas.',
  })
  search(@Query() query: SearchProfessionalsDto) {
    return this.service.search(query);
  }

  @Public()
  @Get(':id/reviews')
  @ApiOkResponse({
    description: 'Reseñas públicas paginadas, más recientes primero: { items, page, pageSize, total }',
  })
  @ApiNotFoundResponse({ description: 'NOT_FOUND (inexistente o pausado)' })
  reviews(@Param('id', ParseUUIDPipe) id: string, @Query() query: PaginationQueryDto) {
    return this.service.listReviews(id, query);
  }

  @Public()
  @Get(':id')
  @ApiNotFoundResponse({ description: 'NOT_FOUND' })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getPublic(id);
  }
}

@ApiTags('pro')
@ApiBearerAuth()
@Controller('pro')
export class ProProfileController {
  constructor(private readonly service: ProfessionalsService) {}

  /** "Modo profesional": crea el perfil para el usuario actual (misma cuenta). */
  @Post('profile')
  @ApiConflictResponse({ description: 'PROFESSIONAL_PROFILE_EXISTS' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateProfessionalProfileDto) {
    return this.service.create(user.userId, dto);
  }

  @UseGuards(ProfessionalGuard)
  @Get('me')
  @ApiForbiddenResponse({ description: 'PROFESSIONAL_PROFILE_REQUIRED' })
  me(@CurrentProfessional() profile: ProfessionalProfile) {
    return this.service.getOwn(profile.id);
  }

  @UseGuards(ProfessionalGuard)
  @Patch('profile')
  update(@CurrentProfessional() profile: ProfessionalProfile, @Body() dto: UpdateProfessionalProfileDto) {
    return this.service.update(profile, dto);
  }

  @UseGuards(ProfessionalGuard)
  @Patch('status')
  @ApiOkResponse({ description: 'ACTIVE = visible · PAUSED = oculto (no borra historial)' })
  status(@CurrentProfessional() profile: ProfessionalProfile, @Body() dto: ProfileStatusDto) {
    return this.service.setStatus(profile, dto);
  }

  @UseGuards(ProfessionalGuard)
  @Patch('availability')
  availability(@CurrentProfessional() profile: ProfessionalProfile, @Body() dto: AvailabilityDto) {
    return this.service.setAvailability(profile, dto);
  }
}
