import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { forkJoin } from 'rxjs';
import { ProfessionalsApiService } from '../api/professionals-api.service';
import { avatarOf } from '../models/avatar';
import { ProfessionalSummary } from '../models/professional';

/**
 * Profesionales del Home, con reglas neutras (no hay ranking ni "destacados"
 * en el backend): los primeros del orden del backend y quienes marcaron
 * "Disponible hoy". Una carga por sesión, solo en el navegador.
 */
@Injectable({ providedIn: 'root' })
export class HomeProfessionalsStore {
  private readonly api = inject(ProfessionalsApiService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly firstItems = signal<ProfessionalSummary[]>([]);
  private readonly availableItems = signal<ProfessionalSummary[]>([]);
  /** Total real de profesionales disponibles hoy. */
  readonly availableCount = signal(0);
  readonly loaded = signal(false);
  readonly availableError = signal(false);
  private loading = false;

  readonly featured = computed(() => this.firstItems().map((pro) => ({ pro, avatar: avatarOf(pro) })));
  readonly availableToday = computed(() => this.availableItems().map((pro) => ({ pro, avatar: avatarOf(pro) })));

  load(): void {
    if (!this.isBrowser || this.loaded() || this.loading) return;
    this.loading = true;
    this.availableError.set(false);
    forkJoin({
      first: this.api.getProfessionals({ pageSize: 3 }),
      available: this.api.getProfessionals({ availableToday: true, pageSize: 4 }),
    }).subscribe({
      next: ({ first, available }) => {
        this.firstItems.set(first.items);
        this.availableItems.set(available.items);
        this.availableCount.set(available.total);
        this.loaded.set(true);
        this.loading = false;
      },
      error: () => {
        this.availableError.set(true);
        this.loading = false;
      },
    });
  }

  retry(): void {
    this.load();
  }

  /** La próxima visita al inicio vuelve a pedir los destacados (sin F5). */
  invalidate(): void {
    this.loaded.set(false);
  }
}
