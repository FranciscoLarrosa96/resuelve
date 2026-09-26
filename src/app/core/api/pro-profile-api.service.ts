import { HttpClient, HttpEvent } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  CreateProfessionalProfile,
  LicenseSubmission,
  OwnProfessional,
  ProfessionalStatus,
  UpdateProfessionalProfile,
  UploadTicket,
} from '../models/pro-profile';
import { API_URL } from './api.config';

export type { CreateProfessionalProfile, OwnProfessional } from '../models/pro-profile';

/**
 * Perfil propio del profesional autenticado (ProProfileController +
 * VerificationsController). Plan y uso existen en el contrato pero la UI no
 * los muestra hasta que los planes comerciales estén definidos.
 */
@Injectable({ providedIn: 'root' })
export class ProProfileApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_URL);

  createProfile(body: CreateProfessionalProfile): Observable<OwnProfessional> {
    return this.http.post<OwnProfessional>(`${this.baseUrl}/pro/profile`, body);
  }

  getMe(): Observable<OwnProfessional> {
    return this.http.get<OwnProfessional>(`${this.baseUrl}/pro/me`);
  }

  updateProfile(patch: UpdateProfessionalProfile): Observable<OwnProfessional> {
    return this.http.patch<OwnProfessional>(`${this.baseUrl}/pro/profile`, patch);
  }

  /** Pausar / reactivar el perfil (no toca "Disponible hoy"). */
  setStatus(status: ProfessionalStatus): Observable<OwnProfessional> {
    return this.http.patch<OwnProfessional>(`${this.baseUrl}/pro/status`, { status });
  }

  /** PATCH /pro/availability: "Disponible hoy" persiste y vence a medianoche (hora de Argentina). */
  setAvailability(availableToday: boolean): Observable<OwnProfessional> {
    return this.http.patch<OwnProfessional>(`${this.baseUrl}/pro/availability`, { availableToday });
  }

  // ---- Matrícula ---------------------------------------------------------

  /** Firma temporal: el archivo va directo al almacenamiento privado, no a la API. */
  uploadTicket(serviceId: string): Observable<UploadTicket> {
    return this.http.post<UploadTicket>(`${this.baseUrl}/pro/verifications/upload`, { serviceId });
  }

  /**
   * Sube el documento con la firma (multipart). Fuera de nuestra API: el
   * interceptor no agrega el token. Emite eventos para mostrar el progreso.
   */
  uploadDocument(ticket: UploadTicket, file: File): Observable<HttpEvent<unknown>> {
    const form = new FormData();
    for (const [key, value] of Object.entries(ticket.fields)) form.append(key, value);
    form.append('file', file);
    return this.http.post(ticket.uploadUrl, form, { reportProgress: true, observe: 'events' });
  }

  submitLicense(body: LicenseSubmission): Observable<OwnProfessional> {
    return this.http.post<OwnProfessional>(`${this.baseUrl}/pro/verifications`, body);
  }
}
