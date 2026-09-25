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
import { RequestStep, Urgency, ZoneRef } from '../../../core/models/service-request';
import { addDays, dayOfWeek, formatDesiredDate } from '../../../core/utils/dates';
import { ZonesStore } from '../../../core/state/zones.store';
import { BackNavigation } from '../../../core/services/back-navigation.service';
import { avatarOf } from '../../../core/models/avatar';
import { ProfessionalsStore } from '../../../core/state/professionals.store';
import { ToastService } from '../../../core/services/toast.service';
import { FLOW_STEPS, RequestStore } from '../../../core/state/request.store';
import { Avatar } from '../../../shared/components/avatar/avatar';
import { BackButton } from '../../../shared/components/back-button/back-button';
import { Icon } from '../../../shared/components/icon/icon';
import { ChipDirective } from '../../../shared/directives/chip.directive';
import { ServicePicker } from '../../../shared/components/service-picker/service-picker';

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
  private readonly pros = inject(ProfessionalsStore);
  protected readonly store = inject(RequestStore);
  protected readonly zones = inject(ZonesStore);

  protected readonly totalSteps = FLOW_STEPS;
  protected readonly draft = this.store.draft;
  protected readonly step = this.store.step;

  protected readonly urgencyOptions: { key: Urgency; label: string; hint: string }[] = [
    { key: 'FLEXIBLE', label: 'Puede esperar', hint: 'Esta semana está bien' },
    { key: 'TODAY', label: 'Necesito resolverlo hoy', hint: 'Buscás a quien pueda ir hoy' },
    { key: 'URGENT', label: 'Es una urgencia', hint: 'Te mostramos quién está disponible hoy' },
  ];

  /** Opciones de "Cuándo" con la fecha REAL de hoy (viajan como desiredDate). */
  private readonly allWhenOptions = (() => {
    const sub = (d: Date) => `${dayOfWeek(d).toLowerCase()} ${d.getDate()}`;
    const now = new Date();
    return [
      { label: 'Hoy', sub: sub(now), offset: 0 },
      { label: 'Mañana', sub: sub(addDays(now, 1)), offset: 1 },
      { label: 'Elegir fecha', sub: 'calendario', offset: -1 },
    ];
  })();
  protected readonly whenOptions = computed(() =>
    this.draft().urgency === 'FLEXIBLE' ? this.allWhenOptions : this.allWhenOptions.slice(0, 1),
  );

  protected readonly dateOptions = Array.from({ length: 7 }, (_, i) => {
    const offset = i + 2;
    const { desiredDate } = this.store.whenFor(offset);
    const d = addDays(new Date(), offset);
    return { dow: dayOfWeek(d), num: d.getDate(), label: formatDesiredDate(desiredDate), desiredDate };
  });

  protected readonly summary = computed<SummaryRow[]>(() => {
    const d = this.draft();
    const urgency = URGENCY_LABELS[d.urgency];
    const service = `${this.store.serviceName()} · ${d.title}`;
    return [
      { key: 'Servicio', value: service, short: service, step: 0 },
      { key: 'Urgencia', value: urgency, short: urgency, step: 1 },
      { key: 'Barrio', value: this.store.zoneName(), short: this.store.zoneName(), step: 2 },
      { key: 'Cuándo', value: d.when, short: d.when, step: 3 },
    ];
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
    if (this.step() === 0) this.backNav.back('/');
    else this.store.previous();
  }

  protected pickUrgency(key: Urgency): void {
    this.store.updateDraft({ urgency: key }, key !== 'URGENT');
    if (key === 'URGENT') this.router.navigate(['/urgencias']);
  }

  protected pickZone(zone: ZoneRef): void {
    this.store.setZone(zone, true);
  }

  protected pickWhen(option: { label: string; offset: number }): void {
    if (option.offset < 0) {
      this.store.showDates.set(true);
      return;
    }
    this.store.showDates.set(false);
    this.store.updateDraft({ when: option.label, desiredDate: this.store.whenFor(option.offset).desiredDate }, true);
  }

  protected isWhenActive(label: string): boolean {
    return label === 'Elegir fecha' ? this.store.showDates() : this.draft().when === label;
  }

  protected pickDate(date: { label: string; desiredDate: string }): void {
    this.store.showDates.set(false);
    this.store.updateDraft({ when: date.label, desiredDate: date.desiredDate }, true);
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
    this.router.navigate(['/profesionales']);
  }
}
