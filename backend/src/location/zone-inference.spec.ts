import { GoogleLocationProvider, placeFromGoogle } from './location-provider';
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
  it('usa el barrio del proveedor (sin tildes ni mayúsculas)', () => {
    expect(inferZone(place({ neighbourhood: 'VILLA ITALIA' }), zones)?.id).toBe('2');
    expect(inferZone(place({ neighbourhood: 'Uncás' }), zones)?.id).toBe('3');
  });

  it('si el barrio no coincide, busca UNA zona nombrada en la dirección (palabras completas)', () => {
    expect(
      inferZone(place({ formattedAddress: 'Av. Del Valle 800, Villa Aguirre, Tandil' }), zones)?.id,
    ).toBe('4');
    expect(inferZone(place({ formattedAddress: 'Concentrolandia 12, Tandil' }), zones)).toBeNull();
  });

  it('ambigua o sin coincidencia → null (nunca el primero)', () => {
    expect(inferZone(place({ formattedAddress: 'Centro y Uncas, Tandil' }), zones)).toBeNull();
    expect(
      inferZone(place({ neighbourhood: 'Barrio Nuevo', formattedAddress: 'Ruta 226, Tandil' }), zones),
    ).toBeNull();
  });
});

describe('helpers', () => {
  it('normaliza, detecta ciudad y arma la dirección corta', () => {
    expect(normalizePlaceText(' Gral. Rodríguez, 455 ')).toBe('gral rodriguez 455');
    expect(isInCity(place({ locality: 'TANDIL' }), 'Tandil')).toBe(true);
    expect(isInCity(place({ locality: 'Azul' }), 'Tandil')).toBe(false);
    expect(isInCity(place({ locality: null }), 'Tandil')).toBe(true);
    expect(shortAddress(place({ street: 'Alem', number: '455' }))).toBe('Alem 455');
    expect(shortAddress(place({ formattedAddress: 'Plaza Independencia, Tandil' }))).toBe(
      'Plaza Independencia',
    );
  });
});

describe('GoogleLocationProvider', () => {
  const component = (long_name: string, types: string[]) => ({ long_name, short_name: long_name, types });

  it('parsea address_components', () => {
    expect(
      placeFromGoogle({
        formatted_address: 'Alem 455, Tandil',
        address_components: [
          component('455', ['street_number']),
          component('Alem', ['route']),
          component('Centro', ['neighborhood', 'political']),
          component('Tandil', ['locality', 'political']),
        ],
      }),
    ).toEqual({
      formattedAddress: 'Alem 455, Tandil',
      street: 'Alem',
      number: '455',
      neighbourhood: 'Centro',
      locality: 'Tandil',
    });
  });

  it('reverse geocode sesgado (es/ar) y sin exponer la key en errores', async () => {
    const calls: string[] = [];
    const http = (async (url: string) => {
      calls.push(url);
      return { ok: false, status: 403, json: async () => ({}) };
    }) as unknown as typeof fetch;
    const g = new GoogleLocationProvider('SECRET_KEY', http);
    await expect(g.reverseGeocode(-37.3, -59.1)).rejects.toThrow('Geocoding respondió 403');
    await expect(g.reverseGeocode(-37.3, -59.1)).rejects.not.toThrow(/SECRET_KEY/);
    expect(calls[0]).toContain('latlng=-37.3%2C-59.1');
    expect(calls[0]).toContain('language=es');
  });

  it('autocomplete: Places (New) con sesgo a Tandil, máx. 5', async () => {
    let sent: { body?: string; headers?: Record<string, string> } = {};
    const http = (async (_url: string, init: { body: string; headers: Record<string, string> }) => {
      sent = init;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          suggestions: Array.from({ length: 7 }, (_, i) => ({
            placePrediction: {
              placeId: `p${i}`,
              structuredFormat: { mainText: { text: `Alem ${i}` }, secondaryText: { text: 'Tandil' } },
            },
          })),
        }),
      };
    }) as unknown as typeof fetch;
    const items = await new GoogleLocationProvider('K', http).autocomplete('Alem', 'session-123');
    expect(items).toHaveLength(5);
    expect(items[0]).toEqual({ id: 'p0', main: 'Alem 0', secondary: 'Tandil' });
    const body = JSON.parse(sent.body!);
    expect(body.locationBias.circle.center).toEqual({ latitude: -37.3217, longitude: -59.1332 });
    expect(body.sessionToken).toBe('session-123');
    expect(sent.headers!['X-Goog-Api-Key']).toBe('K');
  });

  it('sin key → no configurado', () => {
    expect(new GoogleLocationProvider(undefined).configured).toBe(false);
  });
});
