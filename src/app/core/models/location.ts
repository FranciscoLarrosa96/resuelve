/** "¿Dónde es el trabajo?" (backend `/location/*`). Coordenadas solo tras resolver dirección. */
export interface AddressSuggestion {
  id: string;
  main: string;
  secondary: string | null;
  address: string;
}

export interface ResolvedLocation {
  /** Para precargar "Dirección" ("Alem 455"). */
  address: string;
  formattedAddress: string;
  /** Barrio interno detectado; null = que lo elija la persona. */
  zone: { id: string; name: string } | null;
  outsideCity: boolean;
  cityVerified: boolean;
  latitude: number | null;
  longitude: number | null;
  providerPlaceId: string | null;
}

export interface LocationConfig {
  enabled: boolean;
  /** Key pública de tiles, restringida por origen y uso de mapas. */
  mapApiKey: string | null;
}
