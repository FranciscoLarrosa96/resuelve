import { Injectable, computed, inject, signal } from '@angular/core';
import { CLIENT_REQUESTS, STAGES } from '../data/client-requests.data';
import { ClientRequest, ClientRequestStage, Quote } from '../models/service-request';
import { ProfessionalsService } from '../services/professionals.service';
import { ToastService } from '../services/toast.service';

/** "Mis solicitudes": pedidos del cliente y su avance. */
@Injectable({ providedIn: 'root' })
export class ClientRequestsStore {
  private readonly toast = inject(ToastService);
  private readonly pros = inject(ProfessionalsService);

  readonly requests = signal<ClientRequest[]>(CLIENT_REQUESTS);
  readonly selectedId = signal<string>('c2');
  readonly stageFilter = signal<ClientRequestStage | null>(null);

  // Reseña en curso (solicitud seleccionada)
  readonly rating = signal(0);
  readonly reviewText = signal('');
  readonly reviewTags = signal<string[]>([]);

  readonly visible = computed(() => {
    const filter = this.stageFilter();
    const all = this.requests();
    return filter === null ? all : all.filter((r) => r.stage === filter);
  });

  readonly selected = computed(
    () => this.requests().find((r) => r.id === this.selectedId()) ?? this.requests()[0],
  );

  /** Pedidos donde el cliente tiene que hacer algo. */
  readonly pendingActions = computed(() => this.requests().filter((r) => STAGES[r.stage].action).length);

  readonly pipeline = computed(() =>
    STAGES.map((meta, stage) => {
      const count = this.requests().filter((r) => r.stage === stage).length;
      return { stage: stage as ClientRequestStage, meta, count, needsAction: !!meta.action && count > 0 };
    }),
  );

  select(id: string): void {
    this.selectedId.set(id);
    this.rating.set(0);
    this.reviewText.set('');
    this.reviewTags.set([]);
  }

  toggleStageFilter(stage: ClientRequestStage): void {
    this.stageFilter.update((current) => (current === stage ? null : stage));
  }

  add(request: Omit<ClientRequest, 'id'>): ClientRequest {
    const created: ClientRequest = { ...request, id: 'c' + Date.now() };
    this.requests.update((list) => [created, ...list]);
    this.stageFilter.set(null);
    this.select(created.id);
    return created;
  }

  receiveQuote(requestId: string, quote: Quote): void {
    const request = this.find(requestId);
    if (!request || ![0, 1].includes(request.stage) ||
        !request.professionalIds.includes(quote.professionalId) ||
        request.quotes?.some((item) => item.professionalId === quote.professionalId)) return;
    this.patch(requestId, { stage: 1, quotes: [...(request.quotes ?? []), quote] });
  }

  chooseQuote(requestId: string, professionalId: string): void {
    const request = this.find(requestId);
    const quote = request?.quotes?.find((q) => q.professionalId === professionalId);
    if (!request || request.stage !== 1 || !quote) return;
    this.patch(requestId, { stage: 2, chosenId: professionalId, amount: quote.amount });
    this.toast.show(`Elegiste a ${this.pros.get(professionalId).firstName}. Le compartimos tu contacto.`);
  }

  confirmDate(requestId: string): void {
    const request = this.find(requestId);
    if (!request || request.stage !== 2 || !request.chosenId) return;
    this.patch(requestId, { stage: 3, when: 'Lun 29 sep · 9:00' });
    this.toast.show('Fecha confirmada: lunes 29 a las 9:00');
  }

  markDone(requestId: string): void {
    const request = this.find(requestId);
    if (!request || request.stage !== 3 || !request.chosenId) return;
    this.patch(requestId, { stage: 4, when: 'Terminado hoy' });
    this.toast.show('¡Listo! Contanos cómo te fue.');
  }

  toggleReviewTag(tag: string): void {
    this.reviewTags.update((tags) => (tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag]));
  }

  submitReview(requestId: string): void {
    const request = this.find(requestId);
    if (!request || request.stage !== 4 || !request.chosenId) return;
    const rating = this.rating();
    if (!rating) return;
    const review = this.reviewText().trim() || this.reviewTags().join(' · ') || 'Sin comentario';
    this.patch(requestId, { stage: 5, myRating: rating, myReview: review });
    this.toast.show('Gracias. Tu reseña ya es visible en el perfil.');
  }

  contact(requestId: string): void {
    const chosen = this.find(requestId)?.chosenId;
    this.toast.show(`Abrimos el chat con ${chosen ? this.pros.get(chosen).firstName : 'el profesional'} (próximamente)`);
  }

  private find(id: string): ClientRequest | undefined {
    return this.requests().find((r) => r.id === id);
  }

  private patch(id: string, patch: Partial<ClientRequest>): void {
    this.requests.update((list) => list.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
}
