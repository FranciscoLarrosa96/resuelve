import { HttpClient } from '@angular/common/http';
import { DestroyRef, Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { API_URL } from '../api/api.config';
import type { RequestAttributionSource } from '../models/request';
import { AuthStore } from '../state/auth.store';
import { FLUSH_DELAY_MS } from './exposure-tracker';

/**
 * Recorridos (no se mezclan en el reporte): REQUEST arma el pedido en /solicitud;
 * DIRECT va a un profesional ya elegido; COMPARE llega con varios desde resultados.
 */
export type JourneyKind = 'REQUEST' | 'DIRECT' | 'COMPARE';

type JourneyEvent =
  | { type: 'STARTED'; entry?: RequestAttributionSource }
  | { type: 'STEP_VIEWED'; step: number }
  | { type: 'QUOTE_VIEWED' }
  | { type: 'AUTH_REQUIRED' }
  | { type: 'AUTH_RETURNED' };

/** El intento en curso. Viaja DENTRO del borrador (`StoredDraft.journey`): no tiene otro vencimiento. */
export interface Attempt {
  id: string;
  journey: JourneyKind;
  authRequired: boolean;
  authReturned: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const JOURNEYS: JourneyKind[] = ['REQUEST', 'DIRECT', 'COMPARE'];

/** ¿Es un intento válido leído de afuera (el borrador guardado)? */
export function isAttempt(a: unknown): a is Attempt {
  const x = a as Attempt | null;
  return (
    !!x &&
    typeof x.id === 'string' &&
    UUID.test(x.id) &&
    JOURNEYS.includes(x.journey) &&
    typeof x.authRequired === 'boolean' &&
    typeof x.authReturned === 'boolean'
  );
}

/**
 * Mide cuántas personas empiezan un pedido, hasta dónde llegan y cuántas lo envían.
 * Anónimo: una clave aleatoria por INTENTO, el recorrido, el paso y
 * la entrada. El intento vive y vence CON el borrador del pedido (`RequestStore` lo guarda y
 * lo restaura junto con él: mismo borrador = mismo intento, sin un vencimiento propio). Nunca nombre, teléfono, email, dirección ni texto del pedido. El
 * envío confirmado NO se informa desde acá: lo registra el backend al enviar de
 * verdad (la clave viaja con las invitaciones). Errores silenciosos: es medición.
 */
@Injectable({ providedIn: 'root' })
export class RequestJourneyTracker {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_URL);
  private readonly auth = inject(AuthStore);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly state = signal<Attempt | null>(null);
  /** Intento en curso (el store lo persiste con el borrador). */
  readonly attempt = this.state.asReadonly();
  private readonly sent = new Set<string>();
  private queue: { attemptId: string; journey: JourneyKind; event: JourneyEvent }[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    if (!this.browser) return;
    const onHide = () => {
      if (document.visibilityState === 'hidden') this.flush(true);
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    inject(DestroyRef).onDestroy(() => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
    });
  }

  /** Clave del intento en curso, para que el backend registre el envío confirmado. */
  attemptId(): string | undefined {
    return this.browser ? this.state()?.id : undefined;
  }

  /**
   * Hay (o se abre) un intento. Si ya hay uno vigente se sigue con ese: pasar de
   * /solicitud a resultados y de ahí a /presupuesto es UN solo intento.
   */
  ensure(journey: JourneyKind, entry?: RequestAttributionSource): void {
    if (!this.browser || this.state()) return;
    const attempt: Attempt = { id: crypto.randomUUID(), journey, authRequired: false, authReturned: false };
    this.state.set(attempt);
    this.emit(attempt, { type: 'STARTED', ...(entry ? { entry } : {}) });
  }

  stepViewed(step: number): void {
    this.view({ type: 'STEP_VIEWED', step });
  }

  quoteViewed(): void {
    this.view({ type: 'QUOTE_VIEWED' });
  }

  /** Justo antes de mandar a /ingresar (o /registro) para poder continuar el pedido. */
  authRequired(): void {
    const attempt = this.state();
    if (!attempt || attempt.authRequired) return;
    this.state.set({ ...attempt, authRequired: true });
    this.emit(attempt, { type: 'AUTH_REQUIRED' });
    this.flush();
  }

  /** Se retoma el MISMO borrador (recarga, vuelta de /ingresar): sigue su intento, sin emitir otro inicio. */
  restore(attempt: Attempt | null | undefined): void {
    this.state.set(this.browser && isAttempt(attempt) ? { ...attempt } : null);
  }

  /** El pedido terminó (enviado, descartado, reemplazado o vencido): el próximo es otro intento. */
  end(): void {
    this.state.set(null);
  }

  /** Cada vista cuenta la primera vez; si volvió autenticado de /ingresar, también el regreso. */
  private view(event: JourneyEvent): void {
    const attempt = this.state();
    if (!attempt) return;
    this.emit(attempt, event);
    if (attempt.authRequired && !attempt.authReturned) {
      void this.auth.whenReady().then(() => {
        const current = this.state();
        if (!current || current.id !== attempt.id || current.authReturned || !this.auth.authenticated()) return;
        this.state.set({ ...current, authReturned: true });
        this.emit(current, { type: 'AUTH_RETURNED' });
      });
    }
  }

  private emit(attempt: Attempt, event: JourneyEvent): void {
    const key = `${attempt.id}|${event.type}|${'step' in event ? event.step : ''}`;
    if (this.sent.has(key)) return;
    this.sent.add(key);
    this.queue.push({ attemptId: attempt.id, journey: attempt.journey, event });
    this.timer ??= setTimeout(() => this.flush(), FLUSH_DELAY_MS);
  }

  flush(leaving = false): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const url = `${this.baseUrl}/analytics/request-journey`;
    const pending = this.queue.splice(0);
    const byAttempt = new Map<string, typeof pending>();
    for (const item of pending) byAttempt.set(item.attemptId, [...(byAttempt.get(item.attemptId) ?? []), item]);
    for (const [attemptId, items] of byAttempt) {
      const body = { attemptId, journey: items[0].journey, events: items.slice(0, 10).map((i) => i.event) };
      if (leaving && typeof fetch === 'function') {
        void fetch(url, {
          method: 'POST',
          keepalive: true,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }).catch(() => undefined);
      } else {
        this.http.post(url, body).subscribe({ error: () => undefined });
      }
    }
  }
}
