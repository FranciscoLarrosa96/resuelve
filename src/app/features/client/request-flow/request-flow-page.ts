import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { NgTemplateOutlet, isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { CITY } from '../../../core/data/catalog.data';
import { URGENCY_LABELS } from '../../../core/models/request-status';
import { RequestStep, Urgency } from '../../../core/models/service-request';
import { businessDay, dayNumber, shiftDay, weekdayIndex } from '../../../core/utils/business-time';
import { formatDesiredDate } from '../../../core/utils/dates';
import { ZonesStore } from '../../../core/state/zones.store';
import { BackNavigation } from '../../../core/services/back-navigation.service';
import { avatarOf } from '../../../core/models/avatar';
import { ProfessionalsStore } from '../../../core/state/professionals.store';
import { ToastService } from '../../../core/services/toast.service';
import { FLOW_STEPS, RequestStore, targetIssueText } from '../../../core/state/request.store';
import { REQUEST_LIMITS } from '../../../core/models/request';
import { Avatar } from '../../../shared/components/avatar/avatar';
import { BackButton } from '../../../shared/components/back-button/back-button';
import { Icon } from '../../../shared/components/icon/icon';
import { ChipDirective } from '../../../shared/directives/chip.directive';
import { ServicePicker } from '../../../shared/components/service-picker/service-picker';
import { ServiceIcon } from '../../../shared/components/icon/service-icon';
import { WorkLocationPicker } from '../../../shared/components/work-location-picker/work-location-picker';
import { CatalogStore } from '../../../core/state/catalog.store';
import { Service } from '../../../core/models/category';

interface SummaryRow {
  key: string;
  /** Valor completo (desktop). */
  value: string;
  /** Valor abreviado (mobile). */
  short: string;
  step: RequestStep;
  /** Falta completarlo para poder enviar ("Falta elegir" + "Completar"). */
  missing?: boolean;
}

const DOW_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];


@Component({
  selector: 'app-request-flow-page',
  imports: [NgTemplateOutlet, Avatar, BackButton, Icon, ChipDirective, ServicePicker, ServiceIcon, WorkLocationPicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './request-flow-page.html',
})
export class RequestFlowPage {
  private readonly router = inject(Router);
  private readonly backNav = inject(BackNavigation);
  private readonly toast = inject(ToastService);
  private readonly pros = inject(ProfessionalsStore);
  protected readonly store = inject(RequestStore);
  protected readonly zones = inject(ZonesStore);

  protected readonly totalSteps = FLOW_STEPS;
  protected readonly limits = REQUEST_LIMITS;
  protected readonly draft = this.store.draft;
  protected readonly step = this.store.step;

  protected readonly urgencyOptions: { key: Urgency; label: string; hint: string }[] = [
    { key: 'FLEXIBLE', label: 'Puede esperar', hint: 'Esta semana está bien' },
    { key: 'TODAY', label: 'Necesito resolverlo hoy', hint: 'Buscás a quien pueda ir hoy' },
    { key: 'URGENT', label: 'Es una urgencia', hint: 'Te mostramos quién toma urgencias ahora' },
  ];

  /**
   * Opciones de "Cuándo" con el día REAL de hoy en Argentina (viajan como
   * `desiredDate`, date-only). La activa se deriva del borrador: no hay otra copia.
   */
  private readonly allWhenOptions = (() => {
    const today = businessDay();
    const sub = (day: string) => `${DOW_SHORT[weekdayIndex(day)].toLowerCase()} ${dayNumber(day)}`;
    return [
      { label: 'Hoy', sub: sub(today), offset: 0 },
      { label: 'Mañana', sub: sub(shiftDay(today, 1)), offset: 1 },
      { label: 'Elegir fecha', sub: 'calendario', offset: -1 },
    ];
  })();
  protected readonly whenOptions = computed(() =>
    this.draft().urgency === 'FLEXIBLE' ? this.allWhenOptions : this.allWhenOptions.slice(0, 1),
  );

  protected readonly dateOptions = Array.from({ length: 7 }, (_, i) => {
    const desiredDate = this.store.dateFor(i + 2);
    return { dow: DOW_SHORT[weekdayIndex(desiredDate)], num: dayNumber(desiredDate), label: formatDesiredDate(desiredDate), desiredDate };
  });

  /** La fecha elegida es otra que hoy o mañana (la marca "Elegir fecha"). */
  private readonly pickedOtherDate = computed(() => {
    const date = this.draft().desiredDate;
    return !!date && date !== this.store.dateFor(0) && date !== this.store.dateFor(1);
  });

  protected readonly summary = computed<SummaryRow[]>(() => {
    const d = this.draft();
    const urgency = URGENCY_LABELS[d.urgency];
    const service = this.store.problemLabel();
    const zone = this.store.zoneName();
    const when = this.store.whenLabel();
    return [
      { key: 'Servicio', value: service, short: service, step: 0 },
      { key: 'Urgencia', value: urgency, short: urgency, step: 1 },
      { key: 'Barrio', value: zone ?? 'Falta elegir', short: zone ?? 'Falta elegir', step: 2, missing: !zone },
      { key: 'Cuándo', value: when, short: when, step: 3 },
    ];
  });

  /** Descripción: si no alcanza el mínimo para enviar, se muestra como pendiente. */
  protected readonly descriptionMissing = computed(
    () => this.draft().description.trim().length < REQUEST_LIMITS.descriptionMin,
  );

  // ---- Pedido dirigido ------------------------------------------------------
  protected readonly targeted = this.store.targeted;
  protected readonly target = computed(() => {
    const list = this.store.recipients();
    if (!this.targeted() || !list.length) return null;
    const first = list[0];
    return {
      list: list.map((p) => ({ ...p, avatar: avatarOf(p) })),
      names: this.store.recipientNames(),
      cta: list.length === 1 ? `Solicitar presupuesto a ${first.firstName}` : `Solicitar presupuesto a los ${list.length}`,
    };
  });
  protected readonly targetProblems = computed(() => {
    const service = this.store.serviceName();
    const zone = this.store.zoneName();
    return this.store.targetProblems().map((p) => ({
      id: p.professional.id,
      text: targetIssueText(p.professional.firstName, p.issue, service, zone),
    }));
  });
  /** Encabezado del aviso: "Ariel ya no puede recibir este pedido con los cambios que hiciste." */
  protected readonly targetProblemTitle = computed(() => {
    const problems = this.store.targetProblems();
    if (!problems.length) return '';
    return problems.length === 1
      ? `${problems[0].professional.firstName} ya no puede recibir este pedido con los cambios que hiciste.`
      : 'Algunos profesionales ya no pueden recibir este pedido con los cambios que hiciste.';
  });

  /**
   * Profesionales reales del servicio detectado. Reusa la búsqueda de
   * resultados (misma request que usará /profesionales): solo el conteo y
   * hasta 4 avatares; nada si todavía no respondió.
   */
  private readonly matchReady = computed(() => {
    const id = this.store.service()?.id;
    return !!id && this.pros.filters().serviceId === id && this.pros.loaded();
  });
  protected readonly matchPros = computed(() =>
    this.matchReady() ? this.pros.items().slice(0, 4).map((p) => ({ id: p.id, avatar: avatarOf(p) })) : [],
  );
  protected readonly matchText = computed(() => {
    if (!this.matchReady()) return '';
    const n = this.pros.resultCount();
    const service = this.store.serviceName().toLowerCase();
    return n
      ? `${n} ${n === 1 ? 'profesional' : 'profesionales'} de ${service} en ${CITY}`
      : `Todavía no hay profesionales de ${service} en ${CITY}`;
  });

  private readonly catalog = inject(CatalogStore);
  /** No se pudo afirmar un servicio: se pide elegirlo (nunca se usa uno por defecto). */
  protected readonly uncertain = computed(() => this.store.uncertainOptions() !== null && !this.draft().service.slug);
  protected readonly uncertainChoices = computed(() =>
    (this.store.uncertainOptions() ?? [])
      .map((slug) => this.catalog.serviceBySlug(slug))
      .filter((s): s is Service => !!s),
  );

  /** La pregunta "¿Es correcto?" sólo se muestra cuando terminó el análisis. */
  protected readonly showConfirm = computed(() => this.step() === 0 && !this.store.analyzing());

  constructor() {
    const isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
    let first = true;
    effect(() => {
      this.step();
      if (first) {
        first = false;
        return;
      }
      if (isBrowser) window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    // Anticipa la búsqueda real del servicio detectado (la reutiliza /profesionales).
    effect(() => {
      const id = this.store.service()?.id;
      untracked(() => {
        if (id && this.pros.filters().serviceId !== id) this.pros.setFilters({ serviceId: id, licenseVerified: false });
      });
    });
    this.zones.load();
  }

  protected stepState(row: SummaryRow): 'done' | 'current' | 'pending' {
    const s = this.step();
    return s > row.step ? 'done' : s === row.step ? 'current' : 'pending';
  }

  protected back(): void {
    // En la revisión de un pedido dirigido, "volver" es volver a "Solicitar presupuesto".
    if (this.step() === FLOW_STEPS - 1 && this.targeted()) this.toQuote();
    else if (this.step() === 0) this.backNav.back('/');
    else this.store.previous();
  }

  /**
   * Urgencia. Descubriendo, "Es una urgencia" lleva a Urgencias (quién está
   * toma urgencias ahora). Con un profesional ya elegido NO: urgencia es un atributo
   * del pedido y el flujo dirigido se conserva (si él no toma urgencias ahora,
   * se avisa en la revisión).
   */
  protected pickUrgency(key: Urgency): void {
    const discover = key === 'URGENT' && !this.targeted();
    this.store.updateDraft({ urgency: key }, !discover);
    if (discover) this.router.navigate(['/urgencias'], { queryParams: { pedido: 1 } });
  }

  /** Paso 5 dirigido: vuelve a "Solicitar presupuesto" con el mismo borrador. */
  protected toQuote(): void {
    this.store.leaveToQuote();
    this.router.navigate(['/presupuesto']);
  }

  /** "Cambiar profesional" / "Buscar profesionales": única salida explícita del flujo dirigido. */
  protected changeProfessional(): void {
    this.store.changeProfessional();
    this.router.navigate(['/profesionales'], { queryParams: { pedido: 1 } });
  }

  protected pickWhen(option: { label: string; offset: number }): void {
    if (option.offset < 0) {
      this.store.showDates.set(true);
      return;
    }
    this.store.showDates.set(false);
    this.store.updateDraft({ desiredDate: this.store.dateFor(option.offset) }, true);
  }

  /** Activa según `desiredDate` (la única fuente), no según una etiqueta guardada. */
  protected isWhenActive(option: { offset: number }): boolean {
    if (option.offset < 0) return this.store.showDates() || this.pickedOtherDate();
    return !this.store.showDates() && this.draft().desiredDate === this.store.dateFor(option.offset);
  }

  protected isDateActive(date: { desiredDate: string }): boolean {
    return this.draft().desiredDate === date.desiredDate;
  }

  protected pickDate(date: { label: string; desiredDate: string }): void {
    this.store.showDates.set(false);
    this.store.updateDraft({ desiredDate: date.desiredDate }, true);
  }

  protected readonly textFields = [
    { key: 'title' as const, label: 'Título' },
    { key: 'description' as const, label: 'Descripción' },
  ];

  /** Filas de texto libre editables en "Revisá tu pedido". */
  protected readonly editing = signal<'title' | 'description' | null>(null);
  protected readonly editValue = signal('');

  protected startEdit(field: 'title' | 'description'): void {
    this.editValue.set(field === 'title' ? this.draft().title : this.draft().description);
    this.editing.set(field);
  }

  protected onEditInput(event: Event): void {
    this.editValue.set((event.target as HTMLInputElement | HTMLTextAreaElement).value);
  }

  protected cancelEdit(): void {
    this.editing.set(null);
  }

  protected saveEdit(): void {
    const field = this.editing();
    this.editing.set(null);
    if (field === 'title') {
      this.store.updateTitle(this.editValue());
    } else if (field === 'description' && this.store.updateDescription(this.editValue())) {
      this.toast.show(`Tu descripción corresponde a ${this.store.serviceName()}. Confirmá el servicio.`);
    }
  }

  /** "Cambiar servicio": abre el buscador de servicios y lo enfoca. */
  protected openServicePicker(fieldId: string): void {
    this.store.changingCategory.set(true);
    setTimeout(() => document.getElementById(fieldId)?.focus());
  }

  /** Resultados para ESTE pedido (el único camino que muestra "Tu pedido"). */
  protected seeResults(): void {
    this.router.navigate(['/profesionales'], { queryParams: { pedido: 1 } });
  }

  /** "Editar" una fila de la revisión: abre ese paso y, al elegir, vuelve a la revisión. */
  protected editRow(row: SummaryRow): void {
    this.store.editStep(row.step);
  }
}
