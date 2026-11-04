import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Injector,
  PLATFORM_ID,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { NgTemplateOutlet, isPlatformBrowser } from '@angular/common';
import { QuotePdfButton } from '../quote-pdf-button';
import { RouterLink } from '@angular/router';
import { JobChecklistItem, JobStatus } from '../../../core/models/job';
import { JobsStore } from '../../../core/state/jobs.store';
import { businessDay, shiftDay, shortWeekday } from '../../../core/utils/business-time';
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
import { ReviewAsk } from '../../../shared/components/review-ask/review-ask';

/** Etapas del trabajo, en orden. La primera (presupuesto aceptado) siempre está hecha. */
export type JobStage = 'schedule' | 'prepare' | 'finish' | 'done' | 'cancelled';
type StepState = 'done' | 'current' | 'upcoming' | 'off';
type Section = 'schedule' | 'client' | 'quote' | 'checklist' | 'notes' | 'history';
type NextAction = 'schedule' | 'checklist' | 'complete';

const STEP_LABELS = ['Presupuesto aceptado', 'Día y horario', 'Preparar el trabajo', 'Marcarlo realizado'];
const STAGE_STEP: Record<JobStage, number> = { schedule: 1, prepare: 2, finish: 3, done: 4, cancelled: -1 };
/** Escritorio = recorrido por etapas; debajo, acordeones con la acción fija abajo. */
const DESKTOP_QUERY = '(min-width: 1024px)';

const STATUS_LABEL: Record<JobStatus, string> = {
  TO_COORDINATE: 'Para coordinar',
  SCHEDULED: 'Agendado',
  IN_PROGRESS: 'En curso',
  COMPLETED: 'Realizado',
  CANCELLED: 'Cancelado',
};

@Component({
  selector: 'app-pro-job-detail-page',
  imports: [NgTemplateOutlet, RouterLink, BackButton, SessionPending, JobSchedulePicker, Icon, Celebrate, ReviewAsk, QuotePdfButton],
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
  private readonly injector = inject(Injector);
  /** Solo en el navegador; sin matchMedia (SSR, tests) se usa el diseño de celular. */
  protected readonly desktop = signal(false);
  /** Etapa actual: la deriva de lo que dice el backend (fecha, `canComplete`, estado), nunca del reloj. */
  protected readonly stage = computed<JobStage>(() => {
    const j = this.job();
    if (!j || j.status === 'CANCELLED') return 'cancelled';
    if (j.status === 'COMPLETED') return 'done';
    if (j.canComplete) return 'finish';
    return j.scheduledDate ? 'prepare' : 'schedule';
  });
  protected readonly steps = computed(() => {
    const stage = this.stage();
    const current = STAGE_STEP[stage];
    return STEP_LABELS.map((label, index) => ({
      label,
      state: (stage === 'cancelled'
        ? index === 0
          ? 'done'
          : 'off'
        : index < current
          ? 'done'
          : index === current
            ? 'current'
            : 'upcoming') as StepState,
    }));
  });
  /** "Paso 3 de 4" del celular. */
  protected readonly stepNumber = computed(() => Math.min(STAGE_STEP[this.stage()] + 1, 4));
  protected readonly canEditSchedule = computed(() => {
    const status = this.job()?.status;
    return status === 'TO_COORDINATE' || status === 'SCHEDULED';
  });
  protected readonly canCancel = computed(() => {
    const status = this.job()?.status;
    return status === 'TO_COORDINATE' || status === 'SCHEDULED' || status === 'IN_PROGRESS';
  });
  /** Una sola indicación de qué hacer ahora (null si no queda nada por hacer). */
  protected readonly nextStep = computed<{
    title: string;
    text: string;
    action: NextAction | null;
    actionLabel: string;
  } | null>(() => {
    const j = this.job();
    const when = this.closesLabel();
    switch (this.stage()) {
      case 'schedule':
        return this.canEditSchedule()
          ? {
              title: 'Agendá el día del trabajo',
              text: 'Elegí la fecha; el horario lo podés acordar después.',
              action: 'schedule',
              actionLabel: 'Agendar trabajo',
            }
          : null;
      case 'prepare':
        if (!j?.scheduledTime && this.canEditSchedule())
          return {
            title: 'Acordá el horario con el cliente',
            text: when
              ? `Ya está el día. Sin horario, vas a poder finalizarlo desde el ${when}.`
              : 'Ya está el día. Sumá el horario cuando lo acuerden.',
            action: 'schedule',
            actionLabel: 'Elegir horario',
          };
        return {
          title: 'Prepará el trabajo',
          text: when
            ? `Vas a poder finalizarlo cuando termine el horario (${when}).`
            : 'Anotá en el checklist lo que no te querés olvidar.',
          action: 'checklist',
          actionLabel: 'Ver checklist',
        };
      case 'finish':
        return {
          title: 'Terminó el horario: marcalo realizado',
          text: 'Al finalizarlo queda registrado y podés pedirle la reseña al cliente.',
          action: 'complete',
          actionLabel: 'Finalizar trabajo',
        };
      default:
        return null;
    }
  });
  /** Día en que se aceptó el presupuesto (evento de creación del trabajo). */
  protected readonly acceptedDay = computed(() => {
    const created = this.job()?.history.find((e) => e.type === 'CREATED' || e.type === 'BACKFILLED');
    return created ? this.pastDay(created.createdAt) : null;
  });
  /** Fecha corta para las tarjetas del celular: "Jue 5 nov". */
  protected readonly shortDate = computed(() => {
    const day = normalizeCalendarDay(this.job()?.scheduledDate);
    return day ? `${shortWeekday(day)} ${formatDayShort(day)}` : null;
  });
  protected readonly durationLabel = computed(() => {
    const minutes = this.job()?.durationMinutes;
    if (!minutes) return null;
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `${hours} h ${rest}` : `${hours} ${hours === 1 ? 'hora' : 'horas'}`;
  });
  protected readonly clientInitials = computed(() =>
    (this.job()?.client.fullName ?? '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join(''),
  );
  protected readonly checklistDone = computed(
    () => this.job()?.checklist.filter((item) => item.done).length ?? 0,
  );
  protected readonly editingSchedule = signal(false);
  private readonly openSections = signal<ReadonlySet<Section>>(new Set<Section>(['client']));
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
    if (isPlatformBrowser(inject(PLATFORM_ID)) && typeof window.matchMedia === 'function') {
      const query = window.matchMedia(DESKTOP_QUERY);
      this.desktop.set(query.matches);
      const onChange = (event: MediaQueryListEvent) => this.desktop.set(event.matches);
      query.addEventListener('change', onChange);
      inject(DestroyRef).onDestroy(() => query.removeEventListener('change', onChange));
    }
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
          this.editingSchedule.set(false);
          // En el celular, la etapa actual abre su sección; el cliente siempre arranca abierto.
          const sections = new Set<Section>(['client']);
          if (!detail.scheduledDate && (detail.status === 'TO_COORDINATE' || detail.status === 'SCHEDULED'))
            sections.add('schedule');
          this.openSections.set(sections);
        }
        previousJobId = detail.id;
        previousNotes = detail.privateNotes;
      });
    });
  }

  protected statusChip(status: JobStatus): string {
    if (status === 'CANCELLED') return 'border-line bg-sand text-muted';
    if (status === 'TO_COORDINATE') return 'border-accent-line bg-accent-soft text-accent-ink';
    if (status === 'COMPLETED') return 'border-brand-line bg-brand-tint text-brand-dark';
    return 'border-success-line bg-success-soft text-success-strong';
  }
  protected stepBar(state: StepState): string {
    if (state === 'done') return 'bg-success';
    if (state === 'current') return 'bg-accent';
    return 'bg-track';
  }

  protected isOpen(section: Section): boolean {
    return this.openSections().has(section);
  }
  protected onToggle(section: Section, event: Event): void {
    const open = (event.target as HTMLDetailsElement).open;
    if (open === this.isOpen(section)) return;
    this.openSections.update((current) => {
      const next = new Set(current);
      if (open) next.add(section);
      else next.delete(section);
      return next;
    });
  }

  /** La acción del "Próximo paso": abre y muestra la sección, o finaliza. */
  protected runNext(action: NextAction): void {
    if (action === 'complete') {
      void this.complete();
      return;
    }
    const section: Section = action === 'schedule' ? 'schedule' : 'checklist';
    if (action === 'schedule') this.editingSchedule.set(true);
    this.openSections.update((current) => new Set(current).add(section));
    afterNextRender(
      () => {
        const target = document.getElementById(`job-${section}`);
        target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        const field = target?.querySelector<HTMLElement>(
          action === 'schedule' ? '#job-schedule-time' : '#job-new-task',
        );
        field?.focus({ preventScroll: true });
      },
      { injector: this.injector },
    );
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
    const saved = await this.store.schedule(detail.id, {
      scheduledDate: date,
      ...(this.scheduleTime() ? { scheduledTime: this.scheduleTime() } : {}),
      ...(this.duration() ? { durationMinutes: Number(this.duration()) } : {}),
    });
    if (saved) this.editingSchedule.set(false);
  }
  protected stopEditingSchedule(): void {
    const detail = this.job();
    if (detail) {
      this.scheduleDate.set(normalizeCalendarDay(detail.scheduledDate) ?? this.defaultDate);
      this.scheduleTime.set(detail.scheduledTime ?? '');
      this.duration.set(detail.durationMinutes ? String(detail.durationMinutes) : '');
    }
    this.scheduleError.set(null);
    this.editingSchedule.set(false);
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
