import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { AddressSuggestion, ResolvedLocation } from '../models/location';
import { API_URL } from './api.config';

/**
 * Único punto del frontend que habla de direcciones. El proveedor real
 * (Google u otro) vive detrás del backend: acá no hay keys, SDKs ni llamadas
 * directas. Todo por POST para que la dirección y las coordenadas no queden
 * en URLs.
 */
@Injectable({ providedIn: 'root' })
export class LocationApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_URL);

  /** false = sin proveedor configurado: dirección a mano + barrios. */
  enabled(): Observable<boolean> {
    return this.http.get<{ enabled: boolean }>(`${this.baseUrl}/location/config`).pipe(map((r) => r.enabled));
  }

  autocomplete(query: string, sessionToken: string): Observable<AddressSuggestion[]> {
    return this.http
      .post<{ items: AddressSuggestion[] }>(`${this.baseUrl}/location/autocomplete`, { query, sessionToken })
      .pipe(map((r) => r.items));
  }

  resolve(
    input: { placeId: string; selectedAddress?: string } | { address: string },
    sessionToken?: string,
  ): Observable<ResolvedLocation | null> {
    return this.http
      .post<{ result: ResolvedLocation | null }>(`${this.baseUrl}/location/resolve`, { ...input, sessionToken })
      .pipe(map((r) => r.result));
  }

  /** "Usar mi ubicación": las coordenadas se usan para esta consulta y se descartan (no se guardan). */
  reverse(lat: number, lng: number): Observable<ResolvedLocation | null> {
    return this.http
      .post<{ result: ResolvedLocation | null }>(`${this.baseUrl}/location/reverse`, { lat, lng })
      .pipe(map((r) => r.result));
  }
}
