import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { City } from '../catalog/city.entity';
import { Zone } from '../catalog/zone.entity';
import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-codes';
import { CITY_BIAS, GeoPlace, LOCATION_PROVIDER, LocationProvider } from './location-provider';
import { inferZone, isInCity, shortAddress } from './zone-inference';

/**
 * Resultado de resolver una dirección o un punto del mapa. La UI lo retiene
 * solo hasta la confirmación explícita; la privacidad de la respuesta
 * profesional la decide el presenter y no incluye estas coordenadas.
 */
export interface ResolvedLocation {
  /** Para precargar "Dirección" ("Alem 455"). */
  address: string;
  formattedAddress: string;
  /** Zona interna detectada (null = que la elija la persona). */
  zone: { id: string; name: string } | null;
  /** La dirección no es de Tandil: se avisa y no se infiere barrio. */
  outsideCity: boolean;
  /** Solo se confirma una dirección cuando el proveedor identifica Tandil. */
  cityVerified: boolean;
  latitude: number | null;
  longitude: number | null;
  providerPlaceId: string | null;
}

@Injectable()
export class LocationService {
  private readonly logger = new Logger(LocationService.name);

  constructor(
    @Inject(LOCATION_PROVIDER) private readonly provider: LocationProvider,
    @InjectRepository(Zone) private readonly zones: Repository<Zone>,
    private readonly configService: ConfigService,
  ) {}

  config() {
    return {
      enabled: this.provider.configured,
      mapApiKey: this.configService.get<string>('GEOAPIFY_BROWSER_API_KEY') ?? null,
    };
  }

  async autocomplete(query: string) {
    this.assertConfigured();
    return { items: await this.call(() => this.provider.autocomplete(query)) };
  }

  async resolve(
    input: { placeId?: string; address?: string },
  ): Promise<{ result: ResolvedLocation | null }> {
    this.assertConfigured();
    const place = await this.call(() => this.provider.geocode(input));
    return { result: place ? await this.present(place) : null };
  }

  async reverse(lat: number, lng: number): Promise<{ result: ResolvedLocation | null }> {
    this.assertConfigured();
    const place = await this.call(() => this.provider.reverseGeocode(lat, lng));
    return { result: place ? await this.present(place, { latitude: lat, longitude: lng }) : null };
  }

  /**
   * Revalida en servidor las coordenadas al crear/editar un pedido. No confía
   * en dirección, locality, placeId o zona enviados por el navegador.
   */
  async validateRequestCoordinates(latitude: number, longitude: number): Promise<ResolvedLocation> {
    this.assertConfigured();
    const place = await this.call(() => this.provider.reverseGeocode(latitude, longitude));
    if (!place || !this.cityVerified(place)) {
      throw AppException.unprocessable(
        ErrorCode.LOCATION_OUTSIDE_CITY,
        'Por ahora Resuelve está disponible en Tandil. Elegí una dirección dentro de la ciudad para continuar.',
      );
    }
    return this.present(place, { latitude, longitude });
  }

  async assertTandilZone(zoneId: string): Promise<void> {
    const zone = await this.zones
      .createQueryBuilder('z')
      .innerJoin(City, 'c', 'c.id = z.cityId')
      .where('z.id = :zoneId AND z.active = true AND c.slug = :slug', { zoneId, slug: 'tandil' })
      .getOne();
    if (!zone) throw AppException.unprocessable(ErrorCode.VALIDATION_ERROR, 'La zona no existe en Tandil');
  }

  private async present(
    place: GeoPlace,
    coordinates?: { latitude: number; longitude: number },
  ): Promise<ResolvedLocation> {
    const cityVerified = this.cityVerified(place);
    const inCity = isInCity(place, CITY_BIAS.city);
    const zones = inCity
      ? await this.zones
          .createQueryBuilder('z')
          .innerJoin(City, 'c', 'c.id = z.cityId')
          .where('z.active = true AND c.slug = :slug', { slug: 'tandil' })
          .getMany()
      : [];
    const zone = inferZone(place, zones);
    return {
      address: shortAddress(place),
      formattedAddress: place.formattedAddress,
      zone: zone ? { id: zone.id, name: zone.name } : null,
      outsideCity: !inCity,
      cityVerified,
      latitude: coordinates?.latitude ?? place.latitude ?? null,
      longitude: coordinates?.longitude ?? place.longitude ?? null,
      providerPlaceId: place.placeId ?? null,
    };
  }

  private cityVerified(place: GeoPlace): boolean {
    return !!place.locality && normalizeCity(place.locality) === normalizeCity(CITY_BIAS.city);
  }

  /** Falla del proveedor → 502 recuperable (la UI ofrece seguir a mano). Nunca se loguea la dirección. */
  private async call<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      this.logger.warn(`Proveedor de ubicación: ${(error as Error).message}`);
      throw new AppException(
        ErrorCode.LOCATION_PROVIDER_ERROR,
        'No pudimos consultar la dirección',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  private assertConfigured(): void {
    if (!this.provider.configured)
      throw new AppException(
        ErrorCode.LOCATION_NOT_CONFIGURED,
        'La búsqueda de direcciones no está disponible',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
  }
}

function normalizeCity(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}
