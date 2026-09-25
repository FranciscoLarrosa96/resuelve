import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { InvitationStatus, ProServiceRequest } from '../models/request';
import { API_URL } from './api.config';
import { Paginated } from './api.types';

export interface ProRequestsQuery {
  status?: InvitationStatus | null;
  page?: number;
  pageSize?: number;
}

/**
 * Solicitudes que recibió el profesional autenticado (ProRequestsController).
 * El backend exige ProfessionalProfile (403 PROFESSIONAL_PROFILE_REQUIRED),
 * filtra por invitación y decide qué datos del cliente salen.
 */
@Injectable({ providedIn: 'root' })
export class ProRequestsApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_URL);

  getRequests(query: ProRequestsQuery = {}): Observable<Paginated<ProServiceRequest>> {
    let params = new HttpParams();
    if (query.status) params = params.set('status', query.status);
    if (query.page) params = params.set('page', query.page);
    if (query.pageSize) params = params.set('pageSize', query.pageSize);
    return this.http.get<Paginated<ProServiceRequest>>(`${this.baseUrl}/pro/requests`, { params });
  }

  /** 404 si no lo invitaron. */
  getRequestById(id: string): Observable<ProServiceRequest> {
    return this.http.get<ProServiceRequest>(this.url(id));
  }

  /** "No disponible": la invitación pasa a DECLINED (solo desde PENDING). */
  decline(id: string): Observable<ProServiceRequest> {
    return this.http.post<ProServiceRequest>(`${this.url(id)}/decline`, {});
  }

  private url(id: string): string {
    return `${this.baseUrl}/pro/requests/${encodeURIComponent(id)}`;
  }
}
