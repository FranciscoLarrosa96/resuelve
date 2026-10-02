import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { MyProfessionals, ProfessionalRelationship } from '../models/retention';
import { API_URL } from './api.config';

/** Guardar profesionales y "Mis profesionales" (RetentionController). Todo es del usuario autenticado. */
@Injectable({ providedIn: 'root' })
export class RetentionApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_URL);

  mine(): Observable<MyProfessionals> {
    return this.http.get<MyProfessionals>(`${this.baseUrl}/clients/me/professionals`);
  }

  relationship(professionalId: string): Observable<ProfessionalRelationship> {
    return this.http.get<ProfessionalRelationship>(
      `${this.baseUrl}/clients/me/professionals/${encodeURIComponent(professionalId)}`,
    );
  }

  save(professionalId: string): Observable<{ saved: true }> {
    return this.http.post<{ saved: true }>(`${this.baseUrl}/professionals/${encodeURIComponent(professionalId)}/favorite`, {});
  }

  unsave(professionalId: string): Observable<{ saved: false }> {
    return this.http.delete<{ saved: false }>(`${this.baseUrl}/professionals/${encodeURIComponent(professionalId)}/favorite`);
  }
}
