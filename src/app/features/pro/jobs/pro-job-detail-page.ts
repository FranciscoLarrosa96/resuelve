import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { JobChecklistItem, JobStatus } from '../../../core/models/job';
import { JobsStore } from '../../../core/state/jobs.store';
import { businessDay, shiftDay } from '../../../core/utils/business-time';
import { normalizeCalendarDay } from '../../../core/utils/dates';
import { formatMoney } from '../../../core/utils/format';
import { jobScheduleLabel } from '../../../core/utils/job-display';
import { businessClock } from '../../../core/utils/business-time';
import { formatDayShort } from '../../../core/utils/business-time';
import { refreshWhenDue } from '../../../core/utils/refresh-when-due';
import { BackButton } from '../../../shared/components/back-button/back-button';
import { Icon, IconName } from '../../../shared/components/icon/icon';
import { SessionPending } from '../../../shared/components/session-pending/session-pending';
import { JobSchedulePicker } from './job-schedule-picker';
import { Celebrate } from '../../../shared/components/celebrate/celebrate';

const STATUS_LABEL: Record<JobStatus, string> = {
  TO_COORDINATE: 'Para coordinar',
  SCHEDULED: 'Agendado',
  IN_PROGRESS: 'En curso',
  COMPLETED: 'Realizado',
  CANCELLED: 'Cancelado',
};

@Component({
  selector: 'app-pro-job-detail-page',
  imports: [RouterLink, BackButton, SessionPending, JobSchedulePicker, Icon, Celebrate],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pro-job-detail-page.html',
  styleUrl: './pro-job-detail-page.css',
})
export class ProJobDetailPage {
  /** Se enciende solo al cerrar el trabajo en esta sesión, no al abrir uno ya cerrado. */
  protected readonly celebrating = signal(false);
  protected readonly store = inject(JobsStore);
  readonly id = input.required<string>();
  protected readonly job = computed(() => {
    const detail = this.store.detail();
    return detail?.id === this.id() ? detail : null;
  });
  protected readonly statusLabel = STATUS_LABEL;
  /** "Hoy 11:00" cuando termina el horario y se habilita "Finalizar" (null si no hay horario). */
  protected readonly closesLabel = computed(() => {
    const at = this.job()?.closesAt;
    return at ? `${formatDayShort(businessDay(at))}, ${businessClock(at)}` : null;
  });
  protected pastDay(iso: string): string {
    return formatDayShort(businessDay(iso));
  }
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
  protected readonly notesStatus = signal<'idle' | 'saved' | 'error'>('idle');
  protected readonly removedTask = signal<{
    jobId: string;
    item: JobChecklistItem;
    index: number;
  } | null>(null);

  constructor() {
    // Terminó el horario: una relectura puntual (el backend decide si ya se puede finalizar; sin F5 ni polling).
    refreshWhenDue(
      () => {
        const detail = this.job();
        return detail && !detail.canComplete ? (detail.closesAt ?? null) : null;
      },
      () => {
        const id = this.id();
        if (this.store.hasProfile()) this.store.loadDetail(id, true);
      },
    );
    effect(() => {
      const id = this.id();
      if (this.store.hasProfile()) untracked(() => this.store.loadDetail(id, true));
    });
    let previousJobId: string | null = null;
    let previousNotes = '';
    effect(() => {
      const detail = this.job();
      if (!detail) return;
      untracked(() => {
        this.scheduleDate.set(normalizeCalendarDay(detail.scheduledDate) ?? this.defaultDate);
        this.scheduleTime.set(detail.scheduledTime ?? '');
        this.duration.set(detail.durationMinutes ? String(detail.durationMinutes) : '');
        // Updating a checklist must not overwrite notes that are still being edited.
        if (previousJobId !== detail.id || this.notesDraft() === previousNotes) {
          this.notesDraft.set(detail.privateNotes);
        }
        if (previousJobId !== detail.id) {
          this.removedTask.set(null);
          this.notesStatus.set('idle');
        }
        previousJobId = detail.id;
        previousNotes = detail.privateNotes;
      });
    });
  }

  protected setDuration(event: Event): void {
    this.duration.set((event.target as HTMLSelectElement).value);
  }
  protected setNotes(event: Event): void {
    this.notesDraft.set((event.target as HTMLTextAreaElement).value);
    this.notesStatus.set('idle');
  }
  protected setNewTask(event: Event): void {
    this.newTask.set((event.target as HTMLInputElement).value);
  }

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
    if (detail)
      this.notesStatus.set(
        (await this.store.updateNotes(detail.id, this.notesDraft())) ? 'saved' : 'error',
      );
  }

  protected async addTask(): Promise<void> {
    const detail = this.job();
    const text = this.newTask().trim();
    if (!detail || !text || detail.checklist.length >= 10) return;
    const saved = await this.store.updateChecklist(detail.id, [
      ...detail.checklist,
      { id: crypto.randomUUID(), text, done: false },
    ]);
    if (saved) this.newTask.set('');
  }

  protected async toggleTask(item: JobChecklistItem): Promise<void> {
    const detail = this.job();
    if (!detail) return;
    await this.store.updateChecklist(
      detail.id,
      detail.checklist.map((current) =>
        current.id === item.id ? { ...current, done: !current.done } : current,
      ),
    );
  }

  protected async removeTask(item: JobChecklistItem): Promise<void> {
    const detail = this.job();
    if (!detail) return;
    const index = detail.checklist.findIndex((current) => current.id === item.id);
    if (
      await this.store.updateChecklist(
        detail.id,
        detail.checklist.filter((current) => current.id !== item.id),
      )
    ) {
      this.removedTask.set({ jobId: detail.id, item, index });
    }
  }

  protected async undoRemoveTask(): Promise<void> {
    const removed = this.removedTask();
    const detail = this.job();
    if (!removed || !detail || removed.jobId !== detail.id || detail.checklist.length >= 10) return;
    const items = [...detail.checklist];
    if (items.some((item) => item.id === removed.item.id)) {
      this.removedTask.set(null);
      return;
    }
    items.splice(Math.min(removed.index, items.length), 0, removed.item);
    if (await this.store.updateChecklist(detail.id, items)) this.removedTask.set(null);
  }

  protected async complete(): Promise<void> {
    const detail = this.job();
    if (detail && (await this.store.complete(detail.id))) this.celebrating.set(true);
  }
  protected async cancel(): Promise<void> {
    const detail = this.job();
    if (detail) {
      await this.store.cancel(detail.id);
      this.confirmingCancel.set(false);
    }
  }

  protected dateLabel(date: string | null, time: string | null): string {
    const status = this.job()?.status ?? 'TO_COORDINATE';
    return jobScheduleLabel(
      status,
      date,
      time,
      status === 'TO_COORDINATE' ? 'A coordinar' : 'Fecha pendiente',
    );
  }

  protected eventIcon(type: string): IconName {
    if (type === 'CANCELLED') return 'close';
    if (type === 'COMPLETED') return 'check-circle';
    if (type === 'STARTED') return 'briefcase';
    if (type === 'SCHEDULED' || type === 'RESCHEDULED') return 'calendar';
    return 'clock';
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
    const date = new Date(value);
    return Number.isFinite(date.getTime())
      ? new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
      : 'Fecha no disponible';
  }

  protected retry(): void {
    this.store.loadDetail(this.id(), true);
  }
}
