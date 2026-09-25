import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/auth/public.decorator';
import { CatalogService } from './catalog.service';
import { ServicesQueryDto, ZonesQueryDto } from './dto/catalog-query.dto';

@ApiTags('catalog')
@Public()
@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('categories')
  @ApiOkResponse({ description: 'Categorías activas con sus servicios, en orden de presentación.' })
  categories() {
    return this.catalog.listCategories();
  }

  @Get('services')
  services(@Query() query: ServicesQueryDto) {
    return this.catalog.listServices(query);
  }

  @Get('services/:idOrSlug')
  @ApiNotFoundResponse({ description: 'NOT_FOUND' })
  service(@Param('idOrSlug') idOrSlug: string) {
    return this.catalog.getService(idOrSlug);
  }

  @Get('cities')
  cities() {
    return this.catalog.listCities();
  }

  @Get('zones')
  zones(@Query() query: ZonesQueryDto) {
    return this.catalog.listZones(query);
  }
}
