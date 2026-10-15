import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { API_URL } from './api.config';

export type SuggestionStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export interface ServiceSuggestion {
  id: string;
  name: string;
  status: SuggestionStatus;
  reason: string | null;
  createdAt: string;
  reviewedAt: string | null;
  serviceId: string | null;
  serviceName: string | null;
  serviceActive: boolean;
}
export interface SuggestionList { items: ServiceSuggestion[]; total: number; page: number; pageSize: number; }
export interface ApproveServiceInput { serviceId?: string; name?: string; categoryId?: string; requiresLicense?: boolean; }

@Injectable({ providedIn: 'root' })
export class ServiceSuggestionsApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_URL);
  mine() { return this.http.get<ServiceSuggestion[]>(`${this.base}/service-suggestions`); }
  suggest(name: string) { return this.http.post<ServiceSuggestion>(`${this.base}/service-suggestions`, { name }); }
  list(status: SuggestionStatus, page: number) { return this.http.get<SuggestionList>(`${this.base}/admin/service-suggestions`, { params: { status, page } }); }
  approve(id: string, input: ApproveServiceInput) { return this.http.post<ServiceSuggestion>(`${this.base}/admin/service-suggestions/${id}/approve`, input); }
  reject(id: string, reason: string) { return this.http.post<ServiceSuggestion>(`${this.base}/admin/service-suggestions/${id}/reject`, { reason }); }
}
