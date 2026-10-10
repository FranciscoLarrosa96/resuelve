import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { Zone } from '../models/category';
import { LocalityDetail, LocalityOption, Province, ServedLocality } from '../models/locality';
import { API_URL } from './api.config';

/** Catálogo geográfico: GET /provinces, /localities, /localities/:id(/neighborhoods). */
@Injectable({ providedIn: 'root' })
export class LocalitiesApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_URL);

  provinces(): Observable<Province[]> {
    return this.http.get<Province[]>(`${this.baseUrl}/provinces`);
  }

  /** Autocompletar (máx. 20). Sin texto: localidades que ya tienen profesionales. */
  search(text: string, limit = 8): Observable<LocalityOption[]> {
    let params = new HttpParams().set('limit', limit);
    if (text.trim()) params = params.set('search', text.trim());
    return this.http
      .get<{ items: LocalityOption[] }>(`${this.baseUrl}/localities`, { params })
      .pipe(map((r) => r.items));
  }

  get(id: string, service?: string): Observable<LocalityDetail> {
    const params = service ? { service } : undefined;
    return this.http.get<LocalityDetail>(`${this.baseUrl}/localities/${encodeURIComponent(id)}`, {
      params,
    });
  }

  /** URL semántica (`/ciudades/:provincia/:localidad`). */
  getBySlug(
    provinceSlug: string,
    localitySlug: string,
    service?: string,
  ): Observable<LocalityDetail> {
    const params = service ? { service } : undefined;
    return this.http.get<LocalityDetail>(
      `${this.baseUrl}/provinces/${encodeURIComponent(provinceSlug)}/localities/${encodeURIComponent(localitySlug)}`,
      { params },
    );
  }

  neighborhoods(id: string): Observable<Zone[]> {
    return this.http.get<Zone[]>(
      `${this.baseUrl}/localities/${encodeURIComponent(id)}/neighborhoods`,
    );
  }

  served(service?: string): Observable<ServedLocality[]> {
    const params = service ? { service } : undefined;
    return this.http
      .get<{ items: ServedLocality[] }>(`${this.baseUrl}/localities/served`, { params })
      .pipe(map((r) => r.items));
  }
}
