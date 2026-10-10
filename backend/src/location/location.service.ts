import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { City } from '../catalog/city.entity';
import { normalizeGeoText } from '../catalog/geo/geo-text';
import { Zone } from '../catalog/zone.entity';
import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-codes';
import {
  GeoPlace,
  LOCALITY_BIAS_RADIUS_METERS,
  LOCATION_PROVIDER,
  LocationProvider,
  SearchBias,
} from './location-provider';
import { inferZone, isInCity, shortAddress } from './zone-inference';

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
  /** La dirección no es de la localidad elegida: se avisa y no se infiere barrio. */
  outsideCity: boolean;
  /**
   * Localidad del catálogo que corresponde a la dirección (solo si hay UNA que
   * coincide en nombre y provincia). Es una sugerencia: la persona confirma.
   */
  suggestedLocality: { id: string; name: string; province: string } | null;
}

/** Localidad elegida: barrios posibles y sesgo del proveedor. */
interface LocalityContext {
  city: City;
  bias: SearchBias | null;
}

@Injectable()
export class LocationService {
  private readonly logger = new Logger(LocationService.name);

  constructor(
    @Inject(LOCATION_PROVIDER) private readonly provider: LocationProvider,
    @InjectRepository(Zone) private readonly zones: Repository<Zone>,
    @InjectRepository(City) private readonly cities: Repository<City>,
    private readonly config: ConfigService,
  ) {}

  providerStatus() {
    return { enabled: this.provider.configured };
  }

  async autocomplete(query: string, sessionToken?: string, localityId?: string) {
    this.assertConfigured();
    const ctx = await this.context(localityId);
    return {
      items: await this.call(() => this.provider.autocomplete(query, sessionToken, ctx?.bias ?? null)),
    };
  }

  async resolve(
    input: { placeId?: string; address?: string },
    sessionToken?: string,
    localityId?: string,
  ): Promise<{ result: ResolvedLocation | null }> {
    this.assertConfigured();
    const ctx = await this.context(localityId);
    const place = await this.call(() => this.provider.geocode(input, sessionToken, ctx?.bias ?? null));
    return { result: place ? await this.present(place, ctx) : null };
  }

  async reverse(lat: number, lng: number, localityId?: string): Promise<{ result: ResolvedLocation | null }> {
    this.assertConfigured();
    const ctx = await this.context(localityId);
    const place = await this.call(() => this.provider.reverseGeocode(lat, lng));
    return { result: place ? await this.present(place, ctx) : null };
  }

  /**
   * La localidad del pedido (`localityId`); sin ella, la legacy (`LEGACY_LOCALITY`) para
   * clientes del modelo de una sola ciudad. null = sin contexto (no se infiere barrio).
   */
  private async context(localityId?: string): Promise<LocalityContext | null> {
    let city: City | null = null;
    if (localityId) {
      city = await this.cities.findOneBy({ id: localityId, active: true });
      if (!city)
        throw AppException.unprocessable(ErrorCode.INVALID_WORK_LOCATION, 'La localidad no existe', {
          fields: ['localityId'],
        });
    } else {
      const [provinceSlug, slug] = this.config
        .get<string>('LEGACY_LOCALITY', 'buenos-aires/tandil')
        .split('/');
      city = await this.cities
        .createQueryBuilder('c')
        .innerJoin('c.provinceRef', 'pr')
        .where('pr.slug = :provinceSlug AND c.slug = :slug AND c.active', { provinceSlug, slug })
        .getOne();
    }
    if (!city) return null;
    const bias =
      city.centroidLat !== null && city.centroidLng !== null
        ? {
            lat: city.centroidLat,
            lng: city.centroidLng,
            radiusMeters: LOCALITY_BIAS_RADIUS_METERS,
            locality: city.name,
          }
        : null;
    return { city, bias };
  }

  private async present(place: GeoPlace, ctx: LocalityContext | null): Promise<ResolvedLocation> {
    const inCity = ctx ? isInCity(place, ctx.city.name) : true;
    const zones =
      ctx && inCity ? await this.zones.find({ where: { cityId: ctx.city.id, active: true } }) : [];
    const zone = inferZone(place, zones);
    return {
      address: shortAddress(place),
      formattedAddress: place.formattedAddress,
      zone: zone ? { id: zone.id, name: zone.name } : null,
      outsideCity: !inCity,
      suggestedLocality: await this.matchLocality(place),
    };
  }

  /** Localidad del catálogo por nombre + provincia del proveedor; ambigua o sin match → null. */
  private async matchLocality(place: GeoPlace): Promise<ResolvedLocation['suggestedLocality']> {
    if (!place.locality) return null;
    const qb = this.cities
      .createQueryBuilder('c')
      .innerJoinAndSelect('c.provinceRef', 'pr')
      .where('c.active AND c.search_name = :name', { name: normalizeGeoText(place.locality) })
      .limit(5);
    const candidates = await qb.getMany();
    const province = place.province ? normalizeGeoText(place.province).replace(/^provincia de /, '') : null;
    const matches = province
      ? candidates.filter((c) => {
          const name = normalizeGeoText(c.provinceRef.name);
          return (
            name === province ||
            (c.provinceRef.officialCode === '02' && /capital federal|ciudad autonoma/.test(province))
          );
        })
      : candidates;
    if (matches.length !== 1) return null;
    return { id: matches[0].id, name: matches[0].name, province: matches[0].provinceRef.name };
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
