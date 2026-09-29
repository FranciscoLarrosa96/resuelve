import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/auth/public.decorator';
import { AutocompleteDto, ResolveAddressDto, ReverseGeocodeDto } from './dto/location.dto';
import { LocationService } from './location.service';

/** Cada consulta cuesta en el proveedor: límite propio por IP. */
const LOCATION_LIMIT = Number(process.env.THROTTLE_LOCATION_LIMIT ?? 30);

/**
 * "¿Dónde es el trabajo?": autocompletar, resolver una dirección y "Usar mi
 * ubicación". Públicos (se arma el pedido antes de ingresar). Todo por POST:
 * ni la dirección ni las coordenadas quedan en URLs ni en logs de acceso, y
 * nada de esto se guarda.
 */
@ApiTags('location')
@Public()
@Controller('location')
export class LocationController {
  constructor(private readonly location: LocationService) {}

  @Get('config')
  @ApiOkResponse({ description: '{ enabled }: false = sin proveedor (dirección manual + barrios).' })
  config() {
    return this.location.config();
  }

  @Post('autocomplete')
  @HttpCode(200)
  @Throttle({ default: { limit: LOCATION_LIMIT, ttl: 60_000 } })
  @ApiOkResponse({ description: '{ items: [{ id, main, secondary, address }] } (máx. 5, prioriza Tandil)' })
  @ApiServiceUnavailableResponse({ description: 'LOCATION_NOT_CONFIGURED' })
  autocomplete(@Body() dto: AutocompleteDto) {
    return this.location.autocomplete(dto.query);
  }

  @Post('resolve')
  @HttpCode(200)
  @Throttle({ default: { limit: LOCATION_LIMIT, ttl: 60_000 } })
  @ApiOkResponse({ description: '{ result: { address, formattedAddress, zone, outsideCity } | null }' })
  resolve(@Body() dto: ResolveAddressDto) {
    return this.location.resolve({ placeId: dto.placeId, address: dto.address });
  }

  @Post('reverse')
  @HttpCode(200)
  @Throttle({ default: { limit: LOCATION_LIMIT, ttl: 60_000 } })
  @ApiOkResponse({
    description:
      '{ result: { address, formattedAddress, zone, outsideCity } | null }. No guarda coordenadas.',
  })
  reverse(@Body() dto: ReverseGeocodeDto) {
    return this.location.reverse(dto.lat, dto.lng);
  }
}
