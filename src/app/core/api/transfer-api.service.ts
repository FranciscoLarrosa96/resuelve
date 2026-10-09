import { HttpClient, HttpEvent } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { UploadTicket } from '../models/pro-profile';
import { TransferOverview } from '../models/transfer';
import { API_URL } from './api.config';

/**
 * Resuelve PRO por transferencia. El monto nunca viaja desde acá: se elige el
 * período y el backend devuelve el código, el monto y los datos bancarios.
 */
@Injectable({ providedIn: 'root' })
export class TransferApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_URL);

  overview(): Observable<TransferOverview> {
    return this.http.get<TransferOverview>(`${this.baseUrl}/billing/transfer`);
  }

  request(months: number): Observable<TransferOverview> {
    return this.http.post<TransferOverview>(`${this.baseUrl}/billing/transfer`, { months });
  }

  cancel(): Observable<TransferOverview> {
    return this.http.delete<TransferOverview>(`${this.baseUrl}/billing/transfer/pending`);
  }

  /** Firma temporal: el comprobante va directo al almacenamiento privado, no a la API. */
  uploadTicket(): Observable<UploadTicket> {
    return this.http.post<UploadTicket>(`${this.baseUrl}/billing/transfer/proof/upload`, {});
  }

  /** Sube el archivo con la firma (multipart, fuera de nuestra API). */
  uploadFile(ticket: UploadTicket, file: File): Observable<HttpEvent<unknown>> {
    const form = new FormData();
    for (const [key, value] of Object.entries(ticket.fields)) form.append(key, value);
    form.append('file', file);
    return this.http.post(ticket.uploadUrl, form, { reportProgress: true, observe: 'events' });
  }

  /** "Ya transferí", con el comprobante si se subió. */
  submit(proofPublicId?: string): Observable<TransferOverview> {
    return this.http.post<TransferOverview>(`${this.baseUrl}/billing/transfer/submit`, proofPublicId ? { proofPublicId } : {});
  }

  /** Botón de arrepentimiento: `refundTo` = alias o CBU/CVU donde devolver. */
  withdraw(refundTo: string): Observable<TransferOverview> {
    return this.http.post<TransferOverview>(`${this.baseUrl}/billing/transfer/withdraw`, { refundTo });
  }
}
