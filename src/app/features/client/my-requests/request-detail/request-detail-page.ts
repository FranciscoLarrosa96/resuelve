import {
  ChangeDetectionStrategy,
  Component,
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
  requestStatusDescription,
} from '../../../../core/models/request-status';
import { AuthStore } from '../../../../core/state/auth.store';
import { CatalogStore } from '../../../../core/state/catalog.store';
import { MyRequestsStore } from '../../../../core/state/my-requests.store';
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
  imports: [NgTemplateOutlet, RouterLink, Avatar, Dialog, Icon, RequestProgress, SessionPending, StatusPill],
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

  /** Parámetro de ruta :id */
  readonly id = input.required<string>();

  protected readonly money = formatMoney;
  protected readonly f1 = oneDecimal;
  protected readonly date = formatTimestamp;
  protected readonly day = formatDay;
  protected readonly quoteStatus = QUOTE_STATUS_LABELS;
  protected readonly invitationLabel = INVITATION_LABELS_FOR_CLIENT;

  protected readonly request = computed(() => {
    const r = this.store.detail();
    return r && r.id === this.id() ? r : null;
  });

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
    return s === 'CANCELLED' || s === 'CLOSED' || s === 'AWAITING_REVIEW';
  });

  // ---- Confirmaciones ------------------------------------------------
  /** Presupuesto a confirmar en el diálogo (null = cerrado). */
  protected readonly confirmingQuote = signal<string | null>(null);
  protected readonly confirmTarget = computed(() => this.quotes().find((i) => i.quote.id === this.confirmingQuote()) ?? null);
  protected readonly confirmingCancel = signal(false);
  protected readonly busy = computed(() => !!this.store.accepting() || this.store.cancelling());

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
        values: list.map((q) => (q.professional?.averageRating != null ? `★ ${oneDecimal(q.professional.averageRating)}` : 'Sin reseñas')),
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
    this.catalog.loadCatalog();
    onTabVisible(() => this.store.refreshDetail());
  }

  protected retry(): void {
    this.store.loadDetail(this.id(), true);
  }

  // ---- Aceptar -------------------------------------------------------
  protected askAccept(q: Quote): void {
    this.confirmingCancel.set(false);
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
