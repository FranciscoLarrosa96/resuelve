import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_URL } from './api.config';
import { ApiCategory, ApiProfessional, ApiZone, Paginated, ProfessionalSearch } from './api.types';

/**
 * Cliente HTTP mínimo para el backend. Todavía no lo usan los stores:
 * la integración (reemplazar mocks por estas llamadas) es la próxima fase.
 */
@Injectable({ providedIn: 'root' })
export class ApiClient {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_URL);

  /** false mientras environment.apiUrl esté vacía. */
  get enabled(): boolean {
    return !!this.baseUrl;
  }

  categories(): Observable<ApiCategory[]> {
    return this.http.get<ApiCategory[]>(`${this.baseUrl}/categories`);
  }

  zones(city = 'tandil'): Observable<ApiZone[]> {
    return this.http.get<ApiZone[]>(`${this.baseUrl}/zones`, { params: { city } });
  }

  professionals(search: ProfessionalSearch = {}): Observable<Paginated<ApiProfessional>> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(search)) {
      if (value !== undefined && value !== null && value !== '') params = params.set(key, String(value));
    }
    return this.http.get<Paginated<ApiProfessional>>(`${this.baseUrl}/professionals`, { params });
  }

  professional(id: string): Observable<ApiProfessional> {
    return this.http.get<ApiProfessional>(`${this.baseUrl}/professionals/${id}`);
  }
}
