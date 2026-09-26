import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AgendaItem } from '../../../core/models/agenda';
import { AgendaStore } from '../../../core/state/agenda.store';
import {
  businessClock,
  businessDay,
  businessMinutes,
  dayNumber,
  formatDayHeading,
  formatDayLong,
  formatTimeRange,
  formatWeekRange,
  shortWeekday,
} from '../../../core/utils/business-time';
import { onTabVisible } from '../../../core/utils/on-tab-visible';
import { Icon } from '../../../shared/components/icon/icon';
import { SessionPending } from '../../../shared/components/session-pending/session-pending';

const HOUR_HEIGHT = 52;
/** Ventana mínima de la grilla; se amplía sola si hay trabajos antes o después. */
const FIRST_HOUR = 8;
const LAST_HOUR = 20;

export interface AgendaEntry extends AgendaItem {
  day: string;
  dayLabel: string;
  time: string;
  end: string;
  range: string;
  clientLabel: string;
  startMin: number;
  endMin: number;
  statusLabel: string;
}

const STATUS_LABELS: Record<string, string> = {
  PROPOSED: 'Sin confirmar',
  CONFIRMED: 'Confirmado',
  COMPLETED: 'Realizado',
};

export function toEntry(item: AgendaItem): AgendaEntry {
  const day = businessDay(item.startsAt);
  const startMin = businessMinutes(item.startsAt);
  // Un trabajo que cruza la medianoche se dibuja hasta el final de su día.
  const endMin = businessDay(item.endsAt) === day ? businessMinutes(item.endsAt) : 24 * 60;
  return {
    ...item,
    day,
    dayLabel: formatDayLong(day),
    time: businessClock(item.startsAt),
    end: businessClock(item.endsAt),
    range: formatTimeRange(item.startsAt, item.endsAt),
    clientLabel: `${item.client.firstName} ${item.client.lastInitial}.`,
    startMin,
    endMin: Math.max(endMin, startMin + 15),
    statusLabel: STATUS_LABELS[item.status] ?? item.status,
  };
}

/**
 * Agenda REAL: las citas del profesional autenticado (GET /pro/appointments,
 * una semana por pedido). Desktop: semana con columnas por día. Mobile: días
 * de la semana + lista del día elegido. Sin teléfono ni dirección: el detalle
 * está en la solicitud.
 */
@Component({
  selector: 'app-pro-agenda-page',
  imports: [RouterLink, Icon, SessionPending],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pro-agenda-page.html',
})
export class ProAgendaPage {
  protected readonly store = inject(AgendaStore);

  protected readonly today = signal(businessDay());
  private readonly nowMinutes = signal(businessMinutes(new Date()));
  protected readonly selectedId = signal<string | null>(null);
  protected readonly mobileDay = signal<string | null>(null);

  protected readonly entries = computed(() => this.store.items().map(toEntry));
  protected readonly weekLabel = computed(() => formatWeekRange(this.store.week()));
  protected readonly isCurrentWeek = computed(() => this.store.days().includes(this.today()));
  protected readonly jobsCount = computed(() => this.entries().filter((e) => e.status !== 'PROPOSED').length);
  protected readonly pendingCount = computed(() => this.entries().filter((e) => e.status === 'PROPOSED').length);
  protected readonly empty = computed(
    () => this.store.loadedWeek() === this.store.week() && !this.store.loading() && !this.entries().length,
  );

  protected readonly days = computed(() => {
    const today = this.today();
    const entries = this.entries();
    return this.store.days().map((day) => ({
      day,
      dow: shortWeekday(day),
      num: dayNumber(day),
      isToday: day === today,
      isPast: day < today,
      label: formatDayLong(day),
      heading: formatDayHeading(day, today),
      entries: entries.filter((e) => e.day === day),
    }));
  });

  protected readonly firstHour = computed(() =>
    Math.min(FIRST_HOUR, ...this.entries().map((e) => Math.floor(e.startMin / 60))),
  );
  protected readonly lastHour = computed(() =>
    Math.max(LAST_HOUR, ...this.entries().map((e) => Math.ceil(e.endMin / 60))),
  );
  protected readonly hours = computed(() =>
    Array.from({ length: this.lastHour() - this.firstHour() }, (_, i) => `${this.firstHour() + i}:00`),
  );
  protected readonly columnHeight = computed(() => this.hours().length * HOUR_HEIGHT);
  protected readonly nowTop = computed(() => {
    const min = this.nowMinutes();
    if (!this.isCurrentWeek() || min < this.firstHour() * 60 || min > this.lastHour() * 60) return null;
    return ((min - this.firstHour() * 60) / 60) * HOUR_HEIGHT;
  });
  /** La etiqueta de hora que pisaría la de "ahora" se oculta. */
  protected readonly hiddenHour = computed(() => {
    if (this.nowTop() === null) return -1;
    const offset = this.nowMinutes() - this.firstHour() * 60;
    const hour = Math.floor(offset / 60);
    const past = offset % 60;
    // La etiqueta de cada hora ocupa la parte de arriba de su fila.
    return past < 35 ? hour : past > 50 ? hour + 1 : -1;
  });
  protected readonly nowLabel = computed(() => {
    const m = this.nowMinutes();
    return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
  });

  /** Seleccionado; por defecto, el próximo trabajo de la semana. */
  protected readonly selected = computed(() => {
    const list = this.entries();
    const chosen = list.find((e) => e.id === this.selectedId());
    if (chosen) return chosen;
    const now = Date.now();
    return list.find((e) => e.status !== 'COMPLETED' && new Date(e.endsAt).getTime() >= now) ?? list[0] ?? null;
  });

  protected readonly activeMobileDay = computed(() => {
    const day = this.mobileDay();
    const days = this.store.days();
    if (day && days.includes(day)) return day;
    return days.includes(this.today()) ? this.today() : days[0];
  });
  protected readonly mobileEntries = computed(
    () => this.days().find((d) => d.day === this.activeMobileDay())?.entries ?? [],
  );
  protected readonly mobileHeading = computed(() => formatDayHeading(this.activeMobileDay(), this.today()));

  constructor() {
    effect(() => {
      if (this.store.hasProfile()) untracked(() => this.store.load());
    });
    onTabVisible(() => {
      this.tick();
      this.store.load(true);
    });
  }

  protected top(e: AgendaEntry): number {
    return ((e.startMin - this.firstHour() * 60) / 60) * HOUR_HEIGHT + 2;
  }

  protected height(e: AgendaEntry): number {
    return Math.max(((e.endMin - e.startMin) / 60) * HOUR_HEIGHT - 4, 26);
  }

  /** Confirmado: Forest. Sin confirmar: secundario, borde punteado. Realizado: apagado. */
  protected blockClasses(e: AgendaEntry): string {
    const tone =
      e.status === 'COMPLETED'
        ? 'bg-sand text-muted border-line-dash'
        : e.status === 'PROPOSED'
          ? 'bg-white text-ink-soft border-accent border-dashed'
          : 'bg-brand-soft text-brand-dark border-brand';
    return this.selected()?.id === e.id ? `${tone} outline-2 outline-offset-1 outline-ink` : tone;
  }

  protected blockLabel(e: AgendaEntry): string {
    return `${e.range}, ${e.service.name}, ${e.clientLabel}, ${e.zone.name}, ${e.statusLabel}`;
  }

  protected previous(): void {
    this.selectedId.set(null);
    this.mobileDay.set(null);
    this.store.previousWeek();
  }

  protected next(): void {
    this.selectedId.set(null);
    this.mobileDay.set(null);
    this.store.nextWeek();
  }

  protected goToday(): void {
    this.tick();
    this.selectedId.set(null);
    this.mobileDay.set(this.today());
    this.store.thisWeek();
  }

  protected retry(): void {
    this.store.load(true);
  }

  private tick(): void {
    this.today.set(businessDay());
    this.nowMinutes.set(businessMinutes(new Date()));
  }
}
