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
import { ProfessionalsApiService } from '../../../core/api/professionals-api.service';
import { Router } from '@angular/router';
import { REQUEST_STEPS, RequestStep, Urgency } from '../../../core/models/service-request';
import { businessDay, dayNumber, shiftDay, weekdayIndex } from '../../../core/utils/business-time';
import { formatDesiredDate } from '../../../core/utils/dates';
import { BackNavigation } from '../../../core/services/back-navigation.service';
import { avatarOf } from '../../../core/models/avatar';
import { ProfessionalsStore } from '../../../core/state/professionals.store';
import { FLOW_STEPS, RequestStore, recipientIssue, targetIssueText, toRecipient } from '../../../core/state/request.store';
import { ProfessionalFilters, ProfessionalSummary } from '../../../core/models/professional';
import { reputationLabel, reputationText } from '../../../core/utils/reputation';
import { responseText } from '../../../core/utils/professional-facts';
import { createRecipientEligibility } from '../../../core/state/recipient-eligibility';
import { LocalityStore } from '../../../core/state/locality.store';
import { ProBadge } from '../../../shared/components/plan-badges/plan-badges';
import { REQUEST_LIMITS } from '../../../core/models/request';
import { Avatar } from '../../../shared/components/avatar/avatar';
import { BackButton } from '../../../shared/components/back-button/back-button';
import { Icon } from '../../../shared/components/icon/icon';
import { ChipDirective } from '../../../shared/directives/chip.directive';
import { RequestServiceChoice } from '../../../shared/components/request-service-choice/request-service-choice';
import { RequestDescriptionField } from '../../../shared/components/request-description-field/request-description-field';
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
/** Sugeridos al final del pedido. */
export const SUGGESTED_PROS = 3;

@Component({
  selector: 'app-request-flow-page',
  imports: [NgTemplateOutlet, Avatar, BackButton, Icon, ChipDirective, ServiceIcon, WorkLocationPicker, ProBadge, RequestDescriptionField, RequestServiceChoice],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './request-flow-page.html',
})
export class RequestFlowPage {
  private readonly router = inject(Router);
  private readonly backNav = inject(BackNavigation);
  private readonly pros = inject(ProfessionalsStore);
  protected readonly store = inject(RequestStore);

  protected readonly totalSteps = FLOW_STEPS;
  protected readonly limits = REQUEST_LIMITS;
  protected readonly draft = this.store.draft;
  protected readonly step = this.store.step;

  /** Las tres urgencias siguen siendo estados distintos (ver `RequestStore.updateDraft`). */
  protected readonly urgencyOptions: { key: Urgency; label: string; hint: string }[] = [
    { key: 'URGENT', label: 'Es una urgencia', hint: 'Te mostramos quién atiende urgencias' },
    { key: 'TODAY', label: 'Necesito resolverlo hoy', hint: 'Buscás a quien pueda ir hoy' },
    { key: 'FLEXIBLE', label: 'Puede esperar', hint: 'Elegís el día que te viene bien' },
  ];

  /**
   * Opciones de fecha, SOLO bajo "Puede esperar", con el día REAL de hoy en Argentina (viajan como
   * `desiredDate`, date-only). "Hoy, si se puede" es FLEXIBLE con la fecha de hoy: no es "Necesito
   * resolverlo hoy" (TODAY). La activa se deriva del borrador: no hay otra copia.
   */
  protected readonly whenOptions = (() => {
    const today = businessDay();
    const sub = (day: string) => `${DOW_SHORT[weekdayIndex(day)].toLowerCase()} ${dayNumber(day)}`;
    return [
      { label: 'Hoy, si se puede', sub: sub(today), offset: 0 },
      { label: 'Mañana', sub: sub(shiftDay(today, 1)), offset: 1 },
      { label: 'Elegir fecha', sub: 'calendario', offset: -1 },
    ];
  })();

  protected readonly dateOptions = Array.from({ length: 7 }, (_, i) => {
    const desiredDate = this.store.dateFor(i + 2);
    return { dow: DOW_SHORT[weekdayIndex(desiredDate)], num: dayNumber(desiredDate), label: formatDesiredDate(desiredDate), desiredDate };
  });

  /** La fecha elegida es otra que hoy o mañana (la marca "Elegir fecha"). */
  private readonly pickedOtherDate = computed(() => {
    const date = this.draft().desiredDate;
    return !!date && date !== this.store.dateFor(0) && date !== this.store.dateFor(1);
  });

  /** Qué / Dónde / Cuándo: lo que se ve en el costado del escritorio. */
  protected readonly summary = computed<SummaryRow[]>(() => {
    const where = this.store.whereLabel();
    return [
      { key: 'Qué', value: this.store.serviceName() || 'Falta elegir', short: this.store.serviceName() || 'Falta elegir', step: REQUEST_STEPS.what, missing: !this.draft().service.slug },
      { key: 'Dónde', value: where ?? 'Falta elegir', short: where ?? 'Falta elegir', step: REQUEST_STEPS.where, missing: !where },
      { key: 'Cuándo', value: this.store.whenSummary(), short: this.store.whenSummary(), step: REQUEST_STEPS.when },
    ];
  });

  /** Filas de la revisión (cada una abre SU paso; la descripción y el servicio se editan en "Qué"). */
  protected readonly reviewRows = computed<SummaryRow[]>(() => {
    const description = this.draft().description.trim();
    const where = this.store.whereLabel();
    const rows: SummaryRow[] = [
      { key: 'Servicio', value: this.store.serviceName(), short: this.store.serviceName(), step: REQUEST_STEPS.what },
      {
        key: 'Descripción',
        value: description || 'Falta completar',
        short: description || 'Falta completar',
        step: REQUEST_STEPS.what,
        missing: this.store.descriptionMissing(),
      },
      { key: 'Dónde', value: where ?? 'Falta elegir', short: where ?? 'Falta elegir', step: REQUEST_STEPS.where, missing: !where },
      { key: 'Cuándo', value: this.store.whenSummary(), short: this.store.whenSummary(), step: REQUEST_STEPS.when },
    ];
    return rows;
  });

  protected readonly steps = REQUEST_STEPS;

  /** Paso "Qué": se puede seguir con servicio elegido y descripción suficiente. */
  protected readonly canContinueWhat = computed(() => !!this.draft().service.slug && !this.store.descriptionMissing());
  protected readonly whatHint = computed(() =>
    this.draft().service.slug && this.store.descriptionMissing()
      ? `Contá qué necesitás para continuar (mínimo ${REQUEST_LIMITS.descriptionMin} caracteres).`
      : '',
  );
  /** Paso "Cuándo": "Puede esperar" necesita un día; las urgencias ya tienen el de hoy. */
  protected readonly canContinueWhen = computed(() => this.draft().urgency !== 'FLEXIBLE' || !!this.draft().desiredDate);

  // ---- Pedido dirigido ------------------------------------------------------
  protected readonly targeted = this.store.targeted;
  protected readonly target = computed(() => {
    const list = this.store.recipients();
    if (!this.targeted() || !list.length) return null;
    const first = list[0];
    return {
      list: list.map((p) => ({ ...p, avatar: avatarOf(p) })),
      names: this.store.recipientNames(),
      cta: list.length === 1 ? `Pedir presupuesto a ${first.firstName}` : `Pedir presupuesto a los ${list.length}`,
    };
  });
  protected readonly targetProblems = computed(() => {
    const service = this.store.serviceName();
    const zone = this.store.zoneName();
    return this.store.targetProblems().map((p) => ({
      id: p.professional.id,
      text: targetIssueText(p.professional.firstName, p.issue, service, zone, this.store.locality()?.name ?? null),
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
    const city = this.store.locality()?.name;
    if (!city) return '';
    return n
      ? `${n} ${n === 1 ? 'profesional' : 'profesionales'} de ${service} en ${city}`
      : `Todavía no hay profesionales de ${service} en ${city}`;
  });

  // Sugeridos: consulta independiente sin espacios promocionados ni exclusión de los perfiles PRO.
  private readonly organicApi = inject(ProfessionalsApiService);
  private readonly organicQuery = computed<ProfessionalFilters | null>(() => {
    const d = this.draft();
    const locality = this.store.locality();
    if (this.targeted() || this.step() !== REQUEST_STEPS.review || !d.service.id || !locality) return null;
    return { service: d.service.id, locality: locality.id, ...(d.zone ? { zone: d.zone.id } : {}),
      ...(d.urgency === 'URGENT' ? { availableToday: true } : {}), sort: 'organic', pageSize: 20 };
  });
  private readonly organicResult = signal<{ key: string; items: ProfessionalSummary[] | null } | null>(null);
  private readonly loadOrganic = effect((onCleanup) => {
    const query = this.organicQuery();
    if (!query) return;
    const key = JSON.stringify(query);
    const sub = this.organicApi.getProfessionals(query).subscribe({
      next: ({ items }) => this.organicResult.set({ key, items }),
      error: () => this.organicResult.set({ key, items: null }),
    });
    onCleanup(() => sub.unsubscribe());
  });
  private readonly organicCurrent = computed(() => {
    const result = this.organicResult();
    return result?.key === JSON.stringify(this.organicQuery()) ? result : null;
  });
  private readonly candidates = computed(() => {
    const d = this.draft();
    const localityId = this.store.locality()?.id ?? null;
    return (this.organicCurrent()?.items ?? []).filter((p) => recipientIssue(toRecipient(p), d, localityId) === null);
  });
  private readonly eligibility = createRecipientEligibility(this.candidates);
  protected readonly suggestionsLoading = computed(() => (!!this.organicQuery() && !this.organicCurrent()) || this.eligibility.loading());
  protected readonly suggestionsUnverified = computed(() => this.organicCurrent()?.items === null || this.eligibility.unverified());
  protected readonly noEligibleSuggestions = this.eligibility.noneEligible;
  /** La posición orgánica no depende del plan; la elegibilidad sigue revalidándose al enviar. */
  protected readonly suggestions = computed(() => this.eligibility.eligible().slice(0, SUGGESTED_PROS).map((p) => ({
    pro: p, avatar: avatarOf(p), reputation: reputationText(p), reputationLabel: reputationLabel(p),
    hasRating: p.averageRating !== null, response: responseText(p.averageResponseMinutes),
  })));
  /** Los que el cliente desmarcó (el resto de los sugeridos va marcado). */
  protected readonly unchecked = signal<string[]>([]);
  protected readonly chosen = computed<ProfessionalSummary[]>(() =>
    this.suggestions()
      .map((s) => s.pro)
      .filter((p) => !this.unchecked().includes(p.id)),
  );
  protected readonly suggestedCta = computed(() => {
    const n = this.chosen().length;
    return n === 1 ? `Pedir presupuesto a ${this.chosen()[0].firstName}` : `Pedir presupuesto a los ${n}`;
  });

  protected toggleSuggested(id: string): void {
    this.unchecked.update((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  }

  /** Envía a los marcados: misma pantalla de envío ("/presupuesto") que desde resultados. */
  protected askSuggested(): void {
    const list = this.chosen();
    if (!list.length) return;
    this.store.askProfessionals(list, 'DISCOVERY', 'MARKETPLACE_DISCOVERY');
    this.router.navigate(['/presupuesto']);
  }

  private readonly catalog = inject(CatalogStore);
  /** No se pudo afirmar un servicio: se pide elegirlo (nunca se usa uno por defecto). */
  protected readonly uncertain = computed(() => this.store.uncertainOptions() !== null && !this.draft().service.slug);
  protected readonly uncertainChoices = computed(() =>
    (this.store.uncertainOptions() ?? [])
      .map((slug) => this.catalog.serviceBySlug(slug))
      .filter((s): s is Service => !!s),
  );

  /** La pregunta "¿Es correcto?" sólo se muestra cuando terminó el análisis. */
  /** Medición: cada paso mostrado de /solicitud (una vez por intento; recargas y vueltas atrás no suman). */
  private readonly trackStep = effect(() => {
    const step = this.step();
    untracked(() => this.store.trackStepViewed(step));
  });

  protected readonly showConfirm = computed(() => this.step() === REQUEST_STEPS.what && !this.store.analyzing());

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
    // La búsqueda es de la localidad DEL TRABAJO (igual que los resultados de un pedido).
    const locality = inject(LocalityStore);
    effect(() => {
      const work = this.draft().locality;
      if (this.step() === REQUEST_STEPS.review && work && work.id !== untracked(() => locality.id())) {
        untracked(() => locality.choose(work));
      }
    });
    // Anticipa la búsqueda real del servicio detectado (la reutiliza /profesionales).
    effect(() => {
      const id = this.store.service()?.id;
      untracked(() => {
        if (id && this.pros.filters().serviceId !== id) this.pros.setFilters({ serviceId: id, licenseVerified: false });
      });
    });
  }

  protected stepState(row: SummaryRow): 'done' | 'current' | 'pending' {
    const s = this.step();
    return s > row.step ? 'done' : s === row.step ? 'current' : 'pending';
  }

  protected back(): void {
    // En la revisión de un pedido dirigido, "volver" es volver a "Solicitar presupuesto".
    if (this.step() === REQUEST_STEPS.review && this.targeted()) this.toQuote();
    else if (this.step() === REQUEST_STEPS.what) this.backNav.back('/');
    else this.store.previous();
  }

  /**
   * Urgencia. Descubriendo, "Es una urgencia" lleva a Urgencias (quién atiende
   * urgencias). Con un profesional ya elegido NO: urgencia es un atributo
   * del pedido y el flujo dirigido se conserva (si él no atiende urgencias,
   * se avisa en la revisión). "Necesito resolverlo hoy" y la urgencia dirigida avanzan solas
   * (la fecha ya es hoy); "Puede esperar" abre los días y espera que se elija uno.
   * Las reglas de urgencia y fecha son las de `RequestStore.updateDraft`, sin cambios.
   */
  protected pickUrgency(key: Urgency): void {
    const discover = key === 'URGENT' && !this.targeted();
    if (key === 'FLEXIBLE') this.store.showDates.set(false);
    this.store.updateDraft({ urgency: key }, key !== 'FLEXIBLE' && !discover);
    if (discover) this.router.navigate(['/urgencias'], { queryParams: { pedido: 1 } });
  }

  /** Revisión de un pedido dirigido: vuelve a "Solicitar presupuesto" con el mismo borrador. */
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

  /** Título del pedido: siempre editable en la revisión. */
  protected readonly editingTitle = signal(false);
  protected readonly editValue = signal('');

  protected startEditTitle(): void {
    this.editValue.set(this.draft().title);
    this.editingTitle.set(true);
  }

  protected onEditInput(event: Event): void {
    this.editValue.set((event.target as HTMLInputElement).value);
  }

  protected cancelEdit(): void {
    this.editingTitle.set(false);
  }

  protected saveEdit(): void {
    this.editingTitle.set(false);
    this.store.updateTitle(this.editValue());
  }

  /** "Cambiar servicio": abre el selector y lo enfoca. */
  protected openServicePicker(fieldId: string): void {
    this.store.changingCategory.set(true);
    setTimeout(() => document.getElementById(fieldId)?.focus());
  }

  /** Resultados para ESTE pedido (el único camino que muestra "Tu pedido"). */
  protected seeResults(): void {
    this.router.navigate(['/profesionales'], { queryParams: { pedido: 1 } });
  }

  /** "Editar" una fila de la revisión: abre ese paso y, al terminar, vuelve a la revisión. */
  protected editRow(row: SummaryRow): void {
    this.store.editStep(row.step);
  }
}
