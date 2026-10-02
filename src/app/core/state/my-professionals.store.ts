import { Injectable, PLATFORM_ID, computed, effect, inject, signal, untracked } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { RetentionApiService } from '../api/retention-api.service';
import { MyProfessionals } from '../models/retention';
import { AuthStore } from './auth.store';

/**
 * "Mis profesionales": contratados (de trabajos reales) y guardados. Los
 * ids guardados alimentan el "♡ Guardar" de perfiles, resultados y destacados:
 * una sola carga por sesión (solo con sesión), y cada guardar/quitar actualiza
 * en el acto y confirma con el servidor (si falla, vuelve atrás).
 */
@Injectable({ providedIn: 'root' })
export class MyProfessionalsStore {
  private readonly api = inject(RetentionApiService);
  private readonly auth = inject(AuthStore);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly data = signal<MyProfessionals | null>(null);
  readonly loading = signal(false);
  readonly error = signal(false);
  /** Ids con guardado en curso (el botón no se dispara dos veces). */
  readonly pending = signal<ReadonlySet<string>>(new Set());

  readonly hired = computed(() => this.data()?.hired ?? []);
  readonly saved = computed(() => this.data()?.saved ?? []);
  private readonly savedIds = computed(() => new Set(this.saved().map((s) => s.professional.id)));
  /** Estado mostrado mientras el servidor confirma (el corazón responde al toque). */
  private readonly optimistic = signal<ReadonlyMap<string, boolean>>(new Map());

  constructor() {
    // Otra cuenta (o cerrar sesión): nada de lo anterior se conserva.
    let userId: string | null | undefined;
    effect(() => {
      const id = this.auth.authenticated() ? (this.auth.user()?.id ?? null) : null;
      untracked(() => {
        if (id === userId) return;
        userId = id;
        this.data.set(null);
        this.error.set(false);
      });
    });
  }

  isSaved(professionalId: string): boolean {
    return this.optimistic().get(professionalId) ?? this.savedIds().has(professionalId);
  }

  /** Carga una vez (o con `force`). Sin sesión no pide nada. */
  async load(force = false): Promise<void> {
    if (!this.isBrowser || !this.auth.authenticated() || this.loading()) return;
    if (this.data() && !force) return;
    this.loading.set(true);
    this.error.set(false);
    try {
      this.data.set(await firstValueFrom(this.api.mine()));
    } catch {
      this.error.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Guarda o quita. Devuelve el estado final; `null` si falló (se revirtió).
   * Quitar de guardados nunca toca los contratados.
   */
  async toggle(professionalId: string): Promise<boolean | null> {
    if (this.pending().has(professionalId)) return this.isSaved(professionalId);
    const wasSaved = this.isSaved(professionalId);
    this.pending.update((p) => new Set(p).add(professionalId));
    this.optimistic.update((m) => new Map(m).set(professionalId, !wasSaved));
    try {
      if (wasSaved) await firstValueFrom(this.api.unsave(professionalId));
      else await firstValueFrom(this.api.save(professionalId));
      // La lista (orden, tarjetas) es del servidor: se relee en vez de inventarla acá.
      await this.reload();
      return !wasSaved;
    } catch {
      return null;
    } finally {
      this.optimistic.update((m) => {
        const next = new Map(m);
        next.delete(professionalId);
        return next;
      });
      this.pending.update((p) => {
        const next = new Set(p);
        next.delete(professionalId);
        return next;
      });
    }
  }

  private async reload(): Promise<void> {
    try {
      this.data.set(await firstValueFrom(this.api.mine()));
    } catch {
      this.error.set(true);
    }
  }
}
