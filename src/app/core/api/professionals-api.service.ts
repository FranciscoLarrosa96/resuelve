import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ProfessionalDetail, ProfessionalFilters, ProfessionalReview, ProfessionalSummary } from '../models/professional';
import { API_URL } from './api.config';
import { Paginated } from './api.types';

/** Profesionales públicos: GET /professionals, GET /professionals/:id y sus reseñas. */
@Injectable({ providedIn: 'root' })
export class ProfessionalsApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_URL);

  /** Paginado. Orden fijo del backend: disponibles hoy, rating, cantidad de reseñas. */
  getProfessionals(filters: ProfessionalFilters = {}): Observable<Paginated<ProfessionalSummary>> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(filters) as [keyof ProfessionalFilters, unknown][]) {
      if (value === undefined || value === null || value === '' || value === false) continue;
      params = params.set(key, String(value));
    }
    return this.http.get<Paginated<ProfessionalSummary>>(`${this.baseUrl}/professionals`, { params });
  }

  getProfessionalById(id: string): Observable<ProfessionalDetail> {
    return this.http.get<ProfessionalDetail>(`${this.baseUrl}/professionals/${encodeURIComponent(id)}`);
  }

  /** Reseñas públicas paginadas, más recientes primero. */
  getReviews(id: string, page: number, pageSize: number): Observable<Paginated<ProfessionalReview>> {
    const params = new HttpParams().set('page', page).set('pageSize', pageSize);
    return this.http.get<Paginated<ProfessionalReview>>(
      `${this.baseUrl}/professionals/${encodeURIComponent(id)}/reviews`,
      { params },
    );
  }
}
