import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { JobListItem, JobStatus } from '../../../core/models/job';
import { JobsStore } from '../../../core/state/jobs.store';
import { businessDay } from '../../../core/utils/business-time';
import { Icon } from '../../../shared/components/icon/icon';
import { SessionPending } from '../../../shared/components/session-pending/session-pending';

type AgendaFilter = 'ALL' | 'TODAY' | 'PENDING' | 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED';
const FILTERS: { key: AgendaFilter; label: string }[] = [
  { key: 'ALL', label: 'Todos' }, { key: 'TODAY', label: 'Hoy' }, { key: 'PENDING', label: 'Pendientes' },
  { key: 'SCHEDULED', label: 'Agendados' }, { key: 'IN_PROGRESS', label: 'En curso' }, { key: 'COMPLETED', label: 'Realizados' },
];
const STATUS_LABEL: Record<JobStatus, string> = {
  TO_COORDINATE: 'Para coordinar', SCHEDULED: 'Agendado', IN_PROGRESS: 'En curso', COMPLETED: 'Realizado', CANCELLED: 'Cancelado',
};

@Component({
  selector: 'app-pro-jobs-agenda-page',
  imports: [RouterLink, NgTemplateOutlet, Icon, SessionPending],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pro-jobs-agenda-page.html',
})
export class ProJobsAgendaPage {
  protected readonly store = inject(JobsStore);
  protected readonly today = signal(businessDay());
  protected readonly filter = signal<AgendaFilter>('ALL');
  protected readonly filters = FILTERS;
  protected readonly todayJobs = computed(() => this.store.items().filter(
    (job) => job.scheduledDate === this.today() && ['SCHEDULED', 'IN_PROGRESS'].includes(job.status),
  ));
  protected readonly toCoordinate = computed(() => this.store.items().filter((job) => job.status === 'TO_COORDINATE'));
  protected readonly upcoming = computed(() => this.store.items().filter(
    (job) => job.scheduledDate && job.scheduledDate > this.today() && ['SCHEDULED', 'IN_PROGRESS'].includes(job.status),
  ));
  protected readonly completed = computed(() => this.store.items().filter((job) => job.status === 'COMPLETED'));
  protected readonly cancelled = computed(() => this.store.items().filter((job) => job.status === 'CANCELLED'));
  protected readonly filteredItems = computed(() => {
    const all = this.store.items();
    switch (this.filter()) {
      case 'TODAY': return this.todayJobs();
      case 'PENDING': return this.toCoordinate();
      case 'SCHEDULED': return all.filter((job) => job.status === 'SCHEDULED');
      case 'IN_PROGRESS': return all.filter((job) => job.status === 'IN_PROGRESS');
      case 'COMPLETED': return this.completed();
      default: return all;
    }
  });

  constructor() {
    effect(() => {
      if (this.store.hasProfile()) untracked(() => this.store.load());
    });
  }

  protected statusLabel(status: JobStatus): string { return STATUS_LABEL[status]; }

  protected dateLabel(date: string | null, time: string | null): string {
    if (!date) return 'Fecha pendiente';
    const day = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
      .format(new Date(date + 'T12:00:00Z'));
    return time ? day + ' · ' + time : day + ' · horario a coordinar';
  }

  protected refresh(): void {
    this.today.set(businessDay());
    this.store.load(true);
  }

  protected trackJob(_index: number, job: JobListItem): string { return job.id; }
}
