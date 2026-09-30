import { Injectable, PLATFORM_ID, computed, effect, inject, signal, untracked } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { firstValueFrom, Subscription } from 'rxjs';
import { classifyError } from '../api/api-error';
import { JobsApiService } from '../api/jobs-api.service';
import { JobDetail, JobListItem, JobsResponse, ScheduleJobPayload } from '../models/job';
import { AuthStore } from './auth.store';

@Injectable({ providedIn: 'root' })
export class JobsStore {
  private readonly api = inject(JobsApiService);
  private readonly auth = inject(AuthStore);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly items = signal<JobListItem[]>([]);
  readonly counts = signal<JobsResponse['counts']>({ toCoordinate: 0, today: 0, inProgress: 0, completed: 0 });
  readonly loaded = signal(false);
  readonly loading = signal(false);
  readonly error = signal(false);
  readonly detail = signal<JobDetail | null>(null);
  readonly detailLoading = signal(false);
  readonly detailError = signal<'not-found' | 'error' | null>(null);
  readonly action = signal<string | null>(null);
  readonly actionError = signal<string | null>(null);
  readonly hasProfile = computed(() => !!this.auth.user()?.professionalProfileId);
  readonly toCoordinateCount = computed(() => this.counts().toCoordinate);
  private listSub?: Subscription;
  private detailSub?: Subscription;

  constructor() {
    let userId: string | null | undefined;
    effect(() => {
      const id = this.auth.user()?.id ?? null;
      untracked(() => {
        if (userId !== undefined && id !== userId) this.reset();
        userId = id;
      });
    });
  }

  load(force = false): void {
    if (!this.browser || !this.hasProfile() || (!force && (this.loaded() || this.loading()))) return;
    this.listSub?.unsubscribe();
    this.loading.set(true);
    this.error.set(false);
    this.listSub = this.api.list().subscribe({
      next: (response) => {
        this.items.set(response.items);
        this.counts.set(response.counts);
        this.loaded.set(true);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }

  loadDetail(id: string, force = false): void {
    if (!this.browser || !this.hasProfile()) return;
    if (!force && (this.detailLoading() || this.detail()?.id === id)) return;
    this.detailSub?.unsubscribe();
    this.detailLoading.set(true);
    this.detailError.set(null);
    this.detailSub = this.api.get(id).subscribe({
      next: (detail) => {
        this.detail.set(detail);
        this.detailLoading.set(false);
        this.load(true);
      },
      error: (error) => {
        this.detailError.set(classifyError(error).kind === 'not-found' ? 'not-found' : 'error');
        this.detailLoading.set(false);
      },
    });
  }

  async schedule(id: string, payload: ScheduleJobPayload): Promise<boolean> {
    return this.mutate(id, 'schedule', () => this.api.schedule(id, payload));
  }
  async start(id: string): Promise<boolean> {
    return this.mutate(id, 'start', () => this.api.start(id));
  }
  async complete(id: string): Promise<boolean> {
    return this.mutate(id, 'complete', () => this.api.complete(id));
  }
  async cancel(id: string): Promise<boolean> {
    return this.mutate(id, 'cancel', () => this.api.cancel(id));
  }
  async updateNotes(id: string, notes: string): Promise<boolean> {
    return this.mutate(id, 'notes', () => this.api.updateNotes(id, notes));
  }
  async updateChecklist(id: string, items: JobDetail['checklist']): Promise<boolean> {
    return this.mutate(id, 'checklist', () => this.api.updateChecklist(id, items));
  }

  clearError(): void {
    this.actionError.set(null);
  }

  reset(): void {
    this.listSub?.unsubscribe();
    this.detailSub?.unsubscribe();
    this.items.set([]);
    this.counts.set({ toCoordinate: 0, today: 0, inProgress: 0, completed: 0 });
    this.loaded.set(false);
    this.loading.set(false);
    this.error.set(false);
    this.detail.set(null);
    this.detailLoading.set(false);
    this.detailError.set(null);
    this.action.set(null);
    this.actionError.set(null);
  }

  private async mutate(id: string, action: string, request: () => ReturnType<JobsApiService['get']>): Promise<boolean> {
    if (this.action()) return false;
    this.action.set(action);
    this.actionError.set(null);
    try {
      const detail = await firstValueFrom(request());
      this.detail.set(detail);
      this.action.set(null);
      this.load(true);
      return true;
    } catch (error) {
      const kind = classifyError(error);
      this.actionError.set(kind.kind === 'conflict' ? 'El trabajo cambió. Actualizá para ver el estado actual.' : 'No pudimos guardar el cambio. Revisá los datos e intentá de nuevo.');
      this.action.set(null);
      if (kind.kind === 'conflict') this.loadDetail(id, true);
      return false;
    }
  }
}
