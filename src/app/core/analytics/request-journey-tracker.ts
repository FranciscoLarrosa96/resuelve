import { HttpClient } from '@angular/common/http';
import { DestroyRef, Injectable, PLATFORM_ID, inject } from '@angular/core';
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

interface Attempt {
  id: string;
  journey: JourneyKind;
  savedAt: number;
  authRequired: boolean;
  authReturned: boolean;
}

const KEY = 'resuelve.requestAttempt';
/** Igual que el borrador (`DRAFT_TTL_MS`): un intento más viejo ya no se retoma. */
export const ATTEMPT_TTL_MS = 12 * 60 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JOURNEYS: JourneyKind[] = ['REQUEST', 'DIRECT', 'COMPARE'];

/**
 * Mide cuántas personas empiezan un pedido, hasta dónde llegan y cuántas lo envían.
 * Anónimo: una clave aleatoria por INTENTO (sessionStorage, la misma vida que el
 * borrador: sobrevive a la recarga y al paso por /ingresar), el recorrido, el paso y
 * la entrada. Nunca nombre, teléfono, email, dirección ni texto del pedido. El
 * envío confirmado NO se informa desde acá: lo registra el backend al enviar de
 * verdad (la clave viaja con las invitaciones). Errores silenciosos: es medición.
 */
@Injectable({ providedIn: 'root' })
export class RequestJourneyTracker {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_URL);
  private readonly auth = inject(AuthStore);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  private memory: Attempt | null = null;
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
    return this.browser ? (this.read()?.id) : undefined;
  }

  /**
   * Hay (o se abre) un intento. Si ya hay uno vigente se sigue con ese: pasar de
   * /solicitud a resultados y de ahí a /presupuesto es UN solo intento.
   */
  ensure(journey: JourneyKind, entry?: RequestAttributionSource): void {
    if (!this.browser || this.read()) return;
    const attempt: Attempt = { id: crypto.randomUUID(), journey, savedAt: Date.now(), authRequired: false, authReturned: false };
    this.write(attempt);
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
    const attempt = this.read();
    if (!attempt || attempt.authRequired) return;
    this.write({ ...attempt, authRequired: true });
    this.emit(attempt, { type: 'AUTH_REQUIRED' });
    this.flush();
  }

  /** El pedido terminó (enviado, descartado o reemplazado por otro): el próximo es otro intento. */
  end(): void {
    this.memory = null;
    if (!this.browser) return;
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      /* sin almacenamiento: solo en memoria */
    }
  }

  /** Cada vista cuenta la primera vez; si volvió autenticado de /ingresar, también el regreso. */
  private view(event: JourneyEvent): void {
    const attempt = this.read();
    if (!attempt) return;
    this.emit(attempt, event);
    if (attempt.authRequired && !attempt.authReturned) {
      void this.auth.whenReady().then(() => {
        const current = this.read();
        if (!current || current.id !== attempt.id || current.authReturned || !this.auth.authenticated()) return;
        this.write({ ...current, authReturned: true });
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

  private read(now = Date.now()): Attempt | null {
    if (this.memory && now - this.memory.savedAt < ATTEMPT_TTL_MS) return this.memory;
    try {
      const parsed = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as Attempt | null;
      if (
        parsed &&
        UUID.test(parsed.id) &&
        JOURNEYS.includes(parsed.journey) &&
        typeof parsed.savedAt === 'number' &&
        parsed.savedAt <= now &&
        now - parsed.savedAt < ATTEMPT_TTL_MS
      ) {
        return (this.memory = { ...parsed, authRequired: parsed.authRequired === true, authReturned: parsed.authReturned === true });
      }
    } catch {
      /* ilegible: se ignora */
    }
    this.memory = null;
    return null;
  }

  private write(attempt: Attempt): void {
    this.memory = { ...attempt, savedAt: Date.now() };
    try {
      sessionStorage.setItem(KEY, JSON.stringify(this.memory));
    } catch {
      /* sin almacenamiento: el intento dura lo que dure la página */
    }
  }
}
