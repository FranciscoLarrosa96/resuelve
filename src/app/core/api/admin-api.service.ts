import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  AdminReport,
  AdminReportList,
  AdminReportView,
  AdminListView, AdminVerification, AdminVerificationDetail, AdminVerificationList,
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
}
