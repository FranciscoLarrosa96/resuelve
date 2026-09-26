import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AgendaItem, ProposeAppointmentPayload } from '../models/agenda';
import { ProServiceRequest, ServiceRequest } from '../models/request';
import { API_URL } from './api.config';

/**
 * Citas de trabajo (AppointmentsController + ProAppointmentsController).
 * Cada acción devuelve la solicitud actualizada vista por quien actúa; el
 * frontend usa esa respuesta y nunca decide un estado por su cuenta.
 * Ningún POST se reintenta solo.
 */
@Injectable({ providedIn: 'root' })
export class AppointmentsApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_URL);

  // ---- Profesional elegido --------------------------------------------
  propose(requestId: string, payload: ProposeAppointmentPayload): Observable<ProServiceRequest> {
    return this.http.post<ProServiceRequest>(`${this.proRequest(requestId)}/appointments`, payload);
  }

  /** Misma operación que el cliente (POST /requests/:id/complete): el backend identifica al actor. */
  complete(requestId: string): Observable<ProServiceRequest> {
    return this.http.post<ProServiceRequest>(`${this.baseUrl}/requests/${encodeURIComponent(requestId)}/complete`, {});
  }

  cancelAsProfessional(appointmentId: string): Observable<ProServiceRequest> {
    return this.http.post<ProServiceRequest>(`${this.url(appointmentId)}/cancel`, {});
  }

  /** Agenda: citas que se cruzan con [from, to). El rango lo resuelve el backend (máx. 62 días). */
  agenda(from: string, to: string): Observable<AgendaItem[]> {
    const params = new HttpParams().set('from', from).set('to', to);
    return this.http.get<AgendaItem[]>(`${this.baseUrl}/pro/appointments`, { params });
  }

  /** Pendientes de cierre de cualquier semana (horario confirmado ya terminado, sin marcar realizado). */
  completionDue(): Observable<AgendaItem[]> {
    return this.http.get<AgendaItem[]>(`${this.baseUrl}/pro/appointments/completion-due`);
  }

  // ---- Cliente dueño --------------------------------------------------
  confirm(appointmentId: string): Observable<ServiceRequest> {
    return this.http.post<ServiceRequest>(`${this.url(appointmentId)}/confirm`, {});
  }

  decline(appointmentId: string): Observable<ServiceRequest> {
    return this.http.post<ServiceRequest>(`${this.url(appointmentId)}/decline`, {});
  }

  cancelAsClient(appointmentId: string): Observable<ServiceRequest> {
    return this.http.post<ServiceRequest>(`${this.url(appointmentId)}/cancel`, {});
  }

  private url(id: string): string {
    return `${this.baseUrl}/appointments/${encodeURIComponent(id)}`;
  }

  private proRequest(id: string): string {
    return `${this.baseUrl}/pro/requests/${encodeURIComponent(id)}`;
  }
}
