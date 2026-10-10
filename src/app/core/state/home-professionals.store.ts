import { Injectable, PLATFORM_ID, computed, effect, inject, signal, untracked } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Subscription, catchError, forkJoin, of } from 'rxjs';
import { ProfessionalsApiService } from '../api/professionals-api.service';
import { avatarOf } from '../models/avatar';
import { ProfessionalSummary } from '../models/professional';
import { LocalityStore } from './locality.store';

/**
 * Profesionales del Home de la ciudad elegida: candidatos generales en el orden del
 * backend, quienes toman urgencias ahora y vitrina PRO (siempre de ESA localidad: un
 * PRO de otra ciudad nunca se muestra). Una carga por ciudad, solo en el navegador.
 * Sin ciudad elegida no se pide nada (el inicio invita a elegirla).
 */
@Injectable({ providedIn: 'root' })
export class HomeProfessionalsStore {
  private readonly api = inject(ProfessionalsApiService);
  private readonly locality = inject(LocalityStore);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly firstItems = signal<ProfessionalSummary[]>([]);
  private readonly availableItems = signal<ProfessionalSummary[]>([]);
  private readonly proItems = signal<ProfessionalSummary[]>([]);
  /** Total real de profesionales que toman urgencias ahora. */
  readonly availableCount = signal(0);
  readonly loaded = signal(false);
  readonly availableError = signal(false);
  /** Localidad de lo cargado (o cargando). */
  private loadedFor: string | null | undefined = undefined;
  private sub?: Subscription;
  private requested = false;

  readonly generalCandidates = computed(() => this.firstItems().map((pro) => ({ pro, avatar: avatarOf(pro) })));
  readonly availableToday = computed(() => this.availableItems().map((pro) => ({ pro, avatar: avatarOf(pro) })));
  /** Vitrina "Perfiles PRO" (GET /professionals?pro=true): solo suscripción vigente, rotada por día. */
  readonly proShowcase = computed(() => this.proItems().map((pro) => ({ pro, avatar: avatarOf(pro) })));

  constructor() {
    // Cambiar de ciudad rehace el inicio (sin mostrar los de la ciudad anterior).
    effect(() => {
      this.locality.id();
      untracked(() => {
        if (this.requested) this.load();
      });
    });
  }

  load(): void {
    if (!this.isBrowser) return;
    this.requested = true;
    const locality = this.locality.id();
    if (locality === this.loadedFor && (this.loaded() || this.sub)) return;
    this.sub?.unsubscribe();
    this.sub = undefined;
    this.loadedFor = locality;
    this.firstItems.set([]);
    this.availableItems.set([]);
    this.proItems.set([]);
    this.availableCount.set(0);
    this.loaded.set(false);
    this.availableError.set(false);
    if (!locality) {
      this.loaded.set(true);
      return;
    }
    this.sub = forkJoin({
      // La vitrina puede ocupar hasta ocho lugares; pedir once permite mostrar
      // tres perfiles generales distintos sin alterar el orden del backend.
      first: this.api.getProfessionals({ locality, pageSize: 11 }),
      available: this.api.getProfessionals({ locality, availableToday: true, pageSize: 4 }),
      // La vitrina es un extra: si falla, el inicio sigue igual (sin vitrina).
      pros: this.api.getProfessionals({ locality, pro: true, pageSize: 8 }).pipe(catchError(() => of(null))),
    }).subscribe({
      next: ({ first, available, pros }) => {
        this.firstItems.set(first.items);
        this.availableItems.set(available.items);
        this.proItems.set(pros?.items ?? []);
        this.availableCount.set(available.total);
        this.loaded.set(true);
        this.sub = undefined;
      },
      error: () => {
        this.availableError.set(true);
        this.sub = undefined;
      },
    });
  }

  retry(): void {
    this.loadedFor = undefined;
    this.load();
  }

  /** La próxima visita al inicio vuelve a pedir los destacados (sin F5). */
  invalidate(): void {
    this.loadedFor = undefined;
    this.loaded.set(false);
  }
}
