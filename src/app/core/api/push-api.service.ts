import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_URL } from './api.config';

export interface PushConfig {
  /** false = el servidor no manda push (apagado o sin claves): no se ofrece. */
  enabled: boolean;
  publicKey: string | null;
}

/** /me/push: dispositivos para los avisos push. El endpoint viaja siempre en el body. */
@Injectable({ providedIn: 'root' })
export class PushApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_URL);

  config(): Observable<PushConfig> {
    return this.http.get<PushConfig>(`${this.baseUrl}/me/push/config`);
  }

  subscribe(subscription: PushSubscriptionJSON): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/me/push/subscriptions`, {
      endpoint: subscription.endpoint,
      keys: { p256dh: subscription.keys?.['p256dh'], auth: subscription.keys?.['auth'] },
    });
  }

  status(endpoint: string): Observable<{ subscribed: boolean }> {
    return this.http.post<{ subscribed: boolean }>(`${this.baseUrl}/me/push/subscriptions/status`, { endpoint });
  }

  remove(endpoint: string): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/me/push/subscriptions/remove`, { endpoint });
  }
}
