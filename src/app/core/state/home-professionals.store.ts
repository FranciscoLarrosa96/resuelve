import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { catchError, forkJoin, of } from 'rxjs';
import { ProfessionalsApiService } from '../api/professionals-api.service';
import { avatarOf } from '../models/avatar';
import { ProfessionalSummary } from '../models/professional';

/**
 * Profesionales del Home: candidatos generales en el orden del backend,
 * quienes toman urgencias ahora y vitrina PRO. Una carga por sesión, solo en el navegador.
 */
@Injectable({ providedIn: 'root' })
export class HomeProfessionalsStore {
  private readonly api = inject(ProfessionalsApiService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly firstItems = signal<ProfessionalSummary[]>([]);
  private readonly availableItems = signal<ProfessionalSummary[]>([]);
  private readonly proItems = signal<ProfessionalSummary[]>([]);
  /** Total real de profesionales que toman urgencias ahora. */
  readonly availableCount = signal(0);
  readonly loaded = signal(false);
  readonly availableError = signal(false);
  private loading = false;

  readonly generalCandidates = computed(() => this.firstItems().map((pro) => ({ pro, avatar: avatarOf(pro) })));
  readonly availableToday = computed(() => this.availableItems().map((pro) => ({ pro, avatar: avatarOf(pro) })));
  /** Vitrina "Perfiles PRO" (GET /professionals?pro=true): solo suscripción vigente, rotada por día. */
  readonly proShowcase = computed(() => this.proItems().map((pro) => ({ pro, avatar: avatarOf(pro) })));

  load(): void {
    if (!this.isBrowser || this.loaded() || this.loading) return;
    this.loading = true;
    this.availableError.set(false);
    forkJoin({
      // La vitrina puede ocupar hasta ocho lugares; pedir once permite mostrar
      // tres perfiles generales distintos sin alterar el orden del backend.
      first: this.api.getProfessionals({ pageSize: 11 }),
      available: this.api.getProfessionals({ availableToday: true, pageSize: 4 }),
      // La vitrina es un extra: si falla, el inicio sigue igual (sin vitrina).
      pros: this.api.getProfessionals({ pro: true, pageSize: 8 }).pipe(catchError(() => of(null))),
    }).subscribe({
      next: ({ first, available, pros }) => {
        this.firstItems.set(first.items);
        this.availableItems.set(available.items);
        this.proItems.set(pros?.items ?? []);
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
