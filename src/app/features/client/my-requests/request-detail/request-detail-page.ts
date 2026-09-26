import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChildren,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ProfessionalsApiService } from '../../../../core/api/professionals-api.service';
import { avatarOf } from '../../../../core/models/avatar';
import { ProfessionalDetail, hasLicenseFor } from '../../../../core/models/professional';
import { Quote } from '../../../../core/models/quote';
import {
  INVITATION_LABELS_FOR_CLIENT,
  QUOTE_STATUS_LABELS,
  URGENCY_LABELS,
  canCancel,
  clientStage,
  isCompletionDue,
  isWorkDone,
  requestStatusDescription,
} from '../../../../core/models/request-status';
import { AuthStore } from '../../../../core/state/auth.store';
import { CatalogStore } from '../../../../core/state/catalog.store';
import { AppointmentAction, MyRequestsStore } from '../../../../core/state/my-requests.store';
import { NotificationsStore } from '../../../../core/state/notifications.store';
import { businessDay, formatDayLong, formatTimeRange, formatWhen } from '../../../../core/utils/business-time';
import { RequestStore } from '../../../../core/state/request.store';
import { SearchStore } from '../../../../core/state/search.store';
import { ToastService } from '../../../../core/services/toast.service';
import { formatDay, formatDesiredDate, formatTimestamp } from '../../../../core/utils/dates';
import { formatMoney, oneDecimal } from '../../../../core/utils/format';
import { onTabVisible } from '../../../../core/utils/on-tab-visible';
import { Avatar } from '../../../../shared/components/avatar/avatar';
import { Dialog } from '../../../../shared/components/dialog/dialog';
import { Icon } from '../../../../shared/components/icon/icon';
import { RequestProgress } from '../../../../shared/components/request-progress/request-progress';
import { SessionPending } from '../../../../shared/components/session-pending/session-pending';
import { StatusPill } from '../../../../shared/components/status-pill/status-pill';
import { NO_REVIEWS_TEXT, hasReviews, reputationText } from '../../../../core/utils/reputation';
import { ReviewPanel } from './review-panel';

/**
 * En qué punto de la coordinación está el trabajo (derivado del estado real).
 * 'due' = agendado y el horario ya pasó: "¿Se realizó el trabajo?".
 */
export type ClientCoordination = 'waiting' | 'proposed' | 'scheduled' | 'due' | 'done';

const APPOINTMENT_TOASTS: Record<AppointmentAction, string> = {
  confirm: 'Horario confirmado. El trabajo quedó agendado.',
  decline: 'Listo. El profesional te va a proponer otro horario.',
  cancel: 'Horario cancelado. El profesional puede proponerte otra fecha.',
  complete: 'Listo. El trabajo quedó registrado como realizado.',
  reprogram: 'Listo. El profesional va a poder proponerte otro horario.',
};

interface CompareRow {
  label: string;
  values: string[];
}

/**
 * Detalle REAL de una solicitud del cliente: pedido, profesionales
 * invitados, presupuestos (comparar y aceptar) y cancelación. Solo ofrece
 * acciones válidas para el estado actual; el estado siempre sale del backend.
 */
@Component({
  selector: 'app-request-detail-page',
  imports: [NgTemplateOutlet, RouterLink, Avatar, Dialog, Icon, RequestProgress, SessionPending, StatusPill, ReviewPanel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './request-detail-page.html',
})
export class RequestDetailPage {
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly catalog = inject(CatalogStore);
  private readonly prosApi = inject(ProfessionalsApiService);
  private readonly draft = inject(RequestStore);
  private readonly search = inject(SearchStore);
  protected readonly auth = inject(AuthStore);
  protected readonly store = inject(MyRequestsStore);
  private readonly notifications = inject(NotificationsStore);

  /** Parámetro de ruta :id */
  readonly id = input.required<string>();

  protected readonly money = formatMoney;
  protected readonly hasReviews = hasReviews;
  protected readonly reputation = reputationText;
  protected readonly date = formatTimestamp;
  protected readonly day = formatDay;
  protected readonly quoteStatus = QUOTE_STATUS_LABELS;
  protected readonly invitationLabel = INVITATION_LABELS_FOR_CLIENT;

  protected readonly request = computed(() => {
    const r = this.store.detail();
    return r && r.id === this.id() ? r : null;
  });

  /** Hora de referencia: el bloque de cierre aparece solo cuando termina el horario. */
  private readonly now = signal(Date.now());
  /** Estado contextual ("Horario por confirmar", "Pendiente de confirmar"). */
  protected readonly stage = computed(() => {
    const r = this.request();
    return r ? clientStage(r, this.now()) : null;
  });

  private readonly loadedId = computed(() => this.request()?.id ?? null);

  protected readonly code = computed(() => this.request()?.id.slice(0, 8).toUpperCase() ?? '');
  protected readonly statusText = computed(() => {
    const r = this.request();
    return r ? requestStatusDescription(r.status) : '';
  });
  protected readonly urgency = computed(() => (this.request() ? URGENCY_LABELS[this.request()!.urgency] : ''));
  protected readonly when = computed(() => {
    const r = this.request();
    if (!r) return '';
    if (r.urgency === 'URGENT') return 'Lo antes posible';
    const d = formatDesiredDate(r.desiredDate);
    return r.desiredTimeRange ? `${d}, ${r.desiredTimeRange}` : d;
  });

  protected readonly invitations = computed(() =>
    (this.request()?.invitations ?? []).map((inv) => ({
      ...inv,
      name: inv.professional?.displayName ?? 'Profesional',
      avatar: avatarOf({ id: inv.professionalId, displayName: inv.professional?.displayName ?? 'Profesional', avatarUrl: inv.professional?.avatarUrl ?? null }),
    })),
  );

  /** Se puede aceptar solo en QUOTES_RECEIVED y un presupuesto PENDING. */
  protected readonly canAccept = computed(() => this.request()?.status === 'QUOTES_RECEIVED');

  protected readonly quotes = computed(() =>
    this.store.quotes().map((q) => {
      const name = q.professional?.displayName ?? 'Profesional';
      return {
        quote: q,
        name,
        firstName: name.split(' ')[0],
        avatar: avatarOf({ id: q.professionalId, displayName: name, avatarUrl: q.professional?.avatarUrl ?? null }),
        acceptable: this.canAccept() && q.status === 'PENDING',
      };
    }),
  );

  protected readonly selected = computed(() => {
    const r = this.request();
    if (!r?.selectedProfessionalId) return null;
    const inv = this.invitations().find((i) => i.professionalId === r.selectedProfessionalId);
    const quote = this.store.quotes().find((q) => q.id === r.acceptedQuoteId);
    return { name: inv?.name ?? null, avatar: inv?.avatar, quote, professionalId: r.selectedProfessionalId };
  });

  /** Con presupuestos, los invitados pasan a ser información secundaria (plegable). */
  protected readonly invitedSecondary = computed(() => this.quotes().length > 0);

  protected readonly cancellable = computed(() => {
    const r = this.request();
    return !!r && canCancel(r.status);
  });
  protected readonly canRepeat = computed(() => {
    const s = this.request()?.status;
    return !!s && (s === 'CANCELLED' || isWorkDone(s));
  });

  // ---- Coordinación del trabajo ----------------------------------------
  protected readonly coordination = computed<ClientCoordination | null>(() => {
    const r = this.request();
    if (!r?.selectedProfessionalId) return null;
    if (isWorkDone(r.status)) return 'done';
    if (isCompletionDue(r, this.now())) return 'due';
    if (r.status === 'SCHEDULED' && r.appointment?.status === 'CONFIRMED') return 'scheduled';
    if (r.status !== 'PROFESSIONAL_SELECTED') return null;
    return r.appointment?.status === 'PROPOSED' ? 'proposed' : 'waiting';
  });

  /** Texto de espera según lo último que pasó con la cita. */
  protected readonly waitingText = computed(() => {
    const a = this.request()?.appointment;
    if (a?.status === 'DECLINED') return 'Pediste otro horario. El profesional te va a proponer uno nuevo.';
    if (a?.status === 'CANCELLED' && a.cancelledBy === 'CLIENT')
      return 'Cancelaste el horario. El profesional te va a proponer otra fecha.';
    if (a?.status === 'CANCELLED') return 'El profesional retiró el horario propuesto. Te va a proponer otra fecha.';
    return 'Esperando coordinación. El profesional te va a proponer fecha y horario.';
  });

  protected readonly slot = computed(() => {
    const a = this.request()?.appointment;
    if (!a) return null;
    return { id: a.id, day: formatDayLong(businessDay(a.startsAt)), time: formatTimeRange(a.startsAt, a.endsAt), note: a.note };
  });

  /** Quién cerró el trabajo, contado a la otra parte sin juicio. */
  protected readonly completedText = computed(() => {
    const by = this.request()?.completedBy;
    if (by === 'CLIENT') return 'Confirmaste que el trabajo se realizó.';
    if (by === 'PROFESSIONAL') return 'El profesional marcó este trabajo como realizado.';
    return 'El trabajo quedó registrado como realizado.';
  });

  protected readonly completedWhen = computed(() => {
    const at = this.request()?.completedAt;
    return at ? formatWhen(at) : null;
  });

  protected readonly appointmentCta: Record<AppointmentAction, string> = {
    confirm: 'Confirmar',
    decline: 'Pedir otro horario',
    cancel: 'Cancelar horario',
    complete: 'Sí, marcar como realizado',
    reprogram: 'Necesitamos otro horario',
  };

  /** Confirmación abierta sobre la cita (null = cerrada). */
  protected readonly appointmentDialog = signal<AppointmentAction | null>(null);

  // ---- Confirmaciones ------------------------------------------------
  /** Presupuesto a confirmar en el diálogo (null = cerrado). */
  protected readonly confirmingQuote = signal<string | null>(null);
  protected readonly confirmTarget = computed(() => this.quotes().find((i) => i.quote.id === this.confirmingQuote()) ?? null);
  protected readonly confirmingCancel = signal(false);
  protected readonly busy = computed(
    () => !!this.store.accepting() || this.store.cancelling() || !!this.store.appointmentAction(),
  );

  // ---- Comparar presupuestos -----------------------------------------
  protected readonly comparing = signal(false);
  private readonly profiles = signal<Record<string, ProfessionalDetail | null>>({});
  private readonly licenseApplies = computed(() => {
    const slug = this.request()?.service.slug;
    return !!this.catalog.serviceBySlug(slug)?.requiresLicense;
  });
  protected readonly compareRows = computed<CompareRow[]>(() => {
    const list = this.store.quotes();
    const profiles = this.profiles();
    const serviceId = this.request()?.service.id;
    const yesNo = (v: boolean | undefined) => (v === undefined ? '—' : v ? 'Sí' : 'No');
    const rows: CompareRow[] = [
      { label: 'Total', values: list.map((q) => this.money(q.totalAmount)) },
      { label: 'Mano de obra', values: list.map((q) => this.money(q.laborAmount)) },
      { label: 'Materiales', values: list.map((q) => this.money(q.materialsAmount)) },
      { label: 'Ítems detallados', values: list.map((q) => (q.items.length ? String(q.items.length) : '—')) },
      { label: 'Puede ir desde', values: list.map((q) => formatDay(q.availableFrom)) },
      { label: 'Válido hasta', values: list.map((q) => formatDay(q.validUntil)) },
      {
        label: 'Valoración',
        values: list.map((q) => (q.professional?.averageRating != null ? `★ ${oneDecimal(q.professional.averageRating)}` : NO_REVIEWS_TEXT)),
      },
      { label: 'Reseñas', values: list.map((q) => String(q.professional?.reviewsCount ?? 0)) },
      { label: 'Identidad verificada', values: list.map((q) => yesNo(profiles[q.professionalId]?.verifications.identity)) },
    ];
    if (this.licenseApplies()) {
      rows.push({
        label: 'Matrícula verificada',
        values: list.map((q) => {
          const p = profiles[q.professionalId];
          return p ? yesNo(hasLicenseFor(p, serviceId)) : '—';
        }),
      });
    }
    rows.push({ label: 'Disponible hoy', values: list.map((q) => yesNo(profiles[q.professionalId]?.availableToday)) });
    return rows;
  });

  private readonly alerts = viewChildren<ElementRef<HTMLElement>>('actionAlert');
  private readonly selectedHeadings = viewChildren<ElementRef<HTMLElement>>('selectedHeading');

  constructor() {
    effect(() => {
      const id = this.id();
      if (this.auth.authenticated()) untracked(() => this.store.loadDetail(id, true));
    });
    // Abrir la solicitud marca leídas SUS novedades (no las de otras solicitudes).
    // También cuando las novedades llegan después de abrirla (entrada directa, F5 o polling).
    effect(() => {
      const id = this.loadedId();
      if (id && this.notifications.clientByRequest().has(id)) {
        untracked(() => void this.notifications.markRead(id, 'CLIENT'));
      }
    });
    // Llegó algo nuevo para esta solicitud mientras está abierta: se relee sin F5.
    let handled = this.notifications.lastArrival();
    effect(() => {
      const n = this.notifications.lastArrival();
      if (n === handled || n?.requestId !== this.id()) return;
      handled = n;
      untracked(() => this.store.refreshDetail());
    });
    this.catalog.loadCatalog();
    onTabVisible(() => {
      this.now.set(Date.now());
      this.store.refreshDetail();
    });
    const timer = setInterval(() => this.now.set(Date.now()), 30_000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected retry(): void {
    this.store.loadDetail(this.id(), true);
  }

  // ---- Aceptar -------------------------------------------------------
  protected askAccept(q: Quote): void {
    this.confirmingCancel.set(false);
    this.appointmentDialog.set(null);
    this.comparing.set(false);
    this.confirmingQuote.set(q.id);
  }

  protected closeAccept(): void {
    if (!this.store.accepting()) this.confirmingQuote.set(null);
  }

  /** Sin toast: el estado final queda visible en la página (banner + card aceptada). */
  protected async confirmAccept(q: Quote): Promise<void> {
    const ok = await this.store.accept(q);
    this.confirmingQuote.set(null);
    this.focusVisible(ok ? this.selectedHeadings : this.alerts);
  }

  // ---- Cancelar ------------------------------------------------------
  protected askCancel(): void {
    this.appointmentDialog.set(null);
    this.confirmingQuote.set(null);
    this.confirmingCancel.set(true);
  }

  protected closeCancel(): void {
    if (!this.store.cancelling()) this.confirmingCancel.set(false);
  }

  protected async confirmCancel(): Promise<void> {
    const ok = await this.store.cancel();
    this.confirmingCancel.set(false);
    if (ok) this.toast.show('Solicitud cancelada');
    else this.focusVisible(this.alerts);
  }

  // ---- Cita ----------------------------------------------------------
  protected askAppointment(action: AppointmentAction): void {
    this.confirmingQuote.set(null);
    this.confirmingCancel.set(false);
    this.appointmentDialog.set(action);
  }

  protected closeAppointment(): void {
    if (!this.store.appointmentAction()) this.appointmentDialog.set(null);
  }

  protected async confirmAppointment(action: AppointmentAction): Promise<void> {
    const id = this.request()?.appointment?.id;
    if (!id) return;
    const ok = await this.store.appointment(action, id);
    this.appointmentDialog.set(null);
    if (!ok) {
      this.focusVisible(this.alerts);
      return;
    }
    this.toast.show(APPOINTMENT_TOASTS[action]);
    this.focusVisible(this.selectedHeadings);
  }

  // ---- Comparar ------------------------------------------------------
  protected toggleCompare(): void {
    const next = !this.comparing();
    this.comparing.set(next);
    if (next) this.loadProfiles();
  }

  /** Perfiles públicos (≤3) para verificaciones y disponibilidad. Si uno falla, se muestra "—". */
  private loadProfiles(): void {
    const missing = [...new Set(this.store.quotes().map((q) => q.professionalId))].filter((id) => !(id in this.profiles()));
    if (!missing.length) return;
    forkJoin(missing.map((id) => this.prosApi.getProfessionalById(id).pipe(catchError(() => of(null))))).subscribe((list) => {
      this.profiles.update((map) => {
        const next = { ...map };
        missing.forEach((id, i) => (next[id] = list[i]));
        return next;
      });
    });
  }

  /** "Crear solicitud similar": borrador nuevo con los datos básicos, nunca reenvía esta. */
  protected createSimilar(): void {
    const r = this.request();
    if (!r) return;
    this.search.resetForNewRequest();
    this.draft.repeatFrom(r);
    this.router.navigate(['/solicitud']);
  }

  private focusVisible(list: () => readonly ElementRef<HTMLElement>[]): void {
    setTimeout(() => list().find((e) => e.nativeElement.offsetParent)?.nativeElement.focus());
  }
}
