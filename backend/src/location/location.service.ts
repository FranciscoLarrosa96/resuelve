import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { City } from '../catalog/city.entity';
import { Zone } from '../catalog/zone.entity';
import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-codes';
import { CITY_BIAS, GeoPlace, LOCATION_PROVIDER, LocationProvider } from './location-provider';
import {
  inferZone,
  isInCity,
  preserveFormattedHouseNumber,
  preserveSelectedAddressPrecision,
  shortAddress,
} from './zone-inference';

/**
 * Lo que recibe la UI al resolver una dirección o "Usar mi ubicación". Nunca
 * lleva coordenadas: el barrio es lo único que ven los invitados y la
 * dirección exacta viaja recién al enviar la solicitud (solo la ve el elegido).
 */
export interface ResolvedLocation {
  /** Para precargar "Dirección" ("Alem 455"). */
  address: string;
  formattedAddress: string;
  /** Zona interna detectada (null = que la elija la persona). */
  zone: { id: string; name: string } | null;
  /** La dirección no es de Tandil: se avisa y no se infiere barrio. */
  outsideCity: boolean;
}

@Injectable()
export class LocationService {
  private readonly logger = new Logger(LocationService.name);

  constructor(
    @Inject(LOCATION_PROVIDER) private readonly provider: LocationProvider,
    @InjectRepository(Zone) private readonly zones: Repository<Zone>,
  ) {}

  config() {
    return { enabled: this.provider.configured };
  }

  async autocomplete(query: string, sessionToken?: string) {
    this.assertConfigured();
    return { items: await this.call(() => this.provider.autocomplete(query, sessionToken)) };
  }

  async resolve(
    input: { placeId?: string; address?: string; selectedAddress?: string },
    sessionToken?: string,
  ): Promise<{ result: ResolvedLocation | null }> {
    this.assertConfigured();
    const place = await this.call(() =>
      this.provider.geocode({ placeId: input.placeId, address: input.address }, sessionToken),
    );
    return {
      result: place
        ? await this.present(
            preserveFormattedHouseNumber(preserveSelectedAddressPrecision(place, input.selectedAddress)),
          )
        : null,
    };
  }

  async reverse(lat: number, lng: number): Promise<{ result: ResolvedLocation | null }> {
    this.assertConfigured();
    const place = await this.call(() => this.provider.reverseGeocode(lat, lng));
    return { result: place ? await this.present(place) : null };
  }

  private async present(place: GeoPlace): Promise<ResolvedLocation> {
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
    };
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
