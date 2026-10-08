import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { AgendaItem } from '../../../core/models/agenda';
import { AgendaStore } from '../../../core/state/agenda.store';
import { ProRequestsStore } from '../../../core/state/pro-requests.store';
import { ToastService } from '../../../core/services/toast.service';
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
import { LaneSlot, layoutLanes } from '../../../core/utils/agenda-layout';
import { onTabVisible } from '../../../core/utils/on-tab-visible';
import { earliest, refreshWhenDue } from '../../../core/utils/refresh-when-due';
import { NotificationsStore } from '../../../core/state/notifications.store';
import { Dialog } from '../../../shared/components/dialog/dialog';
import { Icon } from '../../../shared/components/icon/icon';
import { SessionPending } from '../../../shared/components/session-pending/session-pending';

/** Alto de una hora en la grilla (px). Única fuente: la usa también la línea de fondo (`--agenda-hour`). */
export const HOUR_HEIGHT = 60;
/** Alto mínimo de un bloque: aunque dure 15 min, la hora y el servicio se leen. */
const MIN_BLOCK_PX = 30;
/**
 * Minutos que ocupa ese alto mínimo (+ 4 px de aire). Dos trabajos más
 * cercanos que esto se reparten el ancho aunque sus horarios no se toquen.
 */
const MIN_VISIBLE_MINUTES = Math.ceil(((MIN_BLOCK_PX + 4) / HOUR_HEIGHT) * 60);
/** Jornada visible por defecto (única fuente); la grilla se amplía sola si hay trabajos antes o después. */
export const WORKDAY_START = 8;
export const WORKDAY_END = 20;
/** Aire horizontal: contra los bordes de la columna y entre carriles simultáneos (2 + 2 = 4 px). */
const EDGE_GUTTER = 4;
const LANE_GAP_HALF = 2;

/** Bloque de la grilla desktop: el trabajo + su carril dentro del grupo de simultáneos. */
export interface PlacedEntry extends LaneSlot {
  entry: AgendaEntry;
}

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

/** "6 h", "1 h 30", "45 min". */
export function formatHours(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

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
    statusLabel: item.completionDue ? 'Pendiente de cierre' : (STATUS_LABELS[item.status] ?? item.status),
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
  imports: [RouterLink, Dialog, Icon, SessionPending],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pro-agenda-page.html',
})
export class ProAgendaPage {
  protected readonly store = inject(AgendaStore);
  protected readonly reqs = inject(ProRequestsStore);
  private readonly toast = inject(ToastService);

  protected readonly today = signal(businessDay());
  private readonly nowMinutes = signal(businessMinutes(new Date()));
  protected readonly selectedId = signal<string | null>(null);
  protected readonly mobileDay = signal<string | null>(null);

  protected readonly entries = computed(() => this.store.items().map(toEntry));
  /** Trabajos con horario terminado sin cerrar (de cualquier semana): van primero. */
  protected readonly due = computed(() => this.store.due().map(toEntry));
  /** Trabajo a marcar como realizado (confirmación abierta). */
  protected readonly completing = signal<AgendaEntry | null>(null);
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

  /** Bloques de cada día con su carril: nunca dos encimados. */
  protected readonly placed = computed(() => {
    const map = new Map<string, PlacedEntry[]>();
    for (const d of this.days()) {
      const lanes = layoutLanes(d.entries, MIN_VISIBLE_MINUTES);
      map.set(
        d.day,
        d.entries.map((entry) => ({ entry, ...(lanes.get(entry.id) ?? { lane: 0, lanes: 1 }) })),
      );
    }
    return map;
  });

  /** Resumen real de la semana visible (sin comparaciones ni metas inventadas). */
  protected readonly weekSummary = computed(() => {
    const list = this.entries();
    const scheduled = list.filter((e) => e.status !== 'PROPOSED');
    return {
      confirmed: list.filter((e) => e.status === 'CONFIRMED' && !e.completionDue).length,
      proposed: list.filter((e) => e.status === 'PROPOSED').length,
      completed: list.filter((e) => e.status === 'COMPLETED').length,
      due: list.filter((e) => e.completionDue).length,
      hours: formatHours(scheduled.reduce((sum, e) => sum + e.durationMinutes, 0)),
    };
  });

  protected readonly firstHour = computed(() =>
    Math.min(WORKDAY_START, ...this.entries().map((e) => Math.floor(e.startMin / 60))),
  );
  protected readonly lastHour = computed(() =>
    Math.max(WORKDAY_END, ...this.entries().map((e) => Math.ceil(e.endMin / 60))),
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
    return (
      list.find((e) => e.completionDue) ??
      list.find((e) => e.status !== 'COMPLETED' && new Date(e.endsAt).getTime() >= now) ??
      list[0] ??
      null
    );
  });

  /** El resto del día del trabajo seleccionado (panel lateral). */
  protected readonly sameDay = computed(() => {
    const ev = this.selected();
    return ev ? this.entries().filter((e) => e.day === ev.day) : [];
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

  private readonly notifications = inject(NotificationsStore);
  private readonly injector = inject(Injector);
  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');
  protected readonly hourHeight = HOUR_HEIGHT;
  /** Bloque con el tooltip abierto (hover o foco), solo si es chico. */
  protected readonly hintId = signal<string | null>(null);

  constructor() {
    // Al cargar una semana, la grilla arranca en la jornada o en el trabajo seleccionado (nunca desde la medianoche).
    effect(() => {
      const week = this.store.loadedWeek();
      if (!week) return;
      untracked(() => afterNextRender(() => this.scrollToSelected(), { injector: this.injector }));
    });
    effect(() => {
      if (this.store.hasProfile())
        untracked(() => {
          this.store.load();
          this.store.loadDue();
        });
    });
    onTabVisible(() => {
      this.tick();
      this.store.load(true);
      this.store.loadDue();
    });
    // "Pendiente de cierre" lo decide el backend: relectura puntual cuando termina el próximo trabajo confirmado.
    refreshWhenDue(
      () => earliest(this.store.items().map((e) => (e.status === 'CONFIRMED' && !e.completionDue ? e.endsAt : null))),
      () => {
        this.tick();
        this.store.load(true);
        this.store.loadDue();
        void this.notifications.refresh();
      },
    );
  }

  protected top(e: AgendaEntry): number {
    return ((e.startMin - this.firstHour() * 60) / 60) * HOUR_HEIGHT + 2;
  }

  protected height(e: AgendaEntry): number {
    return Math.max(((e.endMin - e.startMin) / 60) * HOUR_HEIGHT - 4, MIN_BLOCK_PX);
  }

  /** Posición horizontal del carril: 4 px contra los bordes y 4 px entre trabajos simultáneos. */
  protected left(p: PlacedEntry): string {
    return `calc(${(p.lane / p.lanes) * 100}% + ${p.lane === 0 ? EDGE_GUTTER : LANE_GAP_HALF}px)`;
  }

  protected width(p: PlacedEntry): string {
    const gutter = (p.lane === 0 ? EDGE_GUTTER : LANE_GAP_HALF) + (p.lane === p.lanes - 1 ? EDGE_GUTTER : LANE_GAP_HALF);
    return `calc(${100 / p.lanes}% - ${gutter}px)`;
  }

  /**
   * Líneas de texto que entran por alto: 1 (hora + servicio), 2 (+ estado),
   * 3 (hora / servicio / estado) o 4 (+ cliente y barrio).
   */
  protected lines(e: AgendaEntry): 1 | 2 | 3 | 4 {
    const h = this.height(e);
    return h >= 100 ? 4 : h >= 54 ? 3 : h >= 40 ? 2 : 1;
  }

  /** Bloque que no muestra todo (corto o angosto): el resto va en un tooltip al pasar o enfocar. */
  protected isCompact(p: PlacedEntry): boolean {
    return this.density(p) !== 'full' || this.lines(p.entry) < 3;
  }

  protected showHint(p: PlacedEntry): void {
    this.hintId.set(this.isCompact(p) ? p.entry.id : null);
  }

  protected hideHint(id: string): void {
    if (this.hintId() === id) this.hintId.set(null);
  }

  /** Tooltip debajo del bloque (o arriba si no entra). */
  protected hintTop(e: AgendaEntry): number {
    const below = this.top(e) + this.height(e) + 6;
    return below + 92 > this.columnHeight() ? Math.max(this.top(e) - 98, 0) : below;
  }

  /** Tono del estado (lista del día, mobile, inspector). */
  protected tone(e: AgendaEntry): 'confirmed' | 'pending' | 'completed' {
    return e.status === 'COMPLETED' ? 'completed' : e.status === 'PROPOSED' || e.completionDue ? 'pending' : 'confirmed';
  }

  /**
   * Cuánto texto entra: con un carril, todo; con dos, hora y servicio; con
   * tres o más, solo la hora (el resto está en el panel y en el aria-label).
   */
  protected density(p: PlacedEntry): 'full' | 'narrow' | 'tiny' {
    return p.lanes === 1 ? 'full' : p.lanes === 2 ? 'narrow' : 'tiny';
  }

  /**
   * Color por ESTADO (nunca por servicio), siempre con el estado escrito:
   * confirmado = verde; sin confirmar y pendiente de cierre = Terracotta
   * (sin confirmar, además, con borde punteado); realizado = neutro.
   * Seleccionado: contorno de 2 px y por encima del resto.
   */
  protected blockClasses(e: AgendaEntry): string {
    const tone = {
      confirmed: 'bg-agenda-event-confirmed text-agenda-event-confirmed-ink border-agenda-event-confirmed-edge',
      pending: 'bg-agenda-event-pending text-agenda-event-pending-ink border-agenda-event-pending-edge',
      completed: 'bg-agenda-event-completed text-agenda-event-completed-ink border-agenda-event-completed-edge',
    }[this.tone(e)];
    const dashed = e.status === 'PROPOSED' ? ' border-dashed' : '';
    return this.selected()?.id === e.id
      ? `${tone}${dashed} z-3 outline-2 outline-offset-1 outline-ink shadow-agenda-event`
      : `${tone}${dashed} z-1`;
  }

  protected duration(e: AgendaEntry): string {
    return formatHours(e.durationMinutes);
  }

  protected blockLabel(e: AgendaEntry): string {
    const news = this.hasNews(e) ? 'Novedad: el cliente confirmó el horario. ' : '';
    return `${news}${e.range}, ${e.service.name}, ${e.clientLabel}, ${e.zone.name}, ${e.statusLabel}`;
  }

  /** Novedad de la Agenda sin leer para ese trabajo (horario confirmado). */
  protected hasNews(e: AgendaEntry): boolean {
    return (this.notifications.proByRequest().get(e.requestId) ?? []).some((n) => n.section === 'AGENDA');
  }

  /** Abrir un trabajo en la Agenda marca leída SOLO su novedad de Agenda (no las de Solicitudes). */
  protected select(e: AgendaEntry): void {
    this.selectedId.set(e.id);
    if (this.hasNews(e)) void this.notifications.markRead(e.requestId, 'PROFESSIONAL', 'AGENDA');
  }

  // ---- Marcar como realizado ----------------------------------------------
  protected askComplete(e: AgendaEntry): void {
    this.completing.set(e);
  }

  protected closeComplete(): void {
    if (this.reqs.appointmentAction() !== 'complete') this.completing.set(null);
  }

  protected async confirmComplete(): Promise<void> {
    const e = this.completing();
    if (!e) return;
    const ok = await this.reqs.complete(e.requestId);
    this.completing.set(null);
    this.store.load(true);
    this.store.loadDue();
    this.toast.show(
      ok ? 'Listo. El trabajo quedó registrado como realizado.' : (this.reqs.actionError() ?? 'No pudimos guardar el cambio.'),
      ok ? 6000 : 5000,
      ok ? 'success' : 'info',
      // El pedido de reseña vive en el detalle de la solicitud (`ReviewAsk`).
      ok ? { label: 'Pedir reseña', link: ['/pro/solicitudes', e.requestId] } : null,
    );
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

  /** Deja a la vista el trabajo seleccionado (o el inicio de la jornada). */
  private scrollToSelected(): void {
    const el = this.scroller()?.nativeElement;
    const ev = this.selected();
    if (!el || typeof el.scrollTo !== 'function') return;
    const header = 52;
    const target = ev ? this.top(ev) : ((WORKDAY_START - this.firstHour()) * HOUR_HEIGHT);
    const fits = ev ? this.top(ev) + this.height(ev) + header <= el.clientHeight : false;
    el.scrollTo({ top: fits ? 0 : Math.max(target - HOUR_HEIGHT, 0) });
  }

  private tick(): void {
    this.today.set(businessDay());
    this.nowMinutes.set(businessMinutes(new Date()));
  }
}
