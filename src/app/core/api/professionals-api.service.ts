import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  InvitedReviewStatus,
  ProfessionalDetail,
  ProfessionalFilters,
  ProfessionalReview,
  ProfessionalSummary,
  ReviewReportReason,
} from '../models/professional';
import { API_URL } from './api.config';
import { Paginated } from './api.types';

/** Profesionales públicos: GET /professionals, GET /professionals/:id y sus reseñas. */
@Injectable({ providedIn: 'root' })
export class ProfessionalsApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_URL);

  /** Paginado. Orden fijo del backend: toman urgencias ahora, rating, cantidad de reseñas. */
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

  getProfessionalBySlug(slug: string): Observable<ProfessionalDetail> {
    return this.http.get<ProfessionalDetail>(`${this.baseUrl}/professionals/public/${encodeURIComponent(slug)}`);
  }

  /** Reseñas públicas paginadas, más recientes primero. */
  getReviews(
    id: string,
    page: number,
    pageSize: number,
    slug?: string,
    kind: 'verified' | 'invited' = 'verified',
  ): Observable<Paginated<ProfessionalReview>> {
    const params = new HttpParams().set('page', page).set('pageSize', pageSize).set('kind', kind);
    return this.http.get<Paginated<ProfessionalReview>>(
      `${this.baseUrl}/professionals/${slug ? 'public/' + encodeURIComponent(slug) : encodeURIComponent(id)}/reviews`,
      { params },
    );
  }

  /** Con sesión: si puede dejar una reseña por invitación a este profesional o por qué no. */
  getInvitedReviewStatus(id: string): Observable<InvitedReviewStatus> {
    return this.http.get<InvitedReviewStatus>(`${this.baseUrl}/professionals/${encodeURIComponent(id)}/invited-review`);
  }

  createInvitedReview(
    id: string,
    payload: { rating: number; comment?: string },
  ): Observable<NonNullable<InvitedReviewStatus['review']>> {
    return this.http.post<NonNullable<InvitedReviewStatus['review']>>(
      `${this.baseUrl}/professionals/${encodeURIComponent(id)}/invited-review`,
      payload,
    );
  }

  /** Sin cuenta: nombre de pila y correo (privado; solo evita reseñas repetidas). */
  createGuestReview(
    id: string,
    payload: { rating: number; comment?: string; name: string; email: string },
  ): Observable<NonNullable<InvitedReviewStatus['review']>> {
    return this.http.post<NonNullable<InvitedReviewStatus['review']>>(
      `${this.baseUrl}/professionals/${encodeURIComponent(id)}/guest-review`,
      payload,
    );
  }

  /** Reporta una reseña pública (requiere sesión). No la oculta: la revisa un administrador. */
  reportReview(reviewId: string, payload: { reason: ReviewReportReason; details?: string }): Observable<{ reported: true }> {
    return this.http.post<{ reported: true }>(`${this.baseUrl}/reviews/${encodeURIComponent(reviewId)}/report`, payload);
  }
}
