import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_URL } from './api.config';

/** /me/demand-alerts: "Avisame cuando haya" profesionales de un servicio en una localidad. */
@Injectable({ providedIn: 'root' })
export class DemandAlertsApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_URL);

  status(cityId: string, serviceId: string): Observable<{ active: boolean }> {
    return this.http.get<{ active: boolean }>(`${this.baseUrl}/me/demand-alerts`, { params: { cityId, serviceId } });
  }

  request(cityId: string, serviceId: string): Observable<{ active: boolean }> {
    return this.http.post<{ active: boolean }>(`${this.baseUrl}/me/demand-alerts`, { cityId, serviceId });
  }
}
