import { Injectable, Injector, PLATFORM_ID, computed, effect, inject, signal, untracked } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Subscription, firstValueFrom } from 'rxjs';
import { classifyError } from '../api/api-error';
import { AppointmentsApiService } from '../api/appointments-api.service';
import { ProposeAppointmentPayload } from '../models/agenda';
import { ProRequestsApiService } from '../api/pro-requests-api.service';
import { QuotesApiService } from '../api/quotes-api.service';
import { CreateQuotePayload, Quote } from '../models/quote';
import { InvitationStatus, ProServiceRequest } from '../models/request';
import { AgendaStore } from './agenda.store';
import { AuthStore } from './auth.store';
import { NotificationsStore } from './notifications.store';
import { ProStore } from './pro.store';

export const PRO_REQUESTS_PAGE_SIZE = 20;
export const PRO_REQUESTS_ERROR = 'No pudimos cargar tus solicitudes.';
export const QUOTE_EXISTS_MESSAGE = 'Ya enviaste un presupuesto para esta solicitud.';

/** Pestañas = filtro `status` de la invitación en el backend (null = todas). */
export type ProRequestsTab = 'PENDING' | 'QUOTED' | 'SELECTED' | 'ALL';
export const PRO_REQUEST_TABS: { key: ProRequestsTab; label: string }[] = [
  { key: 'PENDING', label: 'Nuevas' },
  { key: 'QUOTED', label: 'Presupuestadas' },
  { key: 'SELECTED', label: 'Aceptadas' },
  { key: 'ALL', label: 'Todas' },
];

export function quoteErrorMessage(error: unknown): string {
  const e = classifyError(error);
  switch (e.code) {
    case 'QUOTE_ALREADY_EXISTS':
      return QUOTE_EXISTS_MESSAGE;
    case 'INVALID_REQUEST_STATE':
      return 'Esta solicitud ya no recibe presupuestos.';
    case 'NOT_INVITED':
      return 'Solo podés presupuestar solicitudes que recibiste.';
    case 'FREE_QUOTE_LIMIT_REACHED':
      return 'Usaste todos los presupuestos de Free de este mes. Podés seguir recibiendo solicitudes.';
    case 'PROFESSIONAL_PROFILE_REQUIRED':
      return 'Necesitás un perfil profesional para enviar presupuestos.';
  }
  switch (e.kind) {
    case 'validation':
      return 'Revisá el presupuesto: el total tiene que ser mayor a cero y la descripción tener al menos 5 caracteres.';
    case 'not-found':
      return 'Esta solicitud ya no está disponible.';
    case 'rate-limited':
      return 'Hiciste muchos intentos seguidos. Esperá un momento y probá de nuevo.';
    default:
      return 'No pudimos enviar el presupuesto. Revisá tu conexión y volvé a intentar.';
  }
}

export function declineErrorMessage(error: unknown): string {
  const e = classifyError(error);
  if (e.kind === 'conflict') return 'Ya respondiste esta solicitud. Actualizamos su estado.';
  if (e.kind === 'not-found') return 'Esta solicitud ya no está disponible.';
  return 'No pudimos registrar tu respuesta. Probá de nuevo.';
}

export type ProAppointmentAction = 'propose' | 'cancel' | 'complete';

/** Mensajes de coordinación del profesional elegido (el backend decide; acá solo se explica). */
export function proAppointmentErrorMessage(error: unknown, action: ProAppointmentAction): string {
  const e = classifyError(error);
  switch (e.code) {
    case 'APPOINTMENT_OVERLAP':
      return 'Ya tenés otro trabajo agendado en ese horario.';
    case 'APPOINTMENT_NOT_ENDED':
      return 'Vas a poder marcarlo como realizado cuando termine el horario agendado.';
    case 'APPOINTMENT_STATE_CHANGED':
      return 'El horario cambió mientras tanto (el cliente respondió). Actualizamos la solicitud.';
    case 'INVALID_REQUEST_STATE':
      return 'Este trabajo ya no se puede coordinar. Actualizamos la solicitud.';
  }
  if (e.kind === 'validation') return 'Revisá la fecha y la hora: tienen que ser en el futuro.';
  if (e.kind === 'not-found') return 'Esta solicitud ya no está disponible.';
  if (e.kind === 'rate-limited') return 'Hiciste muchos intentos seguidos. Esperá un momento.';
  return action === 'propose'
    ? 'No pudimos enviar la propuesta. Revisá tu conexión y probá de nuevo.'
    : 'No pudimos guardar el cambio. Revisá tu conexión y probá de nuevo.';
}

/**
 * Área pro, SOLO solicitudes y presupuestos: lo que el backend le deja ver
 * al profesional autenticado (GET /pro/requests filtra por invitación). No
 * se descarga nada más ni se filtra en el cliente. Requiere
 * `professionalProfileId`; sin él no se pide nada.
 */
@Injectable({ providedIn: 'root' })
export class ProRequestsStore {
  private readonly api = inject(ProRequestsApiService);
  private readonly quotesApi = inject(QuotesApiService);
  private readonly appointmentsApi = inject(AppointmentsApiService);
  private readonly agenda = inject(AgendaStore);
  private readonly auth = inject(AuthStore);
  private readonly notifications = inject(NotificationsStore);
  /** Perezoso: ProStore pide /pro/me al crearse y acá solo hace falta tras presupuestar. */
  private readonly injector = inject(Injector);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly hasProfile = computed(() => !!this.auth.user()?.professionalProfileId);

  // ---- Listado -------------------------------------------------------
  readonly tab = signal<ProRequestsTab>('PENDING');
  readonly items = signal<ProServiceRequest[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly loading = signal(false);
  readonly loadingMore = signal(false);
  readonly error = signal<string | null>(null);
  readonly loaded = signal(false);
  readonly hasMore = computed(() => this.items().length < this.total());
  /** Cantidad real de invitaciones sin responder (badge de navegación). null = no se sabe. */
  readonly pendingCount = signal<number | null>(null);
  private listSub?: Subscription;

  // ---- Detalle -------------------------------------------------------
  readonly detail = signal<ProServiceRequest | null>(null);
  readonly detailLoading = signal(false);
  readonly detailError = signal<'not-found' | 'error' | null>(null);
  readonly declining = signal(false);
  readonly actionError = signal<string | null>(null);
  /** Coordinación en curso (proponer, cancelar horario, marcar realizado). */
  readonly appointmentAction = signal<ProAppointmentAction | null>(null);
  /** Error dentro del formulario de propuesta (se muestra en el diálogo). */
  readonly proposeError = signal<string | null>(null);
  private detailSub?: Subscription;

  // ---- Presupuesto ---------------------------------------------------
  readonly quoteSending = signal(false);
  readonly quoteError = signal<string | null>(null);
  /** Presupuesto que devolvió el backend (total calculado en el servidor). */
  readonly sentQuote = signal<Quote | null>(null);
  /** El backend rechazó por cupo FREE agotado (FREE_QUOTE_LIMIT_REACHED). */
  readonly quoteLimitHit = signal(false);

  constructor() {
    let userId: string | null | undefined;
    effect(() => {
      const id = this.auth.user()?.id ?? null;
      untracked(() => {
        if (userId !== undefined && id !== userId) this.reset();
        userId = id;
      });
    });
  }

  private statusOf(tab: ProRequestsTab): InvitationStatus | null {
    return tab === 'ALL' ? null : tab;
  }

  load(force = false): void {
    if (!this.isBrowser || !this.hasProfile()) return;
    if (!force && (this.loaded() || this.loading())) return;
    this.listSub?.unsubscribe();
    this.loading.set(true);
    this.error.set(null);
    const tab = this.tab();
    this.listSub = this.api
      .getRequests({ status: this.statusOf(tab), page: 1, pageSize: PRO_REQUESTS_PAGE_SIZE })
      .subscribe({
        next: (res) => {
          this.items.set(res.items);
          this.total.set(res.total);
          this.page.set(1);
          this.loaded.set(true);
          this.loading.set(false);
          if (tab === 'PENDING') this.pendingCount.set(res.total);
        },
        error: () => {
          this.error.set(PRO_REQUESTS_ERROR);
          this.loading.set(false);
        },
      });
  }

  setTab(tab: ProRequestsTab): void {
    if (tab === this.tab() && this.loaded()) return;
    this.tab.set(tab);
    this.items.set([]);
    this.loaded.set(false);
    this.load(true);
  }

  loadMore(): void {
    if (this.loadingMore() || this.loading() || !this.hasMore()) return;
    const next = this.page() + 1;
    this.loadingMore.set(true);
    this.api
      .getRequests({ status: this.statusOf(this.tab()), page: next, pageSize: PRO_REQUESTS_PAGE_SIZE })
      .subscribe({
        next: (res) => {
          const seen = new Set(this.items().map((r) => r.id));
          this.items.update((list) => [...list, ...res.items.filter((r) => !seen.has(r.id))]);
          this.total.set(res.total);
          this.page.set(next);
          this.loadingMore.set(false);
        },
        error: () => {
          this.error.set(PRO_REQUESTS_ERROR);
          this.loadingMore.set(false);
        },
      });
  }

  /** Solo el total de invitaciones nuevas (pageSize 1), para los badges. */
  loadPendingCount(): void {
    if (!this.isBrowser || !this.hasProfile() || this.pendingCount() !== null) return;
    this.api.getRequests({ status: 'PENDING', page: 1, pageSize: 1 }).subscribe({
      next: (res) => this.pendingCount.set(res.total),
      error: () => undefined,
    });
  }

  // ---- Detalle -------------------------------------------------------
  loadDetail(id: string, force = false): void {
    if (!this.isBrowser || !this.hasProfile()) return;
    if (!force && this.detail()?.id === id && !this.detailError()) return;
    this.detailSub?.unsubscribe();
    if (this.detail()?.id !== id) {
      this.detail.set(null);
      this.actionError.set(null);
    }
    this.detailLoading.set(true);
    this.detailError.set(null);
    this.detailSub = this.api.getRequestById(id).subscribe({
      next: (request) => {
        this.setDetail(request);
        this.detailLoading.set(false);
      },
      error: (error) => {
        const kind = classifyError(error).kind;
        this.detailError.set(kind === 'not-found' || kind === 'validation' ? 'not-found' : 'error');
        this.detailLoading.set(false);
      },
    });
  }

  /** "No disponible" (persistido en el backend: invitación DECLINED). */
  async decline(id: string): Promise<boolean> {
    if (this.declining()) return false;
    this.declining.set(true);
    this.actionError.set(null);
    try {
      const request = await firstValueFrom(this.api.decline(id));
      this.setDetail(request);
      this.afterResponse(request);
      return true;
    } catch (error) {
      this.actionError.set(declineErrorMessage(error));
      this.loadDetail(id, true);
      return false;
    } finally {
      this.declining.set(false);
    }
  }

  // ---- Coordinación (profesional elegido) ------------------------------
  /**
   * Propone fecha y horario; con `replacesAppointmentId` cambia la propuesta o
   * reprograma. 'stale' = la cita cambió (el cliente respondió en otro lado):
   * se relee la solicitud y el error queda en la página, no en el formulario.
   */
  async propose(requestId: string, payload: ProposeAppointmentPayload): Promise<'ok' | 'error' | 'stale'> {
    if (this.appointmentAction()) return 'error';
    this.appointmentAction.set('propose');
    this.proposeError.set(null);
    this.actionError.set(null);
    try {
      this.afterAppointment(await firstValueFrom(this.appointmentsApi.propose(requestId, payload)));
      return 'ok';
    } catch (error) {
      const e = classifyError(error);
      const message = proAppointmentErrorMessage(error, 'propose');
      if (e.kind === 'conflict' && e.code !== 'APPOINTMENT_OVERLAP') {
        this.actionError.set(message);
        this.loadDetail(requestId, true);
        return 'stale';
      }
      this.proposeError.set(message);
      return 'error';
    } finally {
      this.appointmentAction.set(null);
    }
  }

  /** Cancela el horario (propuesto o confirmado); la solicitud sigue con este profesional. */
  async cancelAppointment(requestId: string, appointmentId: string): Promise<boolean> {
    return this.run('cancel', requestId, () => this.appointmentsApi.cancelAsProfessional(appointmentId));
  }

  /**
   * "Marcar como realizado" → COMPLETED (después del horario confirmado).
   * Si el cliente ya lo había cerrado, el backend responde el estado actual.
   */
  async complete(requestId: string): Promise<boolean> {
    return this.run('complete', requestId, () => this.appointmentsApi.complete(requestId));
  }

  clearProposeError(): void {
    this.proposeError.set(null);
  }

  // ---- Presupuesto ---------------------------------------------------
  resetQuote(): void {
    this.quoteSending.set(false);
    this.quoteError.set(null);
    this.sentQuote.set(null);
    this.quoteLimitHit.set(false);
  }

  /** Crea el presupuesto. Sin reintento automático; ante 409 no se permite otro. */
  async sendQuote(requestId: string, payload: CreateQuotePayload): Promise<Quote | null> {
    if (this.quoteSending() || this.sentQuote()) return null;
    this.quoteSending.set(true);
    this.quoteError.set(null);
    this.quoteLimitHit.set(false);
    try {
      const quote = await firstValueFrom(this.quotesApi.createQuote(requestId, payload));
      this.sentQuote.set(quote);
      // Cupo del mes: lo cuenta el backend; se relee para el contador y el aviso.
      this.injector.get(ProStore).refreshProfile();
      this.loadDetail(requestId, true);
      this.pendingCount.update((n) => (n === null ? n : Math.max(0, n - 1)));
      this.loaded.set(false);
      return quote;
    } catch (error) {
      this.quoteError.set(quoteErrorMessage(error));
      const e = classifyError(error);
      if (e.code === 'FREE_QUOTE_LIMIT_REACHED') {
        this.quoteLimitHit.set(true);
        this.injector.get(ProStore).refreshProfile();
      }
      if (e.kind === 'conflict') this.loadDetail(requestId, true);
      return null;
    } finally {
      this.quoteSending.set(false);
    }
  }

  reset(): void {
    this.listSub?.unsubscribe();
    this.detailSub?.unsubscribe();
    this.items.set([]);
    this.total.set(0);
    this.loaded.set(false);
    this.loading.set(false);
    this.error.set(null);
    this.pendingCount.set(null);
    this.detail.set(null);
    this.detailError.set(null);
    this.actionError.set(null);
    this.proposeError.set(null);
    this.resetQuote();
  }

  private async run(
    action: ProAppointmentAction,
    requestId: string,
    call: () => ReturnType<AppointmentsApiService['complete']>,
  ): Promise<boolean> {
    if (this.appointmentAction()) return false;
    this.appointmentAction.set(action);
    this.actionError.set(null);
    try {
      this.afterAppointment(await firstValueFrom(call()));
      return true;
    } catch (error) {
      this.actionError.set(proAppointmentErrorMessage(error, action));
      this.loadDetail(requestId, true);
      return false;
    } finally {
      this.appointmentAction.set(null);
    }
  }

  private afterAppointment(request: ProServiceRequest): void {
    this.setDetail(request);
    this.agenda.invalidate();
    // "Pendiente de cierre" y demás contadores cambian con la acción.
    void this.notifications.refresh();
  }

  private setDetail(request: ProServiceRequest): void {
    this.detail.set(request);
    this.items.update((list) => list.map((r) => (r.id === request.id ? request : r)));
  }

  /** Tras responder, el listado de la pestaña actual queda viejo: se recarga al volver. */
  private afterResponse(request: ProServiceRequest): void {
    if (request.invitationStatus !== 'PENDING') {
      this.pendingCount.update((n) => (n === null ? n : Math.max(0, n - 1)));
    }
    this.loaded.set(false);
  }
}
