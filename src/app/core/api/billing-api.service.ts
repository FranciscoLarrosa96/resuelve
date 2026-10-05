import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { BillingStatus, CheckoutSession } from '../models/billing';
import { API_URL } from './api.config';

/**
 * Suscripción a Resuelve PRO (Mercado Pago). Nunca se llama a Mercado Pago
 * desde acá ni se manda un precio: el backend decide monto y oferta.
 */
@Injectable({ providedIn: 'root' })
export class BillingApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_URL);

  getStatus(): Observable<BillingStatus> {
    return this.http.get<BillingStatus>(`${this.baseUrl}/billing/pro/status`);
  }

  /** `returnTo`: ruta interna del panel a la que volver después de activar. */
  createCheckout(returnTo?: string): Observable<CheckoutSession> {
    return this.http.post<CheckoutSession>(`${this.baseUrl}/billing/pro/checkout`, returnTo ? { returnTo } : {});
  }

  /** Botón de arrepentimiento: revoca la contratación y devuelve lo cobrado. */
  withdraw(): Observable<BillingStatus> {
    return this.http.post<BillingStatus>(`${this.baseUrl}/billing/pro/withdraw`, {});
  }

  cancel(): Observable<BillingStatus> {
    return this.http.post<BillingStatus>(`${this.baseUrl}/billing/pro/cancel`, {});
  }
}
