import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { CreateQuotePayload, Quote } from '../models/quote';
import { ServiceRequest } from '../models/request';
import { API_URL } from './api.config';

/** Presupuestos: lado cliente (listar, aceptar) y lado profesional (crear). */
@Injectable({ providedIn: 'root' })
export class QuotesApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_URL);

  /** Presupuestos de una solicitud propia (sin los retirados), ordenados por total. */
  getQuotesForRequest(requestId: string): Observable<Quote[]> {
    return this.http.get<Quote[]>(`${this.baseUrl}/requests/${encodeURIComponent(requestId)}/quotes`);
  }

  /**
   * Acepta un presupuesto. Transaccional en el backend: una sola aceptación
   * gana; las demás reciben 409. Devuelve la solicitud actualizada.
   */
  acceptQuote(quoteId: string): Observable<ServiceRequest> {
    return this.http.post<ServiceRequest>(`${this.baseUrl}/quotes/${encodeURIComponent(quoteId)}/accept`, {});
  }

  /** Profesional: 409 QUOTE_ALREADY_EXISTS si ya tiene uno activo en la solicitud. */
  createQuote(requestId: string, payload: CreateQuotePayload): Observable<Quote> {
    return this.http.post<Quote>(`${this.baseUrl}/pro/requests/${encodeURIComponent(requestId)}/quote`, payload);
  }
}
