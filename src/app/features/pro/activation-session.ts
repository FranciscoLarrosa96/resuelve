import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { ActivationTip } from './activation';

const KEY = 'resuelve:activation-session';
const TIPS: readonly ActivationTip[] = ['AVATAR', 'SHARE', 'PHOTOS', 'REVIEW', 'CONTACT'];

/**
 * Primeros pasos que ya se mostraron o se dejaron para después en ESTA sesión del navegador (pestaña): la
 * bienvenida y el Inicio no repiten enseguida lo mismo. No es un "hecho": nada se marca como completado
 * (eso sale siempre de los datos reales) y en una sesión nueva vuelven a sugerirse. Por cuenta.
 */
@Injectable({ providedIn: 'root' })
export class ActivationSession {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private memory: { userId: string; tips: ActivationTip[] } | null = null;

  /** Las salteadas de esta cuenta en esta sesión. */
  skipped(userId: string | null | undefined): ActivationTip[] {
    if (!userId) return [];
    const state = this.read();
    return state?.userId === userId ? state.tips : [];
  }

  skip(userId: string | null | undefined, tip: ActivationTip): void {
    if (!userId) return;
    const current = this.skipped(userId);
    if (current.includes(tip)) return;
    this.write({ userId, tips: [...current, tip] });
  }

  private read(): { userId: string; tips: ActivationTip[] } | null {
    if (this.memory) return this.memory;
    if (!this.browser) return null;
    try {
      const raw = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as { userId?: unknown; tips?: unknown } | null;
      if (raw && typeof raw.userId === 'string' && Array.isArray(raw.tips))
        return (this.memory = { userId: raw.userId, tips: raw.tips.filter((t): t is ActivationTip => TIPS.includes(t as ActivationTip)) });
    } catch {
      /* sin almacenamiento o dato inválido: se empieza de cero */
    }
    return null;
  }

  private write(state: { userId: string; tips: ActivationTip[] }): void {
    this.memory = state;
    if (!this.browser) return;
    try {
      sessionStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* queda en memoria */
    }
  }
}
