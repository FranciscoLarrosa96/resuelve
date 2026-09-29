/**
 * Proveedor externo de direcciones, encapsulado: ningun componente ni
 * servicio llama al proveedor directo. Devuelve datos normalizados para
 * previsualizar; solo se guardan al confirmar una solicitud.
 */
export const LOCATION_PROVIDER = Symbol('LOCATION_PROVIDER');

/** Direccion normalizada que devolvio el proveedor. */
export interface GeoPlace {
  formattedAddress: string;
  street: string | null;
  number: string | null;
  neighbourhood: string | null;
  locality: string | null;
  latitude?: number | null;
  longitude?: number | null;
  placeId?: string | null;
}

export interface AddressSuggestion {
  /** Identificador opaco para la lista; no es una fuente de verdad del backend. */
  id: string;
  main: string;
  secondary: string | null;
  /** Texto normalizado que se vuelve a validar en backend al seleccionar. */
  address: string;
}

export interface LocationProvider {
  /** false = sin proveedor: la app sigue con direccion manual + barrios. */
  readonly configured: boolean;
  autocomplete(query: string): Promise<AddressSuggestion[]>;
  geocode(input: { placeId?: string; address?: string }): Promise<GeoPlace | null>;
  reverseGeocode(lat: number, lng: number): Promise<GeoPlace | null>;
}

export class DisabledLocationProvider implements LocationProvider {
  readonly configured = false;
  autocomplete(): Promise<AddressSuggestion[]> {
    return Promise.resolve([]);
  }
  geocode(): Promise<GeoPlace | null> {
    return Promise.resolve(null);
  }
  reverseGeocode(): Promise<GeoPlace | null> {
    return Promise.resolve(null);
  }
}

/** Sesgo de busqueda: centro de Tandil y ~15 km; no se usa como limite de ciudad. */
export const CITY_BIAS = { lat: -37.3217, lng: -59.1332, radiusMeters: 15_000, city: 'Tandil' };

interface GeoapifyAddress {
  formatted?: string;
  address_line1?: string;
  address_line2?: string;
  street?: string;
  housenumber?: string;
  suburb?: string;
  neighbourhood?: string;
  district?: string;
  county?: string;
  city?: string;
  town?: string;
  village?: string;
  lat?: number;
  lon?: number;
  place_id?: string;
}

interface GeoapifyResult extends GeoapifyAddress {
  feature_type?: string;
  geometry?: { coordinates?: [number, number] };
}

interface GeoapifyJson {
  results?: GeoapifyResult[];
  features?: { properties?: GeoapifyResult; geometry?: GeoapifyResult['geometry'] }[];
}

/** Convierte campos Geoapify/OpenStreetMap a los nombres internos de Resuelve. */
export function placeFromGeoapify(result: GeoapifyResult): GeoPlace | null {
  const formattedAddress = result.formatted ??
    [result.address_line1, result.address_line2].filter(Boolean).join(', ');
  if (!formattedAddress) return null;
  const coordinates = result.geometry?.coordinates;
  return {
    formattedAddress,
    street: result.street ?? null,
    number: result.housenumber ?? null,
    neighbourhood: result.suburb ?? result.neighbourhood ?? result.district ?? null,
    // Nunca usar county/partido como localidad: no prueba que sea Tandil urbano.
    locality: result.city ?? result.town ?? result.village ?? null,
    latitude: finite(result.lat) ? result.lat : (coordinates && finite(coordinates[1]) ? coordinates[1] : null),
    longitude: finite(result.lon) ? result.lon : (coordinates && finite(coordinates[0]) ? coordinates[0] : null),
    placeId: result.place_id ?? null,
  };
}

/** Geoapify Geocoding (autocomplete/forward/reverse); la API key solo vive en backend. */
export class GeoapifyLocationProvider implements LocationProvider {
  readonly configured: boolean;

  constructor(
    private readonly apiKey: string | undefined,
    private readonly http: typeof fetch = fetch,
  ) {
    this.configured = !!apiKey;
  }

  async autocomplete(query: string): Promise<AddressSuggestion[]> {
    const body = await this.request('https://api.geoapify.com/v1/geocode/autocomplete', {
      text: query,
      format: 'json',
      lang: 'es',
      limit: '5',
      filter: 'countrycode:ar',
      bias: `circle:${CITY_BIAS.lng},${CITY_BIAS.lat},${CITY_BIAS.radiusMeters}`,
    }, 'Address Autocomplete');

    return (body.results ?? [])
      .map((result) => {
        const address = result.formatted ?? [result.address_line1, result.address_line2].filter(Boolean).join(', ');
        if (!address || !result.place_id) return null;
        return {
          id: result.place_id,
          main: result.address_line1 ?? result.formatted ?? address,
          secondary: result.address_line2 ?? null,
          address,
        };
      })
      .filter((item): item is AddressSuggestion => !!item)
      .slice(0, 5);
  }

  async geocode(input: { placeId?: string; address?: string }): Promise<GeoPlace | null> {
    if (input.placeId) {
      const body = await this.request('https://api.geoapify.com/v2/place-details', {
        id: input.placeId,
        features: 'details',
        lang: 'es',
      }, 'Place Details');
      return this.placeFromResponse(body, input.placeId);
    }
    const body = await this.request('https://api.geoapify.com/v1/geocode/search', {
      text: input.address ?? '',
      format: 'json',
      lang: 'es',
      limit: '1',
      filter: 'countrycode:ar',
      bias: `circle:${CITY_BIAS.lng},${CITY_BIAS.lat},${CITY_BIAS.radiusMeters}`,
    }, 'Geocoding');
    return body.results?.[0] ? placeFromGeoapify(body.results[0]) : null;
  }

  async reverseGeocode(lat: number, lng: number): Promise<GeoPlace | null> {
    const body = await this.request('https://api.geoapify.com/v1/geocode/reverse', {
      lat: String(lat),
      lon: String(lng),
      format: 'json',
      lang: 'es',
      limit: '1',
    }, 'Reverse Geocoding');
    return body.results?.[0] ? placeFromGeoapify(body.results[0]) : null;
  }

  private placeFromResponse(body: GeoapifyJson, fallbackPlaceId: string): GeoPlace | null {
    const feature = body.features?.find((item) => item.properties?.['feature_type'] === 'details') ?? body.features?.[0];
    if (feature?.properties) {
      return placeFromGeoapify({ ...feature.properties, geometry: feature.geometry, place_id: feature.properties.place_id ?? fallbackPlaceId });
    }
    return body.results?.[0] ? placeFromGeoapify({ ...body.results[0], place_id: body.results[0].place_id ?? fallbackPlaceId }) : null;
  }

  private async request(url: string, params: Record<string, string>, service: string): Promise<GeoapifyJson> {
    const query = new URLSearchParams({ ...params, apiKey: this.apiKey! });
    const response = await this.http(`${url}?${query.toString()}`);
    // No incluir la URL en el error: contiene la API key.
    if (!response.ok) throw new Error(`Geoapify ${service} returned HTTP ${response.status}`);
    return await response.json() as GeoapifyJson;
  }
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
