import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ProfessionalSummary } from '../models/professional';
import { API_URL } from './api.config';

/**
 * GET /pro/me (presentOwnProfessional): lo público + plan y uso. La UI solo
 * usa la identidad y `availableToday`; plan y uso no se muestran hasta que
 * los planes comerciales estén definidos.
 */
export interface OwnProfessional extends ProfessionalSummary {
  planTier: 'FREE' | 'PRO';
  monthlyRequestUsage: number;
  monthlyRequestLimit: number | null;
}

/** Perfil propio del profesional autenticado (ProProfileController). */
@Injectable({ providedIn: 'root' })
export class ProProfileApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_URL);

  getMe(): Observable<OwnProfessional> {
    return this.http.get<OwnProfessional>(`${this.baseUrl}/pro/me`);
  }

  /** PATCH /pro/availability: "Disponible hoy" persiste y vence a medianoche (hora de Argentina). */
  setAvailability(availableToday: boolean): Observable<OwnProfessional> {
    return this.http.patch<OwnProfessional>(`${this.baseUrl}/pro/availability`, { availableToday });
  }
}
