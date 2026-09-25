import { Injectable, computed, inject, signal } from '@angular/core';
import { INITIAL_PRO_SETTINGS, PRO_STATS } from '../data/pro.data';
import { ProPlan, ProSettings } from '../models/pro';
import { avatarOf } from '../models/avatar';
import { ToastService } from '../services/toast.service';
import { AuthStore } from './auth.store';

const DEMO_PRO_ID = 'demo-pro';

/**
 * Estado DEMO del área profesional (dashboard, agenda, estadísticas, perfil,
 * plan). Solicitudes y presupuestos NO viven acá: son reales (ProRequestsStore).
 */
@Injectable({ providedIn: 'root' })
export class ProStore {
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthStore);

  /**
   * MOCK: identidad de ejemplo de las pantallas demo. No es el usuario
   * autenticado; esas pantallas lo aclaran con un aviso de demostración.
   */
  readonly me = { id: DEMO_PRO_ID, ...avatarOf({ id: DEMO_PRO_ID, displayName: INITIAL_PRO_SETTINGS.name, avatarUrl: null }) };
  /** Perfil público REAL del usuario, solo si ya tiene ProfessionalProfile. */
  readonly publicProfileId = computed(() => this.auth.user()?.professionalProfileId ?? null);

  readonly available = signal(true);
  readonly plan = signal<ProPlan>('free');
  readonly isFree = computed(() => this.plan() === 'free');
  readonly planUsagePct = (PRO_STATS.planUsed / PRO_STATS.planLimit) * 100;

  readonly settings = signal<ProSettings>(INITIAL_PRO_SETTINGS);

  // ---- Disponibilidad y plan (demo) ---------------------------------
  toggleAvailability(): void {
    const next = !this.available();
    this.available.set(next);
    this.toast.show(next ? 'Estás disponible hoy. Te mostramos en búsquedas.' : 'Pausaste tu disponibilidad por hoy.');
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
