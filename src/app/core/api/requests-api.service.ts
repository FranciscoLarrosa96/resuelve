import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  CreateRequestPayload,
  CreateReviewPayload,
  OwnReview,
  RequestGroup,
  RequestStatus,
  ServiceRequest,
} from '../models/request';
import { API_URL } from './api.config';
import { Paginated } from './api.types';

export interface MyRequestsQuery {
  status?: RequestStatus | null;
  group?: RequestGroup | null;
  page?: number;
  pageSize?: number;
}

/**
 * Solicitudes del cliente autenticado (RequestsController). Todas exigen
 * sesión (el interceptor agrega el Bearer). Ninguna se reintenta sola: los
 * POST no son idempotentes en el backend.
 */
@Injectable({ providedIn: 'root' })
export class RequestsApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_URL);

  /** Crea la solicitud en DRAFT. */
  createRequest(payload: CreateRequestPayload): Observable<ServiceRequest> {
    return this.http.post<ServiceRequest>(`${this.baseUrl}/requests`, payload);
  }

  /** Actualiza una solicitud propia (solo DRAFT permite cambiar el servicio). */
  updateRequest(id: string, payload: Partial<CreateRequestPayload>): Observable<ServiceRequest> {
    return this.http.patch<ServiceRequest>(this.url(id), payload);
  }

  /** Pide presupuesto (máx. 3 en total). DRAFT → WAITING_QUOTES. Ya invitados no se duplican. */
  inviteProfessionals(requestId: string, professionalIds: string[]): Observable<ServiceRequest> {
    return this.http.post<ServiceRequest>(`${this.url(requestId)}/invitations`, { professionalIds });
  }

  getMyRequests(query: MyRequestsQuery = {}): Observable<Paginated<ServiceRequest>> {
    let params = new HttpParams();
    if (query.status) params = params.set('status', query.status);
    if (query.group) params = params.set('group', query.group);
    if (query.page) params = params.set('page', query.page);
    if (query.pageSize) params = params.set('pageSize', query.pageSize);
    return this.http.get<Paginated<ServiceRequest>>(`${this.baseUrl}/requests/mine`, { params });
  }

  /** 404 si no existe o no es del usuario. */
  getRequestById(id: string): Observable<ServiceRequest> {
    return this.http.get<ServiceRequest>(this.url(id));
  }

  cancelRequest(id: string): Observable<ServiceRequest> {
    return this.http.post<ServiceRequest>(`${this.url(id)}/cancel`, {});
  }

  /**
   * "Sí, se realizó": cita y solicitud COMPLETED (solo después del horario
   * confirmado). Lo puede hacer el cliente o el profesional elegido.
   */
  complete(id: string): Observable<ServiceRequest> {
    return this.http.post<ServiceRequest>(`${this.url(id)}/complete`, {});
  }

  /** Una reseña por trabajo realizado (409 si ya existe o no corresponde). No cambia el estado. */
  createReview(requestId: string, payload: CreateReviewPayload): Observable<OwnReview> {
    return this.http.post<OwnReview>(`${this.url(requestId)}/review`, payload);
  }

  private url(id: string): string {
    return `${this.baseUrl}/requests/${encodeURIComponent(id)}`;
  }
}
