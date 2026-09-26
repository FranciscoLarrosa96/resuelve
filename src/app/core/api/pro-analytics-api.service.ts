import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { MonthAnalytics, MonthRef, PlansInfo } from '../models/pro-analytics';
import { API_URL } from './api.config';

/** "Tu mes" (GET /pro/analytics/month) y condiciones de los planes (GET /plans). */
@Injectable({ providedIn: 'root' })
export class ProAnalyticsApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_URL);

  /** Sin mes: el mes en curso (hora de Argentina, lo decide el backend). */
  getMonth(ref?: MonthRef): Observable<MonthAnalytics> {
    const params = ref ? new HttpParams().set('year', ref.year).set('month', ref.month) : undefined;
    return this.http.get<MonthAnalytics>(`${this.baseUrl}/pro/analytics/month`, { params });
  }

  getPlans(): Observable<PlansInfo> {
    return this.http.get<PlansInfo>(`${this.baseUrl}/plans`);
  }
}
