/**
 * Proveedor externo de direcciones, encapsulado: ningún componente ni
 * servicio llama a Google (u otro) directo. Solo devuelve lo que la app usa;
 * las coordenadas entran para geocodificar y NUNCA se guardan ni se devuelven.
 */
export const LOCATION_PROVIDER = Symbol('LOCATION_PROVIDER');

/** Dirección normalizada que devolvió el proveedor. */
export interface GeoPlace {
  /** "Gral. Rodríguez 455, B7000 Tandil, Provincia de Buenos Aires, Argentina" (ejemplo). */
  formattedAddress: string;
  street: string | null;
  number: string | null;
  /** Barrio según el proveedor ("Villa Italia"), si lo informa. */
  neighbourhood: string | null;
  locality: string | null;
  /** Provincia según el proveedor ("Provincia de Buenos Aires", "Córdoba"). */
  province: string | null;
}

/** Sesgo de búsqueda: centroide público de la localidad elegida y un radio. */
export interface SearchBias {
  lat: number;
  lng: number;
  radiusMeters: number;
  /** Nombre de la localidad, para restringir el geocoding de texto. */
  locality: string;
}

export interface AddressSuggestion {
  /** Id opaco del proveedor para resolver la sugerencia (placeId). */
  id: string;
  main: string;
  secondary: string | null;
}

export interface LocationProvider {
  /** false = sin proveedor: la app sigue con dirección manual + barrios. */
  readonly configured: boolean;
  autocomplete(query: string, sessionToken?: string, bias?: SearchBias | null): Promise<AddressSuggestion[]>;
  geocode(
    input: { placeId?: string; address?: string },
    sessionToken?: string,
    bias?: SearchBias | null,
  ): Promise<GeoPlace | null>;
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

/** Radio del sesgo alrededor del centroide de la localidad elegida. */
export const LOCALITY_BIAS_RADIUS_METERS = 20_000;

interface GoogleComponent {
  long_name: string;
  short_name: string;
  types: string[];
}

/** Arma un GeoPlace desde `address_components` de Geocoding. */
export function placeFromGoogle(result: {
  formatted_address: string;
  address_components: GoogleComponent[];
}): GeoPlace {
  const pick = (...types: string[]) =>
    types.map((t) => result.address_components.find((c) => c.types.includes(t))?.long_name).find(Boolean) ??
    null;
  return {
    formattedAddress: result.formatted_address,
    street: pick('route'),
    number: pick('street_number'),
    neighbourhood: pick('neighborhood', 'sublocality_level_1', 'sublocality'),
    locality: pick('locality', 'administrative_area_level_2'),
    province: pick('administrative_area_level_1'),
  };
}

/**
 * Google Maps Platform: Places Autocomplete (New) sesgado a la localidad elegida y
 * Geocoding (dirección, placeId y coordenadas). Idioma español, región AR.
 */
export class GoogleLocationProvider implements LocationProvider {
  readonly configured: boolean;

  constructor(
    private readonly apiKey: string | undefined,
    private readonly http: typeof fetch = fetch,
  ) {
    this.configured = !!apiKey;
  }

  async autocomplete(query: string, sessionToken?: string, bias?: SearchBias | null): Promise<AddressSuggestion[]> {
    const res = await this.http('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': this.apiKey! },
      body: JSON.stringify({
        input: query,
        languageCode: 'es',
        includedRegionCodes: ['ar'],
        ...(bias
          ? {
              locationBias: {
                circle: { center: { latitude: bias.lat, longitude: bias.lng }, radius: bias.radiusMeters },
              },
            }
          : {}),
        ...(sessionToken ? { sessionToken } : {}),
      }),
    });
    if (!res.ok) throw new Error(`Places respondió ${res.status}`);
    const body = (await res.json()) as {
      suggestions?: {
        placePrediction?: {
          placeId: string;
          text?: { text: string };
          structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } };
        };
      }[];
    };
    return (body.suggestions ?? [])
      .map((s) => s.placePrediction)
      .filter((p): p is NonNullable<typeof p> => !!p?.placeId)
      .slice(0, 5)
      .map((p) => ({
        id: p.placeId,
        main: p.structuredFormat?.mainText?.text ?? p.text?.text ?? '',
        secondary: p.structuredFormat?.secondaryText?.text ?? null,
      }));
  }

  geocode(
    input: { placeId?: string; address?: string },
    _sessionToken?: string,
    bias?: SearchBias | null,
  ): Promise<GeoPlace | null> {
    const params: Record<string, string> = input.placeId
      ? { place_id: input.placeId }
      : {
          address: input.address ?? '',
          components: bias ? `country:AR|locality:${bias.locality}` : 'country:AR',
        };
    return this.geocodeRequest(params);
  }

  reverseGeocode(lat: number, lng: number): Promise<GeoPlace | null> {
    return this.geocodeRequest({ latlng: `${lat},${lng}`, result_type: 'street_address|premise|route' });
  }

  private async geocodeRequest(params: Record<string, string>): Promise<GeoPlace | null> {
    const query = new URLSearchParams({ ...params, language: 'es', region: 'ar', key: this.apiKey! });
    const res = await this.http(`https://maps.googleapis.com/maps/api/geocode/json?${query.toString()}`);
    // Sin la URL en el error: lleva la key.
    if (!res.ok) throw new Error(`Geocoding respondió ${res.status}`);
    const body = (await res.json()) as {
      status: string;
      results?: { formatted_address: string; address_components: GoogleComponent[] }[];
    };
    if (body.status === 'ZERO_RESULTS') return null;
    if (body.status !== 'OK' || !body.results?.length) throw new Error(`Geocoding: ${body.status}`);
    return placeFromGoogle(body.results[0]);
  }
}
