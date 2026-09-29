import { GeoapifyLocationProvider, placeFromGeoapify } from './location-provider';
import { inferZone, isInCity, normalizePlaceText, shortAddress } from './zone-inference';

const zones = [
  { id: '1', name: 'Centro' },
  { id: '2', name: 'Villa Italia' },
  { id: '3', name: 'Uncas' },
  { id: '4', name: 'Villa Aguirre' },
  { id: '5', name: 'La Movediza' },
];
const place = (p: Partial<Parameters<typeof inferZone>[0]>) => ({
  formattedAddress: '',
  street: null,
  number: null,
  neighbourhood: null,
  locality: 'Tandil',
  ...p,
});

describe('inferZone', () => {
  it('usa el barrio del proveedor (sin tildes ni mayusculas)', () => {
    expect(inferZone(place({ neighbourhood: 'VILLA ITALIA' }), zones)?.id).toBe('2');
    expect(inferZone(place({ neighbourhood: 'Uncas' }), zones)?.id).toBe('3');
  });

  it('si el barrio no coincide, busca UNA zona nombrada en la direccion (palabras completas)', () => {
    expect(inferZone(place({ formattedAddress: 'Av. Del Valle 800, Villa Aguirre, Tandil' }), zones)?.id).toBe('4');
    expect(inferZone(place({ formattedAddress: 'Concentrolandia 12, Tandil' }), zones)).toBeNull();
  });

  it('ambigua o sin coincidencia devuelve null, nunca el primero', () => {
    expect(inferZone(place({ formattedAddress: 'Centro y Uncas, Tandil' }), zones)).toBeNull();
    expect(inferZone(place({ neighbourhood: 'Barrio Nuevo', formattedAddress: 'Ruta 226, Tandil' }), zones)).toBeNull();
  });
});

describe('helpers', () => {
  it('normaliza, detecta ciudad y arma la direccion corta', () => {
    expect(normalizePlaceText(' Gral. Rodriguez, 455 ')).toBe('gral rodriguez 455');
    expect(isInCity(place({ locality: 'TANDIL' }), 'Tandil')).toBe(true);
    expect(isInCity(place({ locality: 'Azul' }), 'Tandil')).toBe(false);
    expect(isInCity(place({ locality: null }), 'Tandil')).toBe(true);
    expect(shortAddress(place({ street: 'Alem', number: '455' }))).toBe('Alem 455');
    expect(shortAddress(place({ formattedAddress: 'Plaza Independencia, Tandil' }))).toBe('Plaza Independencia');
  });
});

describe('Geoapify normalization and provider', () => {
  const result = {
    formatted: 'Alem 455, Centro, Tandil, Buenos Aires, Argentina',
    address_line1: 'Alem 455',
    address_line2: 'Centro, Tandil, Buenos Aires, Argentina',
    street: 'Alem',
    housenumber: '455',
    suburb: 'Centro',
    city: 'Tandil',
    county: 'Tandil',
    lat: -37.321,
    lon: -59.14,
    place_id: 'geo-place-1',
  };

  it('normaliza address, barrio, localidad, coordenadas e id generico', () => {
    expect(placeFromGeoapify(result)).toEqual({
      formattedAddress: result.formatted,
      street: 'Alem',
      number: '455',
      neighbourhood: 'Centro',
      locality: 'Tandil',
      latitude: -37.321,
      longitude: -59.14,
      placeId: 'geo-place-1',
    });
    expect(placeFromGeoapify({ formatted: 'Tandil', county: 'Tandil' })?.locality).toBeNull();
  });

  it('autocomplete prioriza Tandil, restringe Argentina y devuelve maximo cinco sugerencias', async () => {
    const calls: string[] = [];
    const http = (async (url: string) => {
      calls.push(url);
      return {
        ok: true,
        status: 200,
        json: async () => ({ results: Array.from({ length: 7 }, (_, i) => ({
          ...result,
          place_id: `place-${i}`,
          formatted: `Alem ${i}, Tandil, Argentina`,
          address_line1: `Alem ${i}`,
        })) }),
      };
    }) as unknown as typeof fetch;
    const items = await new GeoapifyLocationProvider('SERVER_KEY', http).autocomplete('Alem');
    const url = new URL(calls[0]);
    expect(url.pathname).toBe('/v1/geocode/autocomplete');
    expect(url.searchParams.get('text')).toBe('Alem');
    expect(url.searchParams.get('lang')).toBe('es');
    expect(url.searchParams.get('filter')).toBe('countrycode:ar');
    expect(url.searchParams.get('bias')).toBe('circle:-59.1332,-37.3217,15000');
    expect(url.searchParams.get('apiKey')).toBe('SERVER_KEY');
    expect(items).toHaveLength(5);
    expect(items[0]).toEqual({
      id: 'place-0', main: 'Alem 0', secondary: 'Centro, Tandil, Buenos Aires, Argentina',
      address: 'Alem 0, Tandil, Argentina',
    });
  });

  it('geocodifica una direccion con filtro AR y priorizacion local', async () => {
    let called = '';
    const http = (async (url: string) => {
      called = url;
      return { ok: true, status: 200, json: async () => ({ results: [result] }) };
    }) as unknown as typeof fetch;
    const geocoded = await new GeoapifyLocationProvider('K', http).geocode({ address: 'Alem 455, Tandil' });
    const url = new URL(called);
    expect(url.pathname).toBe('/v1/geocode/search');
    expect(url.searchParams.get('text')).toBe('Alem 455, Tandil');
    expect(url.searchParams.get('filter')).toBe('countrycode:ar');
    expect(geocoded?.placeId).toBe('geo-place-1');
  });

  it('resuelve un place id Geoapify con Place Details', async () => {
    let called = '';
    const http = (async (url: string) => {
      called = url;
      return {
        ok: true,
        status: 200,
        json: async () => ({ features: [{
          properties: { ...result, feature_type: 'details' },
          geometry: { coordinates: [-59.14, -37.321] },
        }] }),
      };
    }) as unknown as typeof fetch;
    const resolved = await new GeoapifyLocationProvider('K', http).geocode({ placeId: 'geo-place-1' });
    expect(new URL(called).pathname).toBe('/v2/place-details');
    expect(new URL(called).searchParams.get('id')).toBe('geo-place-1');
    expect(resolved?.latitude).toBe(-37.321);
  });

  it('reverse geocode usa lat/lon y devuelve resultados vacios como null', async () => {
    let called = '';
    const http = (async (url: string) => {
      called = url;
      return { ok: true, status: 200, json: async () => ({ results: [] }) };
    }) as unknown as typeof fetch;
    expect(await new GeoapifyLocationProvider('K', http).reverseGeocode(-37.3, -59.1)).toBeNull();
    const url = new URL(called);
    expect(url.pathname).toBe('/v1/geocode/reverse');
    expect(url.searchParams.get('lat')).toBe('-37.3');
    expect(url.searchParams.get('lon')).toBe('-59.1');
  });

  it.each([403, 429])('no filtra la API key en errores HTTP (%s)', async (status) => {
    const http = (async () => ({ ok: false, status, json: async () => ({}) })) as unknown as typeof fetch;
    const provider = new GeoapifyLocationProvider('SECRET_KEY', http);
    await expect(provider.reverseGeocode(-37.3, -59.1)).rejects.toThrow(`Geoapify Reverse Geocoding returned HTTP ${status}`);
    await expect(provider.reverseGeocode(-37.3, -59.1)).rejects.not.toThrow(/SECRET_KEY/);
  });

  it('sin key queda deshabilitado', () => {
    expect(new GeoapifyLocationProvider(undefined).configured).toBe(false);
  });
});
