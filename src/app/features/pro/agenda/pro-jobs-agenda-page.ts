import { NgTemplateOutlet, isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { JobListItem, JobStatus } from '../../../core/models/job';
import { JobsStore } from '../../../core/state/jobs.store';
import { formatCalendarDay, normalizeCalendarDay } from '../../../core/utils/dates';
import {
  businessDay,
  businessMinutes,
  dayNumber,
  formatDayHeading,
  formatDayLong,
  shiftDay,
  shortWeekday,
  weekStart,
} from '../../../core/utils/business-time';
import { jobScheduleLabel } from '../../../core/utils/job-display';
import { TabsDirective } from '../../../shared/directives/tabs.directive';
import { Icon } from '../../../shared/components/icon/icon';
import { SessionPending } from '../../../shared/components/session-pending/session-pending';

type AgendaFilter = 'ALL' | 'TODAY' | 'PENDING' | 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED';
const FILTERS: { key: AgendaFilter; label: string }[] = [
  { key: 'ALL', label: 'Todos' },
  { key: 'TODAY', label: 'Hoy' },
  { key: 'PENDING', label: 'Para coordinar' },
  { key: 'SCHEDULED', label: 'Agendados' },
  { key: 'IN_PROGRESS', label: 'En curso' },
  { key: 'COMPLETED', label: 'Realizados' },
];
/** Trabajos que ocupan un lugar en el día (los cancelados no). */
const ON_CALENDAR: JobStatus[] = ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED'];
const OPEN: JobStatus[] = ['SCHEDULED', 'IN_PROGRESS'];
const toMinutes = (time: string | null) => {
  if (!time) return null;
  const [h, m] = time.split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
};
const clock = (minutes: number) =>
  `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

export type TimelineEntry = { kind: 'now'; label: string } | { kind: 'job'; job: JobListItem };

const STATUS_LABEL: Record<JobStatus, string> = {
  TO_COORDINATE: 'Para coordinar',
  SCHEDULED: 'Agendado',
  IN_PROGRESS: 'En curso',
  COMPLETED: 'Realizado',
  CANCELLED: 'Cancelado',
};

@Component({
  selector: 'app-pro-jobs-agenda-page',
  imports: [RouterLink, NgTemplateOutlet, Icon, SessionPending, TabsDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pro-jobs-agenda-page.html',
  styleUrl: './pro-jobs-agenda-page.css',
})
export class ProJobsAgendaPage {
  protected readonly store = inject(JobsStore);
  protected readonly today = signal(businessDay());
  /** Minutos desde las 00 (Argentina): la línea de «ahora» y el «en 40 min». */
  protected readonly nowMinutes = signal(businessMinutes(new Date()));
  /** Día elegido en la tira de la semana; por defecto, hoy. */
  protected readonly selectedDay = signal(businessDay());
  protected readonly todayLabel = computed(() => formatDayLong(this.today()));
  protected readonly filter = signal<AgendaFilter>('ALL');
  protected readonly filters = FILTERS;
  protected readonly emptySteps = [
    { title: 'Un cliente acepta tu presupuesto', text: 'Te avisamos y el trabajo aparece en "Para coordinar".' },
    { title: 'Proponés día y hora', text: 'El cliente confirma o pide otro horario.' },
    { title: 'Queda en tu agenda', text: 'Al terminar, vos o el cliente lo marcan como realizado.' },
  ];
  protected readonly todayJobs = computed(() =>
    this.store
      .items()
      .filter(
        (job) =>
          normalizeCalendarDay(job.scheduledDate) === this.today() &&
          ['SCHEDULED', 'IN_PROGRESS'].includes(job.status),
      )
      .sort((a, b) => (a.scheduledTime ?? '99:99').localeCompare(b.scheduledTime ?? '99:99')),
  );
  protected readonly toCoordinate = computed(() =>
    this.store.items().filter((job) => job.status === 'TO_COORDINATE'),
  );
  protected readonly needsReview = computed(() =>
    this.store
      .items()
      .filter(
        (job) =>
          ['SCHEDULED', 'IN_PROGRESS'].includes(job.status) &&
          (!normalizeCalendarDay(job.scheduledDate) ||
            normalizeCalendarDay(job.scheduledDate)! < this.today()),
      ),
  );
  protected readonly upcoming = computed(() =>
    this.store
      .items()
      .filter(
        (job) =>
          job.scheduledDate &&
          normalizeCalendarDay(job.scheduledDate)! > this.today() &&
          ['SCHEDULED', 'IN_PROGRESS'].includes(job.status),
      ),
  );
  protected readonly upcomingDays = computed(() => {
    const groups = new Map<string, JobListItem[]>();
    for (const job of [...this.upcoming()].sort(
      (a, b) =>
        (normalizeCalendarDay(a.scheduledDate) ?? '').localeCompare(
          normalizeCalendarDay(b.scheduledDate) ?? '',
        ) || (a.scheduledTime ?? '').localeCompare(b.scheduledTime ?? ''),
    )) {
      const date = normalizeCalendarDay(job.scheduledDate)!;
      groups.set(date, [...(groups.get(date) ?? []), job]);
    }
    return [...groups].map(([date, jobs]) => ({
      date,
      jobs,
      label: formatCalendarDay(date, { weekday: 'long' }),
      weekday: shortWeekday(date),
      number: dayNumber(date),
    }));
  });
  protected readonly completed = computed(() =>
    this.store.items().filter((job) => job.status === 'COMPLETED'),
  );
  protected readonly cancelled = computed(() =>
    this.store.items().filter((job) => job.status === 'CANCELLED'),
  );
  /** Lunes a domingo de esta semana, con un punto si el día tiene trabajos. */
  protected readonly week = computed(() => {
    const busy = new Set(
      this.store
        .items()
        .filter((job) => ON_CALENDAR.includes(job.status))
        .map((job) => normalizeCalendarDay(job.scheduledDate)),
    );
    const monday = weekStart(this.today());
    return Array.from({ length: 7 }, (_, i) => {
      const day = shiftDay(monday, i);
      return {
        day,
        weekday: shortWeekday(day),
        number: dayNumber(day),
        isToday: day === this.today(),
        busy: busy.has(day),
        label: formatDayLong(day),
      };
    });
  });
  protected readonly selectedIsToday = computed(() => this.selectedDay() === this.today());
  protected readonly selectedHeading = computed(() =>
    this.selectedIsToday() ? 'Hoy' : formatDayHeading(this.selectedDay(), this.today()),
  );
  /** Trabajos del día elegido (hoy: solo los abiertos, como siempre). */
  protected readonly dayJobs = computed(() => {
    if (this.selectedIsToday()) return this.todayJobs();
    const day = this.selectedDay();
    return this.store
      .items()
      .filter((job) => normalizeCalendarDay(job.scheduledDate) === day && ON_CALENDAR.includes(job.status))
      .sort((a, b) => (a.scheduledTime ?? '99:99').localeCompare(b.scheduledTime ?? '99:99'));
  });
  /** El día como línea de tiempo; hoy, con la marca de «ahora» entre lo que pasó y lo que viene. */
  protected readonly timeline = computed<TimelineEntry[]>(() => {
    const jobs = this.dayJobs();
    const entries: TimelineEntry[] = jobs.map((job) => ({ kind: 'job', job }));
    if (!this.selectedIsToday() || !jobs.length) return entries;
    const now = this.nowMinutes();
    const at = jobs.findIndex((job) => (toMinutes(job.scheduledTime) ?? Infinity) > now);
    entries.splice(at === -1 ? entries.length : at, 0, { kind: 'now', label: clock(now) });
    return entries;
  });
  /** El próximo trabajo abierto (hoy desde ahora, o el siguiente día con trabajo). */
  protected readonly nextJob = computed(() => {
    const today = this.today();
    const now = this.nowMinutes();
    const candidates = this.store
      .items()
      .filter((job) => {
        const day = normalizeCalendarDay(job.scheduledDate);
        if (!day || !OPEN.includes(job.status) || day < today) return false;
        if (day > today || job.status === 'IN_PROGRESS') return true;
        const start = toMinutes(job.scheduledTime);
        const end = start === null ? null : start + (job.durationMinutes ?? 0);
        return end === null || end >= now;
      })
      .sort(
        (a, b) =>
          (normalizeCalendarDay(a.scheduledDate) ?? '').localeCompare(normalizeCalendarDay(b.scheduledDate) ?? '') ||
          (a.scheduledTime ?? '99:99').localeCompare(b.scheduledTime ?? '99:99'),
      );
    const job = candidates[0];
    if (!job) return null;
    const day = normalizeCalendarDay(job.scheduledDate)!;
    const start = toMinutes(job.scheduledTime);
    let when: string;
    if (day !== today) when = formatDayHeading(day, today);
    else if (job.status === 'IN_PROGRESS' || (start !== null && start <= now)) when = 'Ahora';
    else if (start === null) when = 'Hoy';
    else {
      const diff = start - now;
      when = diff < 60 ? `en ${diff} min` : `en ${Math.round(diff / 60)} h`;
    }
    return { job, when, start: job.scheduledTime, end: this.endTime(job) };
  });

  protected readonly filteredItems = computed(() => {
    const all = this.store.items();
    switch (this.filter()) {
      case 'TODAY':
        return this.todayJobs();
      case 'PENDING':
        return this.toCoordinate();
      case 'SCHEDULED':
        return all.filter((job) => job.status === 'SCHEDULED');
      case 'IN_PROGRESS':
        return all.filter((job) => job.status === 'IN_PROGRESS');
      case 'COMPLETED':
        return this.completed();
      default:
        return all;
    }
  });

  protected filterCount(key: AgendaFilter): number {
    switch (key) {
      case 'TODAY':
        return this.todayJobs().length;
      case 'PENDING':
        return this.toCoordinate().length;
      case 'SCHEDULED':
        return this.store.items().filter((job) => job.status === 'SCHEDULED').length;
      case 'IN_PROGRESS':
        return this.store.items().filter((job) => job.status === 'IN_PROGRESS').length;
      case 'COMPLETED':
        return this.completed().length;
      default:
        return this.store.items().length;
    }
  }

  constructor() {
    effect(() => {
      if (this.store.hasProfile()) untracked(() => this.store.load());
    });
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      // Solo mueve la marca de «ahora»: no vuelve a pedir datos.
      const tick = setInterval(() => {
        this.nowMinutes.set(businessMinutes(new Date()));
        const day = businessDay();
        if (day !== this.today()) {
          if (this.selectedDay() === this.today()) this.selectedDay.set(day);
          this.today.set(day);
        }
      }, 60_000);
      inject(DestroyRef).onDestroy(() => clearInterval(tick));
    }
  }

  /** "14:00" si hay horario y duración; si no, null. */
  protected endTime(job: JobListItem): string | null {
    const start = toMinutes(job.scheduledTime);
    return start === null || !job.durationMinutes ? null : clock(start + job.durationMinutes);
  }

  protected selectDay(day: string): void {
    this.selectedDay.set(day);
  }

  protected statusLabel(status: JobStatus): string {
    return STATUS_LABEL[status];
  }

  protected jobDateLabel(job: JobListItem): string {
    return jobScheduleLabel(job.status, job.scheduledDate, job.scheduledTime);
  }

  protected refresh(): void {
    this.today.set(businessDay());
    this.selectedDay.set(businessDay());
    this.nowMinutes.set(businessMinutes(new Date()));
    this.store.load(true);
  }

  protected trackJob(_index: number, job: JobListItem): string {
    return job.id;
  }
}
