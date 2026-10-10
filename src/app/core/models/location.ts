/** "¿Dónde es el trabajo?" (backend `/location/*`). Nunca lleva coordenadas. */
export interface AddressSuggestion {
  id: string;
  main: string;
  secondary: string | null;
}

export interface ResolvedLocation {
  /** Para precargar "Dirección" ("Alem 455"). */
  address: string;
  formattedAddress: string;
  /** Barrio interno detectado; null = que lo elija la persona. */
  zone: { id: string; name: string } | null;
  outsideCity: boolean;
  /** Localidad del catálogo que corresponde a la dirección (sugerencia; la persona confirma). */
  suggestedLocality?: { id: string; name: string; province: string } | null;
}
