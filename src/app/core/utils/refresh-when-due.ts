import { DestroyRef, PLATFORM_ID, effect, inject, untracked } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/** Margen después del vencimiento (el backend compara con su propio reloj). */
export const DUE_GRACE_MS = 1_000;
/** Si el backend todavía no lo da por vencido (relojes corridos), se reintenta así. */
export const DUE_RETRY_MS = 5_000;
const MAX_RETRIES = 12;
/** setTimeout no admite esperas enormes: se re-arma por tramos. */
const MAX_WAIT_MS = 6 * 60 * 60 * 1000;

/**
 * Relee del backend cuando vence un horario, sin polling y sin F5.
 *
 * `deadline` devuelve el ISO del vencimiento a esperar (o null). Se programa
 * UN timer para `deadline - ahora` (+1 s); al vencer se llama `refresh` y el
 * backend decide (nunca se completa ni se cambia nada localmente). Si la
 * respuesta todavía no lo da por vencido (reloj del navegador adelantado),
 * se reintenta cada 5 s, como mucho 12 veces por vencimiento.
 *
 * `deadline` se evalúa dentro de un effect: se reprograma solo cuando cambian
 * las señales que lee (por ejemplo, la solicitud releída). Debe llamarse en un
 * contexto de inyección.
 */
export function refreshWhenDue(deadline: () => string | null, refresh: () => void): void {
  if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let current: string | null = null;
  let retries = 0;

  const arm = (iso: string) => {
    clearTimeout(timer);
    const wait = new Date(iso).getTime() - Date.now();
    if (Number.isNaN(wait)) return;
    if (wait > 0) {
      timer = setTimeout(() => arm(iso), Math.min(wait + DUE_GRACE_MS, MAX_WAIT_MS));
      return;
    }
    // Ya venció según este reloj: se le pregunta al backend (la primera vez enseguida).
    if (retries > MAX_RETRIES) return;
    const delay = retries === 0 ? 0 : DUE_RETRY_MS;
    retries++;
    timer = setTimeout(refresh, delay);
  };

  effect(() => {
    const iso = deadline();
    untracked(() => {
      if (iso !== current) {
        current = iso;
        retries = 0;
      }
      if (iso) arm(iso);
      else clearTimeout(timer);
    });
  });
  inject(DestroyRef).onDestroy(() => clearTimeout(timer));
}

/** El más próximo de varios vencimientos (null si no hay ninguno). */
export function earliest(isos: readonly (string | null)[]): string | null {
  let best: string | null = null;
  for (const iso of isos) if (iso && (!best || new Date(iso).getTime() < new Date(best).getTime())) best = iso;
  return best;
}
