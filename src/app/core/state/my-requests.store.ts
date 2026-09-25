import { Injectable, PLATFORM_ID, computed, effect, inject, signal, untracked } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Subscription, firstValueFrom } from 'rxjs';
import { classifyError } from '../api/api-error';
import { QuotesApiService } from '../api/quotes-api.service';
import { RequestsApiService } from '../api/requests-api.service';
import { Quote } from '../models/quote';
import { RequestStatus, ServiceRequest } from '../models/request';
import { AuthStore } from './auth.store';

export const MY_REQUESTS_PAGE_SIZE = 20;
export const MY_REQUESTS_ERROR = 'No pudimos cargar tus solicitudes.';
export const SELECTED_CONFLICT = 'Esta solicitud ya tiene un profesional seleccionado.';

/** Mensaje de un intento fallido de aceptar un presupuesto (después se refrescan los datos). */
export function acceptErrorMessage(error: unknown, requestAfter: ServiceRequest | null): string {
  const e = classifyError(error);
  if (e.code === 'QUOTE_EXPIRED') return 'Ese presupuesto venció. Pedile uno nuevo al profesional.';
  if (e.kind === 'conflict') {
    return requestAfter?.selectedProfessionalId || requestAfter?.status === 'PROFESSIONAL_SELECTED'
      ? SELECTED_CONFLICT
      : 'Ese presupuesto ya no está disponible. Actualizamos la solicitud.';
  }
  if (e.kind === 'not-found') return 'Ese presupuesto ya no existe.';
  if (e.kind === 'rate-limited') return 'Hiciste muchos intentos seguidos. Esperá un momento.';
  return 'No pudimos aceptar el presupuesto. Probá de nuevo.';
}

export function cancelErrorMessage(error: unknown): string {
  const e = classifyError(error);
  if (e.kind === 'conflict') return 'Esta solicitud ya no se puede cancelar. Actualizamos su estado.';
  if (e.kind === 'not-found') return 'No encontramos esta solicitud.';
  return 'No pudimos cancelar la solicitud. Probá de nuevo.';
}

/**
 * "Mis solicitudes": listado y detalle REALES del cliente autenticado.
 * El estado de cada solicitud es siempre el último que devolvió el backend;
 * después de aceptar o cancelar se usa la respuesta y se vuelve a pedir.
 * Sin polling: se refresca al entrar, con "Actualizar" y al volver a la pestaña.
 */
@Injectable({ providedIn: 'root' })
export class MyRequestsStore {
  private readonly api = inject(RequestsApiService);
  private readonly quotesApi = inject(QuotesApiService);
  private readonly auth = inject(AuthStore);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  // ---- Listado -------------------------------------------------------
  readonly statusFilter = signal<RequestStatus | null>(null);
  readonly items = signal<ServiceRequest[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly loading = signal(false);
  readonly loadingMore = signal(false);
  readonly error = signal<string | null>(null);
  readonly loaded = signal(false);
  readonly hasMore = computed(() => this.items().length < this.total());
  readonly empty = computed(() => this.loaded() && !this.loading() && !this.error() && !this.items().length);
  private listSub?: Subscription;

  // ---- Detalle -------------------------------------------------------
  readonly detail = signal<ServiceRequest | null>(null);
  readonly detailLoading = signal(false);
  readonly detailError = signal<'not-found' | 'error' | null>(null);
  readonly quotes = signal<Quote[]>([]);
  readonly quotesLoading = signal(false);
  readonly quotesError = signal(false);
  /** Id del presupuesto que se está aceptando (bloquea todos los botones). */
  readonly accepting = signal<string | null>(null);
  readonly cancelling = signal(false);
  readonly actionError = signal<string | null>(null);
  private detailSub?: Subscription;

  constructor() {
    // Datos personales: si cambia el usuario (logout/login), se olvidan.
    let userId: string | null | undefined;
    effect(() => {
      const id = this.auth.user()?.id ?? null;
      untracked(() => {
        if (userId !== undefined && id !== userId) this.reset();
        userId = id;
      });
    });
  }

  load(force = false): void {
    if (!this.isBrowser || (!force && (this.loaded() || this.loading()))) return;
    this.listSub?.unsubscribe();
    this.loading.set(true);
    this.error.set(null);
    const status = this.statusFilter();
    this.listSub = this.api.getMyRequests({ status, page: 1, pageSize: MY_REQUESTS_PAGE_SIZE }).subscribe({
      next: (res) => {
        this.items.set(res.items);
        this.total.set(res.total);
        this.page.set(1);
        this.loaded.set(true);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(MY_REQUESTS_ERROR);
        this.loading.set(false);
      },
    });
  }

  setFilter(status: RequestStatus | null): void {
    if (status === this.statusFilter() && this.loaded()) return;
    this.statusFilter.set(status);
    this.items.set([]);
    this.loaded.set(false);
    this.load(true);
  }

  loadMore(): void {
    if (this.loadingMore() || this.loading() || !this.hasMore()) return;
    const next = this.page() + 1;
    this.loadingMore.set(true);
    this.api.getMyRequests({ status: this.statusFilter(), page: next, pageSize: MY_REQUESTS_PAGE_SIZE }).subscribe({
      next: (res) => {
        const seen = new Set(this.items().map((r) => r.id));
        this.items.update((list) => [...list, ...res.items.filter((r) => !seen.has(r.id))]);
        this.total.set(res.total);
        this.page.set(next);
        this.loadingMore.set(false);
      },
      error: () => {
        this.error.set(MY_REQUESTS_ERROR);
        this.loadingMore.set(false);
      },
    });
  }

  // ---- Detalle -------------------------------------------------------
  loadDetail(id: string, force = false): void {
    if (!this.isBrowser) return;
    if (!force && this.detail()?.id === id && !this.detailError()) return;
    this.detailSub?.unsubscribe();
    if (this.detail()?.id !== id) {
      this.detail.set(null);
      this.quotes.set([]);
      this.actionError.set(null);
    }
    this.detailLoading.set(true);
    this.detailError.set(null);
    this.detailSub = this.api.getRequestById(id).subscribe({
      next: (request) => {
        this.setDetail(request);
        this.detailLoading.set(false);
        this.loadQuotes(request);
      },
      error: (error) => {
        const kind = classifyError(error).kind;
        this.detailError.set(kind === 'not-found' || kind === 'validation' ? 'not-found' : 'error');
        this.detailLoading.set(false);
      },
    });
  }

  refreshDetail(): void {
    const id = this.detail()?.id;
    if (id) this.loadDetail(id, true);
  }

  /**
   * Acepta un presupuesto. No cambia nada local antes de la respuesta.
   * Si otra pestaña/dispositivo ganó (409), se refresca y se explica.
   */
  async accept(quote: Quote): Promise<boolean> {
    if (this.accepting() || this.cancelling()) return false;
    this.accepting.set(quote.id);
    this.actionError.set(null);
    try {
      const request = await firstValueFrom(this.quotesApi.acceptQuote(quote.id));
      this.setDetail(request);
      this.loadQuotes(request);
      return true;
    } catch (error) {
      const fresh = await this.fetchQuietly(quote.requestId);
      this.actionError.set(acceptErrorMessage(error, fresh));
      return false;
    } finally {
      this.accepting.set(null);
    }
  }

  async cancel(): Promise<boolean> {
    const current = this.detail();
    if (!current || this.cancelling() || this.accepting()) return false;
    this.cancelling.set(true);
    this.actionError.set(null);
    try {
      const request = await firstValueFrom(this.api.cancelRequest(current.id));
      this.setDetail(request);
      this.loadQuotes(request);
      return true;
    } catch (error) {
      await this.fetchQuietly(current.id);
      this.actionError.set(cancelErrorMessage(error));
      return false;
    } finally {
      this.cancelling.set(false);
    }
  }

  reset(): void {
    this.listSub?.unsubscribe();
    this.detailSub?.unsubscribe();
    this.items.set([]);
    this.total.set(0);
    this.page.set(1);
    this.loaded.set(false);
    this.loading.set(false);
    this.error.set(null);
    this.statusFilter.set(null);
    this.detail.set(null);
    this.detailError.set(null);
    this.quotes.set([]);
    this.actionError.set(null);
  }

  /** Nueva solicitud recién creada: al frente del listado si ya estaba cargado. */
  prepend(request: ServiceRequest): void {
    if (!this.loaded()) return;
    this.items.update((list) => [request, ...list.filter((r) => r.id !== request.id)]);
    this.total.update((n) => n + 1);
  }

  private loadQuotes(request: ServiceRequest): void {
    // En DRAFT todavía no se invitó a nadie: no puede haber presupuestos.
    if (request.status === 'DRAFT') {
      this.quotes.set([]);
      return;
    }
    this.quotesLoading.set(true);
    this.quotesError.set(false);
    this.quotesApi.getQuotesForRequest(request.id).subscribe({
      next: (quotes) => {
        if (this.detail()?.id === request.id) this.quotes.set(quotes);
        this.quotesLoading.set(false);
      },
      error: () => {
        this.quotesError.set(true);
        this.quotesLoading.set(false);
      },
    });
  }

  private setDetail(request: ServiceRequest): void {
    this.detail.set(request);
    // Mantiene el listado coherente con el último estado real.
    this.items.update((list) => list.map((r) => (r.id === request.id ? request : r)));
  }

  /** Relee la solicitud y sus presupuestos tras un conflicto. */
  private async fetchQuietly(id: string): Promise<ServiceRequest | null> {
    try {
      const request = await firstValueFrom(this.api.getRequestById(id));
      this.setDetail(request);
      this.loadQuotes(request);
      return request;
    } catch {
      return null;
    }
  }
}
