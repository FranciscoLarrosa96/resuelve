import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AGENDA_EVENTS, AGENDA_WEEK, WEEK_DAYS } from '../../../core/data/pro.data';
import { AgendaEvent } from '../../../core/models/pro';
import { ToastService } from '../../../core/services/toast.service';
import { Icon } from '../../../shared/components/icon/icon';
import { dayLabel, eventsOfDay, TimelineItem } from '../pro-ui';

const HOUR_HEIGHT = 52;

@Component({
  selector: 'app-pro-agenda-page',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pro-agenda-page.html',
})
export class ProAgendaPage {
  private readonly toast = inject(ToastService);

  protected readonly week = AGENDA_WEEK;
  protected readonly hours = Array.from(
    { length: AGENDA_WEEK.lastHour - AGENDA_WEEK.firstHour + 1 },
    (_, i) => `${AGENDA_WEEK.firstHour + i}:00`,
  );
  protected readonly columnHeight = this.hours.length * HOUR_HEIGHT;
  protected readonly nowTop = (AGENDA_WEEK.now - AGENDA_WEEK.firstHour) * HOUR_HEIGHT;

  /** Turnos que el profesional confirmó en esta sesión. */
  private readonly confirmedIds = signal<string[]>([]);
  protected readonly selectedId = signal('e3');
  /** Mobile: día elegido y turno expandido. */
  protected readonly mobileDay = signal(AGENDA_WEEK.todayIndex);
  protected readonly expandedId = signal<string | null>(null);

  protected readonly days = computed(() =>
    WEEK_DAYS.map((dow, i) => ({
      index: i,
      dow,
      num: AGENDA_WEEK.firstDayNumber + i,
      isToday: i === AGENDA_WEEK.todayIndex,
      events: eventsOfDay(i).map((e) => this.withConfirmation(e)),
    })),
  );

  protected readonly selected = computed(() => {
    const e = AGENDA_EVENTS.find((x) => x.id === this.selectedId()) ?? AGENDA_EVENTS[0];
    return this.withConfirmation({ ...e, ...eventsOfDay(e.day).find((x) => x.id === e.id)! });
  });

  protected readonly mobileEvents = computed(() => this.days()[this.mobileDay()].events);
  protected readonly weekTotal = AGENDA_EVENTS.length;
  protected readonly dayLabel = dayLabel;

  protected top(e: AgendaEvent): number {
    return (e.start - AGENDA_WEEK.firstHour) * HOUR_HEIGHT + 2;
  }

  protected height(e: AgendaEvent): number {
    return e.duration * HOUR_HEIGHT - 6;
  }

  protected eventClasses(e: TimelineItem): string {
    const selected = e.id === this.selectedId();
    const bg = e.past ? 'bg-[#EFEBE3] text-muted' : e.tentative ? 'bg-[#FFF8EF] text-brand-dark' : 'bg-brand-soft text-brand-dark';
    const border = selected ? 'border-brand' : e.tentative ? 'border-[#E7BD8C]' : 'border-transparent';
    return `${bg} ${border}`;
  }

  protected toggleMobile(e: AgendaEvent): void {
    this.selectedId.set(e.id);
    this.expandedId.update((id) => (id === e.id ? null : e.id));
  }

  protected onTheWay(e: AgendaEvent): void {
    this.toast.show(`Le avisamos a ${e.client} que vas en camino`);
  }

  protected directions(e: AgendaEvent): void {
    this.toast.show(`Abrimos el mapa hacia ${e.address}, ${e.zone} (próximamente)`);
  }

  protected confirm(e: AgendaEvent): void {
    this.confirmedIds.update((ids) => [...ids, e.id]);
    this.toast.show(`Turno confirmado con ${e.client}`);
  }

  protected otherWeek(): void {
    this.toast.show('Por ahora solo mostramos la semana actual');
  }

  private withConfirmation<T extends AgendaEvent>(e: T): T {
    return this.confirmedIds().includes(e.id) ? { ...e, tentative: false } : e;
  }
}
