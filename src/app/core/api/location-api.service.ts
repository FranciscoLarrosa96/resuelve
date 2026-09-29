import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { AddressSuggestion, LocationConfig, ResolvedLocation } from '../models/location';
import { API_URL } from './api.config';

/**
 * Único punto del frontend que habla de direcciones. El proveedor vive detrás
 * del backend: acá no hay keys ni llamadas directas a Geoapify. Todo por POST
 * para que la dirección y las coordenadas no queden
 * en URLs.
 */
@Injectable({ providedIn: 'root' })
export class LocationApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_URL);

  /** false = sin proveedor configurado: dirección a mano + barrios. */
  enabled(): Observable<LocationConfig> {
    return this.http.get<LocationConfig>(`${this.baseUrl}/location/config`);
  }

  autocomplete(query: string): Observable<AddressSuggestion[]> {
    return this.http
      .post<{ items: AddressSuggestion[] }>(`${this.baseUrl}/location/autocomplete`, { query })
      .pipe(map((r) => r.items));
  }

  resolve(
    input: { placeId: string; selectedAddress?: string } | { address: string },
    sessionToken?: string,
  ): Observable<ResolvedLocation | null> {
    return this.http
      .post<{ result: ResolvedLocation | null }>(`${this.baseUrl}/location/resolve`, input)
      .pipe(map((r) => r.result));
  }

  /** Reverse geocoding: la UI solo persiste coordenadas cuando el cliente confirma el punto. */
  reverse(lat: number, lng: number): Observable<ResolvedLocation | null> {
    return this.http
      .post<{ result: ResolvedLocation | null }>(`${this.baseUrl}/location/reverse`, { lat, lng })
      .pipe(map((r) => r.result));
  }
}
