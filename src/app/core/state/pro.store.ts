import { Injectable, PLATFORM_ID, computed, effect, inject, signal, untracked } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ProProfileApiService } from '../api/pro-profile-api.service';
import { INITIAL_PRO_SETTINGS } from '../data/pro.data';
import { ProPlan, ProSettings } from '../models/pro';
import { AvatarSubject, avatarOf } from '../models/avatar';
import { ToastService } from '../services/toast.service';
import { AuthStore } from './auth.store';

const DEMO_PRO_ID = 'demo-pro';

export const AVAILABILITY_MESSAGES = {
  updated: 'Disponibilidad actualizada',
  failed: 'No pudimos actualizar tu disponibilidad. Intentá de nuevo.',
} as const;

/**
 * Estado del área profesional.
 * REAL: identidad (usuario autenticado) y "Disponible hoy" (GET /pro/me +
 * PATCH /pro/availability). Solicitudes y presupuestos viven en ProRequestsStore.
 * DEMO: perfil editable, agenda, estadísticas y plan (pantallas con aviso).
 */
@Injectable({ providedIn: 'root' })
export class ProStore {
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthStore);
  private readonly api = inject(ProProfileApiService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Perfil público REAL del usuario, solo si ya tiene ProfessionalProfile. */
  readonly publicProfileId = computed(() => this.auth.user()?.professionalProfileId ?? null);

  /**
   * Identidad que se muestra en el área pro: SIEMPRE el usuario autenticado
   * (foto o iniciales reales). Sin sesión, las pantallas demo muestran una
   * identidad de ejemplo; nunca se mezcla con un usuario real.
   */
  readonly me = computed<AvatarSubject>(() => {
    const u = this.auth.user();
    if (u) {
      return avatarOf({ id: u.id, displayName: this.auth.displayName(), avatarUrl: u.avatarUrl, firstName: u.firstName, lastName: u.lastName });
    }
    return avatarOf({ id: DEMO_PRO_ID, displayName: INITIAL_PRO_SETTINGS.name, avatarUrl: null });
  });
  readonly firstName = computed(() => this.auth.user()?.firstName ?? null);

  // ---- "Disponible hoy" (real) ----------------------------------------
  /** null = todavía no se sabe (sin perfil, cargando o error): la UI no muestra el switch. */
  readonly available = signal<boolean | null>(null);
  readonly savingAvailability = signal(false);
  private loadedFor: string | null = null;

  // ---- Demo -------------------------------------------------------------
  readonly plan = signal<ProPlan>('free');
  readonly isFree = computed(() => this.plan() === 'free');
  readonly settings = signal<ProSettings>(INITIAL_PRO_SETTINGS);

  constructor() {
    // El perfil demo nunca muestra otro nombre que el del usuario real.
    effect(() => {
      const name = this.auth.displayName() || INITIAL_PRO_SETTINGS.name;
      untracked(() => this.settings.update((s) => ({ ...s, name })));
    });
    effect(() => {
      const profileId = this.publicProfileId();
      untracked(() => {
        if (profileId === this.loadedFor) return;
        this.available.set(null);
        this.loadedFor = profileId;
        if (profileId && this.isBrowser) this.loadMe(profileId);
      });
    });
  }

  private loadMe(profileId: string): void {
    this.api.getMe().subscribe({
      next: (me) => {
        if (this.loadedFor === profileId) this.available.set(me.availableToday);
      },
      error: () => undefined,
    });
  }

  /** Persiste el cambio; si falla, vuelve al valor anterior. Sin reintentos automáticos. */
  async setAvailability(next: boolean): Promise<boolean> {
    const previous = this.available();
    if (previous === null || this.savingAvailability()) return false;
    this.savingAvailability.set(true);
    this.available.set(next);
    return new Promise((resolve) => {
      this.api.setAvailability(next).subscribe({
        next: (me) => {
          this.available.set(me.availableToday);
          this.savingAvailability.set(false);
          this.toast.show(AVAILABILITY_MESSAGES.updated, 2000);
          resolve(true);
        },
        error: () => {
          this.available.set(previous);
          this.savingAvailability.set(false);
          this.toast.show(AVAILABILITY_MESSAGES.failed, 3200, 'info');
          resolve(false);
        },
      });
    });
  }

  toggleAvailability(): void {
    const current = this.available();
    if (current !== null) void this.setAvailability(!current);
  }

  startProTrial(): void {
    this.plan.set('pro');
    this.toast.show('Activaste 30 días de PRO');
  }

  // ---- Perfil (demo) -------------------------------------------------
  updateSettings(patch: Partial<ProSettings>): void {
    this.settings.update((s) => ({ ...s, ...patch }));
  }

  toggleSetting(key: 'serviceSlugs' | 'services' | 'zones', value: string): void {
    this.settings.update((s) => {
      const list = s[key] as string[];
      const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
      return { ...s, [key]: next };
    });
  }

  saveSettings(): void {
    this.toast.show('Cambios guardados. Tu perfil ya está actualizado.');
  }
}
