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
  AdminTransfer,
  AdminTransferAccount,
  AdminTransferAccountInput,
  AdminTransferDetail,
  AdminTransferList,
  AdminTransferStatus,
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

  /** PRO manual de cortesía: `days` desde hoy, o sin vencimiento. */
  grantPro(id: string, days: number | null): Observable<AdminUserDetail> {
    return this.http.post<AdminUserDetail>(
      `${this.baseUrl}/admin/users/${id}/plan/grant`,
      days ? { days } : {},
    );
  }

  /** Quita el PRO manual (no toca la suscripción paga). */
  revokePro(id: string): Observable<AdminUserDetail> {
    return this.http.post<AdminUserDetail>(`${this.baseUrl}/admin/users/${id}/plan/revoke`, {});
  }

  /** Cancela la renovación en Mercado Pago (misma regla que "Mi plan"). */
  cancelSubscription(id: string): Observable<AdminUserDetail> {
    return this.http.post<AdminUserDetail>(
      `${this.baseUrl}/admin/users/${id}/subscription/cancel`,
      {},
    );
  }

  /** Anota un pago por transferencia recibido por fuera: PRO por `months` con el monto que llegó. */
  recordTransfer(id: string, input: { months: number; amountArs: number; note?: string }): Observable<{ ok: true }> {
    return this.http.post<{ ok: true }>(`${this.baseUrl}/admin/users/${id}/plan/transfer`, input);
  }

  // ---- Pagos por transferencia ----------------------------------------------

  transfers(status: AdminTransferStatus | null): Observable<AdminTransferList> {
    return this.http.get<AdminTransferList>(`${this.baseUrl}/admin/transfers`, { params: status ? { status } : {} });
  }

  transfer(id: string): Observable<AdminTransferDetail> {
    return this.http.get<AdminTransferDetail>(`${this.baseUrl}/admin/transfers/${id}`);
  }

  approveTransfer(id: string, note: string): Observable<AdminTransferDetail> {
    return this.http.post<AdminTransferDetail>(`${this.baseUrl}/admin/transfers/${id}/approve`, note ? { note } : {});
  }

  rejectTransfer(id: string, reason: string): Observable<AdminTransferDetail> {
    return this.http.post<AdminTransferDetail>(`${this.baseUrl}/admin/transfers/${id}/reject`, { reason });
  }

  markTransferRefunded(id: string): Observable<AdminTransfer> {
    return this.http.post<AdminTransferDetail>(`${this.baseUrl}/admin/transfers/${id}/refunded`, {});
  }

  transferAccount(): Observable<AdminTransferAccount | null> {
    return this.http.get<AdminTransferAccount | null>(`${this.baseUrl}/admin/transfer-account`);
  }

  setTransferAccount(input: AdminTransferAccountInput): Observable<AdminTransferAccount> {
    return this.http.put<AdminTransferAccount>(`${this.baseUrl}/admin/transfer-account`, input);
  }

  /** Borrado definitivo: `confirmEmail` tiene que ser el email actual de la cuenta. */
  purgeUser(id: string, confirmEmail: string): Observable<{ purged: true }> {
    return this.http.post<{ purged: true }>(`${this.baseUrl}/admin/users/${id}/purge`, { confirmEmail });
  }
}
