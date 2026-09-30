import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { JobChecklistItem, JobStatus } from '../../../core/models/job';
import { JobsStore } from '../../../core/state/jobs.store';
import { businessDay, shiftDay } from '../../../core/utils/business-time';
import { formatMoney } from '../../../core/utils/format';
import { BackButton } from '../../../shared/components/back-button/back-button';
import { SessionPending } from '../../../shared/components/session-pending/session-pending';

const STATUS_LABEL: Record<JobStatus, string> = {
  TO_COORDINATE: 'Para coordinar', SCHEDULED: 'Agendado', IN_PROGRESS: 'En curso', COMPLETED: 'Realizado', CANCELLED: 'Cancelado',
};

@Component({
  selector: 'app-pro-job-detail-page',
  imports: [RouterLink, BackButton, SessionPending],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pro-job-detail-page.html',
})
export class ProJobDetailPage {
  protected readonly store = inject(JobsStore);
  readonly id = input.required<string>();
  protected readonly job = computed(() => {
    const detail = this.store.detail();
    return detail?.id === this.id() ? detail : null;
  });
  protected readonly statusLabel = STATUS_LABEL;
  protected readonly money = formatMoney;
  protected readonly today = businessDay();
  protected readonly defaultDate = shiftDay(this.today, 1);
  protected readonly scheduleDate = signal('');
  protected readonly scheduleTime = signal('');
  protected readonly duration = signal('');
  protected readonly notesDraft = signal('');
  protected readonly newTask = signal('');
  protected readonly confirmingCancel = signal(false);
  protected readonly scheduleError = signal<string | null>(null);

  constructor() {
    effect(() => {
      const id = this.id();
      if (this.store.hasProfile()) untracked(() => this.store.loadDetail(id, true));
    });
    effect(() => {
      const detail = this.job();
      if (!detail) return;
      untracked(() => {
        this.scheduleDate.set(detail.scheduledDate ?? this.defaultDate);
        this.scheduleTime.set(detail.scheduledTime ?? '');
        this.duration.set(detail.durationMinutes ? String(detail.durationMinutes) : '');
        this.notesDraft.set(detail.privateNotes);
      });
    });
  }

  protected setDate(event: Event): void { this.scheduleDate.set((event.target as HTMLInputElement).value); }
  protected setTime(event: Event): void { this.scheduleTime.set((event.target as HTMLInputElement).value); }
  protected setDuration(event: Event): void { this.duration.set((event.target as HTMLSelectElement).value); }
  protected setNotes(event: Event): void { this.notesDraft.set((event.target as HTMLTextAreaElement).value); }
  protected setNewTask(event: Event): void { this.newTask.set((event.target as HTMLInputElement).value); }

  protected async saveSchedule(): Promise<void> {
    const detail = this.job();
    const date = this.scheduleDate();
    if (!detail || !date) {
      this.scheduleError.set('Elegí una fecha para coordinar el trabajo.');
      return;
    }
    this.scheduleError.set(null);
    await this.store.schedule(detail.id, {
      scheduledDate: date,
      ...(this.scheduleTime() ? { scheduledTime: this.scheduleTime() } : {}),
      ...(this.duration() ? { durationMinutes: Number(this.duration()) } : {}),
    });
  }

  protected async saveNotes(): Promise<void> {
    const detail = this.job();
    if (detail) await this.store.updateNotes(detail.id, this.notesDraft());
  }

  protected async addTask(): Promise<void> {
    const detail = this.job();
    const text = this.newTask().trim();
    if (!detail || !text || detail.checklist.length >= 10) return;
    await this.store.updateChecklist(detail.id, [...detail.checklist, { id: crypto.randomUUID(), text, done: false }]);
    this.newTask.set('');
  }

  protected async toggleTask(item: JobChecklistItem): Promise<void> {
    const detail = this.job();
    if (!detail) return;
    await this.store.updateChecklist(detail.id, detail.checklist.map((current) =>
      current.id === item.id ? { ...current, done: !current.done } : current,
    ));
  }

  protected async removeTask(item: JobChecklistItem): Promise<void> {
    const detail = this.job();
    if (detail) await this.store.updateChecklist(detail.id, detail.checklist.filter((current) => current.id !== item.id));
  }

  protected async start(): Promise<void> {
    const detail = this.job();
    if (detail) await this.store.start(detail.id);
  }
  protected async complete(): Promise<void> {
    const detail = this.job();
    if (detail) await this.store.complete(detail.id);
  }
  protected async cancel(): Promise<void> {
    const detail = this.job();
    if (detail) {
      await this.store.cancel(detail.id);
      this.confirmingCancel.set(false);
    }
  }

  protected dateLabel(date: string | null, time: string | null): string {
    if (!date) return 'A coordinar';
    const day = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
      .format(new Date(date + 'T12:00:00Z'));
    return time ? day + ' · ' + time : day + ' · horario a coordinar';
  }

  protected eventLabel(type: string): string {
    const labels: Record<string, string> = {
      CREATED: 'Trabajo creado al aceptar el presupuesto',
      BACKFILLED: 'Trabajo importado del historial',
      SCHEDULED: 'Trabajo agendado',
      RESCHEDULED: 'Trabajo reprogramado',
      STARTED: 'Trabajo iniciado',
      COMPLETED: 'Trabajo realizado',
      CANCELLED: 'Trabajo cancelado',
      NOTES_UPDATED: 'Notas privadas actualizadas',
      CHECKLIST_UPDATED: 'Checklist actualizado',
    };
    return labels[type] ?? 'Actualización del trabajo';
  }

  protected eventDate(value: string): string {
    return new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  }

  protected retry(): void { this.store.loadDetail(this.id(), true); }
}
