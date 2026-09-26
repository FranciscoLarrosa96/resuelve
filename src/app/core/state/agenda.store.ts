import { Injectable, PLATFORM_ID, computed, effect, inject, signal, untracked } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Subscription } from 'rxjs';
import { AppointmentsApiService } from '../api/appointments-api.service';
import { AgendaItem } from '../models/agenda';
import { businessDay, dayStartIso, shiftDay, weekStart } from '../utils/business-time';
import { AuthStore } from './auth.store';

export const AGENDA_ERROR = 'No pudimos cargar tu agenda.';

/**
 * Agenda REAL del profesional autenticado: una semana (lunes a domingo, hora
 * de Argentina) por pedido a GET /pro/appointments?from&to. El backend filtra
 * el rango y los estados; acá no se descarga la historia ni se filtra nada.
 */
@Injectable({ providedIn: 'root' })
export class AgendaStore {
  private readonly api = inject(AppointmentsApiService);
  private readonly auth = inject(AuthStore);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly hasProfile = computed(() => !!this.auth.user()?.professionalProfileId);
  /** Lunes de la semana visible (YYYY-MM-DD). */
  readonly week = signal(weekStart(businessDay()));
  readonly items = signal<AgendaItem[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  /** Semana cuyos datos están en `items` (null = nada cargado). */
  readonly loadedWeek = signal<string | null>(null);
  readonly days = computed(() => Array.from({ length: 7 }, (_, i) => shiftDay(this.week(), i)));
  private sub?: Subscription;

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
    if (!this.isBrowser || !this.hasProfile()) return;
    const week = this.week();
    if (!force && this.loadedWeek() === week && !this.error()) return;
    this.sub?.unsubscribe();
    this.loading.set(true);
    this.error.set(null);
    this.sub = this.api.agenda(dayStartIso(week), dayStartIso(shiftDay(week, 7))).subscribe({
      next: (items) => {
        this.items.set(items);
        this.loadedWeek.set(week);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(AGENDA_ERROR);
        this.loading.set(false);
      },
    });
  }

  previousWeek(): void {
    this.goTo(shiftDay(this.week(), -7));
  }

  nextWeek(): void {
    this.goTo(shiftDay(this.week(), 7));
  }

  thisWeek(): void {
    this.goTo(weekStart(businessDay()));
  }

  /** "Ver en agenda": deja visible la semana de ese día (se carga al entrar). */
  showDay(day: string): void {
    const week = weekStart(day);
    if (week === this.week()) return;
    this.week.set(week);
    this.items.set([]);
    this.loadedWeek.set(null);
  }

  /** Después de proponer, confirmar, reprogramar o completar: la próxima visita relee. */
  invalidate(): void {
    this.loadedWeek.set(null);
  }

  reset(): void {
    this.sub?.unsubscribe();
    this.items.set([]);
    this.loadedWeek.set(null);
    this.loading.set(false);
    this.error.set(null);
    this.week.set(weekStart(businessDay()));
  }

  private goTo(week: string): void {
    if (week === this.week() && this.loadedWeek() === week) return;
    this.week.set(week);
    this.items.set([]);
    this.load(true);
  }
}
