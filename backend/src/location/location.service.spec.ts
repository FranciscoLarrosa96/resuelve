import { ConfigService } from '@nestjs/config';
import { AppException } from '../common/errors/app-exception';
import { LocationService } from './location.service';
import { LocationProvider, GeoPlace } from './location-provider';

const TANIL = { id: 'zone-centro', name: 'Centro', slug: 'centro' };
const place = (locality: string | null): GeoPlace => ({
  formattedAddress: 'Alem 455, Tandil, Buenos Aires, Argentina',
  street: 'Alem',
  number: '455',
  neighbourhood: 'Centro',
  locality,
  latitude: -37.321,
  longitude: -59.14,
  placeId: 'place-1',
});

describe('LocationService premium location', () => {
  const provider: jest.Mocked<LocationProvider> = {
    configured: true,
    autocomplete: jest.fn(),
    geocode: jest.fn(),
    reverseGeocode: jest.fn(),
  };
  const queryBuilder = {
    innerJoin: jest.fn(),
    where: jest.fn(),
    getMany: jest.fn(),
    getOne: jest.fn(),
  };
  const zones = { createQueryBuilder: jest.fn() };
  const config = { get: jest.fn((key: string) => key === 'GEOAPIFY_BROWSER_API_KEY' ? 'browser-key' : undefined) };
  let service: LocationService;

  beforeEach(() => {
    jest.clearAllMocks();
    queryBuilder.innerJoin.mockReturnThis();
    queryBuilder.where.mockReturnThis();
    queryBuilder.getMany.mockResolvedValue([TANIL] as never);
    queryBuilder.getOne.mockResolvedValue(TANIL as never);
    zones.createQueryBuilder.mockReturnValue(queryBuilder as never);
    provider.reverseGeocode.mockResolvedValue(place('Tandil'));
    service = new LocationService(provider, zones as never, config as unknown as ConfigService);
  });

  it('expone solo la key pública de mapa en la configuración', () => {
    expect(service.config()).toEqual({ enabled: true, mapApiKey: 'browser-key' });
  });

  it('valida coordenadas contra Geocoding y devuelve campos normalizados privados y zona existente', async () => {
    const result = await service.validateRequestCoordinates(-37.321, -59.14);
    expect(provider.reverseGeocode).toHaveBeenCalledWith(-37.321, -59.14);
    expect(result).toMatchObject({
      address: 'Alem 455',
      latitude: -37.321,
      longitude: -59.14,
      providerPlaceId: 'place-1',
      zone: { id: TANIL.id, name: 'Centro' },
      cityVerified: true,
      outsideCity: false,
    });
  });

  it.each(['Buenos Aires', null])('rechaza una ciudad distinta o que el proveedor no puede verificar (%s)', async (locality) => {
    provider.reverseGeocode.mockResolvedValue(place(locality));
    await expect(service.validateRequestCoordinates(-37.3, -59.1)).rejects.toBeInstanceOf(AppException);
  });

  it('solo acepta una zona activa del catálogo de Tandil', async () => {
    await expect(service.assertTandilZone(TANIL.id)).resolves.toBeUndefined();
    queryBuilder.getOne.mockResolvedValue(null as never);
    await expect(service.assertTandilZone('inactive-or-other-city')).rejects.toBeInstanceOf(AppException);
  });
});
