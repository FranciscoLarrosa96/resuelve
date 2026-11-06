import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_URL } from './api.config';

/** «¿Lo contrataste?»: preguntas privadas del cliente después de tocar WhatsApp o Llamar. */
export interface ContactFollowup {
  professionalId: string;
  name: string;
  headline: string | null;
  avatarUrl: string | null;
  channel: 'WHATSAPP' | 'PHONE';
  contactedAt: string;
}

@Injectable({ providedIn: 'root' })
export class ContactFollowupsApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_URL);

  list(): Observable<{ items: ContactFollowup[] }> {
    return this.http.get<{ items: ContactFollowup[] }>(`${this.baseUrl}/me/contact-followups`);
  }

  answer(professionalId: string, answer: 'HIRED' | 'NOT_HIRED'): Observable<{ answered: true }> {
    return this.http.post<{ answered: true }>(
      `${this.baseUrl}/me/contact-followups/${encodeURIComponent(professionalId)}/answer`,
      { answer },
    );
  }
}
