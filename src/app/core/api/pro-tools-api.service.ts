import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ClientQuestions, ProQuestions, QuoteTemplateInput, QuoteTemplateList } from '../models/pro-tools';
import { ProfessionalReview } from '../models/professional';
import { API_URL } from './api.config';
import { Paginated } from './api.types';

/**
 * Herramientas del profesional: plantillas de presupuesto, respuesta a
 * reseñas y consultas antes de presupuestar (y la respuesta del cliente).
 * Cada regla la valida el backend; acá solo se llama.
 */
@Injectable({ providedIn: 'root' })
export class ProToolsApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_URL);

  // ---- Plantillas ----
  templates(): Observable<QuoteTemplateList> {
    return this.http.get<QuoteTemplateList>(`${this.baseUrl}/pro/quote-templates`);
  }
  createTemplate(input: QuoteTemplateInput): Observable<QuoteTemplateList> {
    return this.http.post<QuoteTemplateList>(`${this.baseUrl}/pro/quote-templates`, input);
  }
  deleteTemplate(id: string): Observable<QuoteTemplateList> {
    return this.http.delete<QuoteTemplateList>(`${this.baseUrl}/pro/quote-templates/${id}`);
  }

  // ---- Reseñas ----
  ownReviews(page = 1): Observable<Paginated<ProfessionalReview>> {
    return this.http.get<Paginated<ProfessionalReview>>(`${this.baseUrl}/pro/reviews`, { params: { page } });
  }
  replyReview(id: string, text: string): Observable<ProfessionalReview> {
    return this.http.put<ProfessionalReview>(`${this.baseUrl}/pro/reviews/${id}/reply`, { text });
  }
  deleteReply(id: string): Observable<ProfessionalReview> {
    return this.http.delete<ProfessionalReview>(`${this.baseUrl}/pro/reviews/${id}/reply`);
  }

  // ---- Consultas ----
  proQuestions(requestId: string): Observable<ProQuestions> {
    return this.http.get<ProQuestions>(`${this.baseUrl}/pro/requests/${requestId}/questions`);
  }
  ask(requestId: string, text: string): Observable<ProQuestions> {
    return this.http.post<ProQuestions>(`${this.baseUrl}/pro/requests/${requestId}/questions`, { text });
  }
  clientQuestions(requestId: string): Observable<ClientQuestions> {
    return this.http.get<ClientQuestions>(`${this.baseUrl}/requests/${requestId}/questions`);
  }
  answer(requestId: string, questionId: string, text: string): Observable<ClientQuestions> {
    return this.http.post<ClientQuestions>(`${this.baseUrl}/requests/${requestId}/questions/${questionId}/answer`, { text });
  }
}
