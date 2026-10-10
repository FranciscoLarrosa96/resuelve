import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/auth/public.decorator';
import {
  LocalityDetailQueryDto,
  LocalitySearchDto,
  ServedLocalitiesQueryDto,
} from './dto/locality-query.dto';
import { LocalitiesService } from './localities.service';

/**
 * Catálogo geográfico nacional (provincias → localidades → barrios). Público y de
 * solo lectura: el autocompletar nunca devuelve miles de filas (máx. 20).
 */
@ApiTags('localities')
@Public()
@Controller()
export class LocalitiesController {
  constructor(private readonly localities: LocalitiesService) {}

  @Get('provinces')
  @ApiOkResponse({ description: 'Las 24 jurisdicciones (provincias y CABA) con su código oficial.' })
  provinces() {
    return this.localities.listProvinces();
  }

  @Get('provinces/:provinceSlug/localities/:localitySlug')
  @ApiNotFoundResponse({ description: 'NOT_FOUND' })
  bySlug(
    @Param('provinceSlug') provinceSlug: string,
    @Param('localitySlug') localitySlug: string,
    @Query() q: LocalityDetailQueryDto,
  ) {
    return this.localities.getBySlug(provinceSlug, localitySlug, q.service);
  }

  @Get('localities')
  @ApiOkResponse({
    description: '{ items: [{ id, name, province, label, path, hasProfessionals }] } (máx. 20)',
  })
  search(@Query() q: LocalitySearchDto) {
    return this.localities.search(q);
  }

  @Get('localities/served')
  @ApiOkResponse({ description: 'Localidades con al menos un profesional público (para sitemap y SEO).' })
  served(@Query() q: ServedLocalitiesQueryDto) {
    return this.localities.served(q.service);
  }

  @Get('localities/served-services')
  @ApiOkResponse({ description: '{ items: [{ path, service, professionalsCount }] }: páginas por ciudad con oferta real (sitemap).' })
  servedServices() {
    return this.localities.servedServices();
  }

  @Get('localities/:id')
  @ApiNotFoundResponse({ description: 'NOT_FOUND' })
  get(@Param('id', ParseUUIDPipe) id: string, @Query() q: LocalityDetailQueryDto) {
    return this.localities.get(id, q.service);
  }

  @Get('localities/:id/neighborhoods')
  @ApiOkResponse({
    description: 'Barrios activos de la localidad (vacío = se cubre y se pide por ciudad completa).',
  })
  neighborhoods(@Param('id', ParseUUIDPipe) id: string) {
    return this.localities.neighborhoods(id);
  }
}
