import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  AdminProPricing,
  AdminReport,
  AdminReportList,
  AdminReportView,
  AdminListView, AdminVerification, AdminVerificationDetail, AdminVerificationList,
  AdminUserDetail,
  AdminUserKind,
  AdminUserList,
} from '../models/admin';
import { API_URL } from './api.config';

/** /admin/verifications: revisión de matrículas (solo admin). */
@Injectable({ providedIn: 'root' })
export class AdminApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_URL);

  list(status: AdminListView): Observable<AdminVerificationList> {
    return this.http.get<AdminVerificationList>(`${this.baseUrl}/admin/verifications`, { params: { status } });
  }

  show(id: string): Observable<AdminVerificationDetail> {
    return this.http.get<AdminVerificationDetail>(`${this.baseUrl}/admin/verifications/${id}`);
  }

  /** `expiresAt` en YYYY-MM-DD: vigente hasta el final de ese día (hora de Argentina). */
  approve(id: string, expiresAt: string | null): Observable<AdminVerification> {
    return this.http.post<AdminVerification>(
      `${this.baseUrl}/admin/verifications/${id}/approve`,
      expiresAt ? { expiresAt } : {},
    );
  }

  reject(id: string, reason: string): Observable<AdminVerification> {
    return this.http.post<AdminVerification>(`${this.baseUrl}/admin/verifications/${id}/reject`, { reason });
  }

  purgeDocument(id: string): Observable<AdminVerification> {
    return this.http.post<AdminVerification>(`${this.baseUrl}/admin/verifications/${id}/purge-document`, {});
  }

  /** /admin/reports: reportes de reseñas. */
  reports(status: AdminReportView): Observable<AdminReportList> {
    return this.http.get<AdminReportList>(`${this.baseUrl}/admin/reports`, { params: { status } });
  }

  hideReview(reportId: string, reason: string): Observable<AdminReport> {
    return this.http.post<AdminReport>(`${this.baseUrl}/admin/reports/${reportId}/hide`, { reason });
  }

  dismissReport(reportId: string): Observable<AdminReport> {
    return this.http.post<AdminReport>(`${this.baseUrl}/admin/reports/${reportId}/dismiss`, {});
  }

  restoreReview(reviewId: string): Observable<{ restored: true }> {
    return this.http.post<{ restored: true }>(`${this.baseUrl}/admin/reports/reviews/${reviewId}/restore`, {});
  }

  /** /admin/pricing: precio mensual de PRO (rige para suscripciones nuevas). */
  pricing(): Observable<AdminProPricing> {
    return this.http.get<AdminProPricing>(`${this.baseUrl}/admin/pricing`);
  }

  setPricing(monthlyPriceArs: number): Observable<AdminProPricing> {
    return this.http.put<AdminProPricing>(`${this.baseUrl}/admin/pricing`, { monthlyPriceArs });
  }

  /** /admin/users: gestión de usuarios. */
  users(params: { q: string; kind: AdminUserKind; page: number }): Observable<AdminUserList> {
    const query: Record<string, string | number> = { kind: params.kind, page: params.page };
    if (params.q.trim()) query['q'] = params.q.trim();
    return this.http.get<AdminUserList>(`${this.baseUrl}/admin/users`, { params: query });
  }

  user(id: string): Observable<AdminUserDetail> {
    return this.http.get<AdminUserDetail>(`${this.baseUrl}/admin/users/${id}`);
  }

  /** Misma baja de cuenta (anonimiza); devuelve el detalle actualizado. */
  deactivateUser(id: string): Observable<AdminUserDetail> {
    return this.http.post<AdminUserDetail>(`${this.baseUrl}/admin/users/${id}/deactivate`, {});
  }

  /** Borrado definitivo: `confirmEmail` tiene que ser el email actual de la cuenta. */
  purgeUser(id: string, confirmEmail: string): Observable<{ purged: true }> {
    return this.http.post<{ purged: true }>(`${this.baseUrl}/admin/users/${id}/purge`, { confirmEmail });
  }
}
