import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AppNotification, NotificationAudience, NotificationsSummary } from '../models/notification';
import { API_URL } from './api.config';

/** Notificaciones in-app del usuario autenticado (NotificationsController). Sin push ni WebSocket. */
@Injectable({ providedIn: 'root' })
export class NotificationsApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_URL);

  summary(): Observable<NotificationsSummary> {
    return this.http.get<NotificationsSummary>(`${this.url()}/summary`);
  }

  /** Últimas no leídas de un modo (máx. 50). */
  unread(audience: NotificationAudience): Observable<AppNotification[]> {
    const params = new HttpParams().set('audience', audience).set('unread', true);
    return this.http.get<AppNotification[]>(this.url(), { params });
  }

  /** Marca leídas las de ESA solicitud en ese modo. Devuelve el resumen actualizado. */
  readByRequest(requestId: string, audience: NotificationAudience): Observable<NotificationsSummary> {
    const params = new HttpParams().set('audience', audience);
    return this.http.patch<NotificationsSummary>(
      `${this.url()}/read-by-request/${encodeURIComponent(requestId)}`,
      {},
      { params },
    );
  }

  private url(): string {
    return `${this.baseUrl}/me/notifications`;
  }
}
