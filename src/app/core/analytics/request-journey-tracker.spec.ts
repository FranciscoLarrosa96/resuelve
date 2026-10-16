import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_URL } from '../api/api.config';
import { AuthStore } from '../state/auth.store';
import { FLUSH_DELAY_MS } from './exposure-tracker';
import { RequestJourneyTracker } from './request-journey-tracker';

const API = 'http://api.test/api/v1';
const URL = `${API}/analytics/request-journey`;
const authenticated = signal(false);

function setup() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_URL, useValue: API },
      { provide: AuthStore, useValue: { authenticated, whenReady: () => Promise.resolve() } },
    ],
  });
  return { tracker: TestBed.inject(RequestJourneyTracker), http: TestBed.inject(HttpTestingController) };
}
const flush = (http: HttpTestingController) => {
  vi.advanceTimersByTime(FLUSH_DELAY_MS);
  const reqs = http.match(URL);
  reqs.forEach((r) => r.flush({ accepted: 1 }));
  return reqs.map((r) => r.request.body as { attemptId: string; journey: string; events: { type: string; [k: string]: unknown }[] });
};

describe('recorrido del pedido: tracker', () => {
  beforeEach(() => {
    sessionStorage.clear();
    authenticated.set(false);
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('un intento, un inicio y cada paso una sola vez; todo junto y diferido', async () => {
    const { tracker, http } = setup();
    tracker.ensure('REQUEST', 'MARKETPLACE_DISCOVERY');
    tracker.ensure('COMPARE'); // ya hay un intento: no abre otro
    tracker.stepViewed(0);
    tracker.stepViewed(1);
    tracker.stepViewed(1); // vuelta atrás / rerender
    http.expectNone(URL);
    const [body, ...rest] = flush(http);
    expect(rest).toEqual([]);
    expect(body.journey).toBe('REQUEST');
    expect(body.attemptId).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.events).toEqual([
      { type: 'STARTED', entry: 'MARKETPLACE_DISCOVERY' },
      { type: 'STEP_VIEWED', step: 0 },
      { type: 'STEP_VIEWED', step: 1 },
    ]);
    expect(tracker.attemptId()).toBe(body.attemptId);
  });

  it('no envía nada del contenido del pedido: solo tipo, paso y entrada', () => {
    const { tracker, http } = setup();
    tracker.ensure('DIRECT', 'DIRECT_PUBLIC_PROFILE');
    tracker.quoteViewed();
    const [body] = flush(http);
    expect(Object.keys(body).sort()).toEqual(['attemptId', 'events', 'journey']);
    expect(JSON.stringify(body)).not.toMatch(/@|description|title|address|phone|name/i);
  });

  it('sin intento, las vistas no miden nada (nunca se inventa un inicio)', () => {
    const { tracker, http } = setup();
    tracker.stepViewed(2);
    tracker.quoteViewed();
    vi.advanceTimersByTime(FLUSH_DELAY_MS);
    http.expectNone(URL);
  });

  it('restore() retoma el mismo intento (recarga o vuelta de /ingresar): sin otro inicio y con regreso autenticado una vez', async () => {
    let s = setup();
    s.tracker.ensure('DIRECT', 'DIRECT_PUBLIC_PROFILE');
    s.tracker.authRequired(); // envía enseguida
    const first = s.http.match(URL);
    const sentFirst = first.map((r) => r.request.body as { attemptId: string; events: { type: string }[] });
    first.forEach((r) => r.flush({ accepted: 2 }));
    expect(sentFirst[0].events.map((e) => e.type)).toEqual(['STARTED', 'AUTH_REQUIRED']);
    const saved = s.tracker.attempt();

    // Recarga: el store restaura el intento guardado con el borrador.
    s = setup();
    s.tracker.restore(saved);
    expect(s.tracker.attemptId()).toBe(sentFirst[0].attemptId);
    s.tracker.ensure('REQUEST'); // ya hay intento: no abre otro
    s.tracker.quoteViewed(); // todavía sin sesión: no es un regreso
    await vi.advanceTimersByTimeAsync(0);
    let [body] = flush(s.http);
    expect(body.events.map((e) => e['type'])).toEqual(['QUOTE_VIEWED']);

    authenticated.set(true);
    s.tracker.quoteViewed();
    s.tracker.stepViewed(4);
    await vi.advanceTimersByTimeAsync(0);
    [body] = flush(s.http);
    expect(body.attemptId).toBe(sentFirst[0].attemptId);
    expect(body.events.filter((e) => e['type'] === 'AUTH_RETURNED')).toHaveLength(1);
    expect(s.tracker.attempt()?.authReturned).toBe(true);
    s.tracker.stepViewed(4);
    await vi.advanceTimersByTimeAsync(0);
    expect(flush(s.http)).toEqual([]);
  });

  it('restore() ignora lo que no es un intento válido', () => {
    const { tracker } = setup();
    tracker.restore({ id: 'no-uuid', journey: 'REQUEST', authRequired: false, authReturned: false });
    expect(tracker.attemptId()).toBeUndefined();
    tracker.restore(null);
    expect(tracker.attempt()).toBeNull();
  });

  it('end() cierra el intento: el próximo pedido es otro', () => {
    const { tracker, http } = setup();
    tracker.ensure('REQUEST');
    const first = tracker.attemptId();
    flush(http);
    tracker.end();
    expect(tracker.attemptId()).toBeUndefined();
    tracker.ensure('REQUEST');
    expect(tracker.attemptId()).not.toBe(first);
  });

  it('una falla de red es silenciosa', () => {
    const { tracker, http } = setup();
    tracker.ensure('REQUEST');
    vi.advanceTimersByTime(FLUSH_DELAY_MS);
    expect(() => http.expectOne(URL).error(new ProgressEvent('error'))).not.toThrow();
  });
});
