import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_URL } from './api.config';
import { JobDetail, JobsResponse, ScheduleJobPayload } from '../models/job';

@Injectable({ providedIn: 'root' })
export class JobsApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_URL);
  private readonly url = this.baseUrl + '/pro/jobs';

  list(): Observable<JobsResponse> {
    return this.http.get<JobsResponse>(this.url);
  }

  get(id: string): Observable<JobDetail> {
    return this.http.get<JobDetail>(this.url + '/' + encodeURIComponent(id));
  }

  schedule(id: string, payload: ScheduleJobPayload): Observable<JobDetail> {
    return this.http.post<JobDetail>(this.url + '/' + encodeURIComponent(id) + '/schedule', payload);
  }

  start(id: string): Observable<JobDetail> {
    return this.http.post<JobDetail>(this.url + '/' + encodeURIComponent(id) + '/start', {});
  }

  complete(id: string): Observable<JobDetail> {
    return this.http.post<JobDetail>(this.url + '/' + encodeURIComponent(id) + '/complete', {});
  }

  cancel(id: string): Observable<JobDetail> {
    return this.http.post<JobDetail>(this.url + '/' + encodeURIComponent(id) + '/cancel', {});
  }

  updateNotes(id: string, privateNotes: string): Observable<JobDetail> {
    return this.http.patch<JobDetail>(this.url + '/' + encodeURIComponent(id) + '/notes', { privateNotes });
  }

  updateChecklist(id: string, items: JobDetail['checklist']): Observable<JobDetail> {
    return this.http.patch<JobDetail>(this.url + '/' + encodeURIComponent(id) + '/checklist', { items });
  }
}
