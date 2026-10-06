import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { NotificationAudience, NotificationSection, NotificationsPage, NotificationsSummary } from '../models/notification';
import { SKIP_AUTH } from './auth-api.service';
import { API_URL } from './api.config';

/** Notificaciones in-app del usuario autenticado (NotificationsController). Sin push ni WebSocket. */
@Injectable({ providedIn: 'root' })
export class NotificationsApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_URL);

  summary(): Observable<NotificationsSummary> {
    return this.http.get<NotificationsSummary>(`${this.url()}/summary`);
  }

  /** Una página (20 por defecto) del centro de notificaciones de un modo, más nuevas primero. */
  list(
    audience: NotificationAudience,
    opts: { page?: number; pageSize?: number; unread?: boolean } = {},
  ): Observable<NotificationsPage> {
    let params = new HttpParams().set('audience', audience);
    if (opts.page) params = params.set('page', opts.page);
    if (opts.pageSize) params = params.set('pageSize', opts.pageSize);
    if (opts.unread) params = params.set('unread', true);
    return this.http.get<NotificationsPage>(this.url(), { params });
  }

  /** Las no leídas más recientes de un modo (máx. 50): alimentan las novedades por solicitud. */
  unread(audience: NotificationAudience): Observable<NotificationsPage> {
    return this.list(audience, { pageSize: 50, unread: true });
  }

  /** Abre una notificación propia: queda leída. Devuelve el resumen actualizado. */
  open(id: string): Observable<NotificationsSummary> {
    return this.http.patch<NotificationsSummary>(`${this.url()}/${encodeURIComponent(id)}/read`, {});
  }

  /** "Marcar todas como leídas" del modo pedido. Devuelve el resumen actualizado. */
  readAll(audience: NotificationAudience): Observable<NotificationsSummary> {
    const params = new HttpParams().set('audience', audience);
    return this.http.patch<NotificationsSummary>(`${this.url()}/read-all`, {}, { params });
  }

  /** Marca leídas las de ESA solicitud en ese modo (y, si se indica, solo esa sección). Devuelve el resumen actualizado. */
  readByRequest(
    requestId: string,
    audience: NotificationAudience,
    section?: NotificationSection,
  ): Observable<NotificationsSummary> {
    let params = new HttpParams().set('audience', audience);
    if (section) params = params.set('section', section);
    return this.http.patch<NotificationsSummary>(
      `${this.url()}/read-by-request/${encodeURIComponent(requestId)}`,
      {},
      { params },
    );
  }

  private url(): string {
    return `${this.baseUrl}/me/notifications`;
  }

  /** Prender o apagar los avisos de actividad por email de la cuenta. */
  setEmailPreference(enabled: boolean): Observable<{ enabled: boolean }> {
    return this.http.patch<{ enabled: boolean }>(`${this.url()}/email-preference`, { enabled });
  }

  /** Baja desde el enlace del email: sin sesión, firmada con el token del mensaje. */
  unsubscribeEmail(token: string): Observable<void> {
    return this.http.post<void>(
      `${this.baseUrl}/notifications/email-unsubscribe`,
      { token },
      { context: new HttpContext().set(SKIP_AUTH, true) },
    );
  }
}
