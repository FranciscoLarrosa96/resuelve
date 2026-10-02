import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
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
import { businessDay } from '../../../core/utils/business-time';
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
  protected readonly filter = signal<AgendaFilter>('ALL');
  protected readonly filters = FILTERS;
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
    }));
  });
  protected readonly completed = computed(() =>
    this.store.items().filter((job) => job.status === 'COMPLETED'),
  );
  protected readonly cancelled = computed(() =>
    this.store.items().filter((job) => job.status === 'CANCELLED'),
  );
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
  }

  protected statusLabel(status: JobStatus): string {
    return STATUS_LABEL[status];
  }

  protected jobDateLabel(job: JobListItem): string {
    return jobScheduleLabel(job.status, job.scheduledDate, job.scheduledTime);
  }

  protected refresh(): void {
    this.today.set(businessDay());
    this.store.load(true);
  }

  protected trackJob(_index: number, job: JobListItem): string {
    return job.id;
  }
}
