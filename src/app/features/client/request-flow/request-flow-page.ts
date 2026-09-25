import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { NgTemplateOutlet, isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { CITY, NEIGHBORHOODS, TODAY, URGENCY_LABELS } from '../../../core/data/catalog.data';
import { RequestStep, Urgency } from '../../../core/models/service-request';
import { BackNavigation } from '../../../core/services/back-navigation.service';
import { ProfessionalsService } from '../../../core/services/professionals.service';
import { ToastService } from '../../../core/services/toast.service';
import { FLOW_STEPS, RequestStore } from '../../../core/state/request.store';
import { SearchStore } from '../../../core/state/search.store';
import { photosLabel } from '../../../core/utils/format';
import { Avatar } from '../../../shared/components/avatar/avatar';
import { BackButton } from '../../../shared/components/back-button/back-button';
import { Icon } from '../../../shared/components/icon/icon';
import { ChipDirective } from '../../../shared/directives/chip.directive';
import { ServicePicker } from '../../../shared/components/service-picker/service-picker';

const DOW = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

interface SummaryRow {
  key: string;
  /** Valor completo (desktop). */
  value: string;
  /** Valor abreviado (mobile). */
  short: string;
  step: RequestStep;
}

@Component({
  selector: 'app-request-flow-page',
  imports: [NgTemplateOutlet, Avatar, BackButton, Icon, ChipDirective, ServicePicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './request-flow-page.html',
})
export class RequestFlowPage {
  private readonly router = inject(Router);
  private readonly backNav = inject(BackNavigation);
  private readonly toast = inject(ToastService);
  private readonly pros = inject(ProfessionalsService);
  private readonly search = inject(SearchStore);
  protected readonly store = inject(RequestStore);

  protected readonly totalSteps = FLOW_STEPS;
  protected readonly neighborhoods = NEIGHBORHOODS;
  protected readonly draft = this.store.draft;
  protected readonly step = this.store.step;

  protected readonly urgencyOptions: { key: Urgency; label: string; hint: string }[] = [
    { key: 'wait', label: 'Puede esperar', hint: 'Esta semana está bien' },
    { key: 'today', label: 'Necesito resolverlo hoy', hint: 'Priorizamos a quienes tienen turno hoy' },
    { key: 'urgent', label: 'Es una urgencia', hint: 'Te mostramos quién puede ir ahora' },
  ];

  private readonly allWhenOptions = (() => {
    const tomorrow = new Date(TODAY);
    tomorrow.setDate(TODAY.getDate() + 1);
    const sub = (d: Date) => `${DOW[d.getDay()].toLowerCase()} ${d.getDate()}`;
    return [
      { label: 'Hoy', sub: sub(TODAY) },
      { label: 'Mañana', sub: sub(tomorrow) },
      { label: 'Elegir fecha', sub: 'calendario' },
    ];
  })();
  protected readonly whenOptions = computed(() =>
    this.draft().urgency === 'wait' ? this.allWhenOptions : this.allWhenOptions.slice(0, 1),
  );

  protected readonly dateOptions = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(TODAY);
    d.setDate(d.getDate() + i + 2);
    return { dow: DOW[d.getDay()], num: d.getDate(), label: `${DOW[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}` };
  });

  protected readonly photoTiles = computed(() =>
    Array.from({ length: this.draft().photos }, (_, i) => `foto_${i + 1}.jpg`),
  );

  protected readonly summary = computed<SummaryRow[]>(() => {
    const d = this.draft();
    const urgency = URGENCY_LABELS[d.urgency];
    const service = `${this.store.serviceName()} · ${d.title}`;
    return [
      { key: 'Servicio', value: service, short: service, step: 0 },
      { key: 'Urgencia', value: urgency, short: urgency, step: 1 },
      { key: 'Zona', value: d.zone, short: d.zone, step: 2 },
      { key: 'Cuándo', value: d.when, short: d.when, step: 3 },
      { key: 'Fotos', value: photosLabel(d.photos), short: photosLabel(d.photos), step: 4 },
    ];
  });

  protected readonly matchPros = computed(() => this.pros.offering(this.draft().service.slug));
  protected readonly matchText = computed(
    () => `${this.matchPros().length} profesionales de ${this.store.serviceName().toLowerCase()} en ${CITY}`,
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
  }

  protected stepState(row: SummaryRow): 'done' | 'current' | 'pending' {
    const s = this.step();
    return s > row.step ? 'done' : s === row.step ? 'current' : 'pending';
  }

  protected back(): void {
    if (this.step() === 0) this.backNav.back('/');
    else this.store.previous();
  }

  protected pickUrgency(key: Urgency): void {
    this.store.updateDraft({ urgency: key }, key !== 'urgent');
    if (key === 'urgent') this.router.navigate(['/urgencias']);
  }

  protected useLocation(): void {
    this.toast.show('Ubicación aproximada: Villa Italia');
    this.store.updateDraft({ zone: 'Villa Italia' }, true);
  }

  protected pickWhen(label: string): void {
    if (label === 'Elegir fecha') {
      this.store.showDates.set(true);
      return;
    }
    this.store.showDates.set(false);
    this.store.updateDraft({ when: label }, true);
  }

  protected isWhenActive(label: string): boolean {
    return label === 'Elegir fecha' ? this.store.showDates() : this.draft().when === label;
  }

  protected pickDate(label: string): void {
    this.store.showDates.set(false);
    this.store.updateDraft({ when: label }, true);
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

  protected seeResults(): void {
    this.search.invalidate();
    this.router.navigate(['/profesionales']);
  }
}
