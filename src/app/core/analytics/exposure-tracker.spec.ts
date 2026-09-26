import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_URL } from '../api/api.config';
import { AuthStore } from '../state/auth.store';
import { ExposureTracker, FLUSH_DELAY_MS, ImpressionContext, PROFILE_VIEW_WINDOW_MS } from './exposure-tracker';
import { IMPRESSION_DWELL_MS, TrackImpression } from './track-impression.directive';

const API = 'http://api.test/api/v1';
const URL = `${API}/analytics/events`;
const ctx = (patch: Partial<ImpressionContext> = {}): ImpressionContext => ({
  professionalId: 'p1',
  serviceId: 's1',
  zoneId: 'z1',
  isUrgent: false,
  isFeaturedPlacement: false,
  page: 1,
  ...patch,
});

const user = signal<{ professionalProfileId: string | null; email: string } | null>(null);

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_URL, useValue: API },
      { provide: AuthStore, useValue: { user } },
    ],
  });
  return { tracker: TestBed.inject(ExposureTracker), http: TestBed.inject(HttpTestingController) };
}

describe('exposición: tracker', () => {
  beforeEach(() => {
    sessionStorage.clear();
    user.set(null);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    TestBed.inject(HttpTestingController).verify();
  });

  it('agrupa en una tanda cada ~2 s y deduplica rerenders (misma búsqueda = una aparición)', () => {
    const { tracker, http } = setup();
    tracker.impression(ctx());
    tracker.impression(ctx()); // rerender / change detection
    tracker.impression(ctx({ professionalId: 'p2', isFeaturedPlacement: true }));
    http.expectNone(URL);
    vi.advanceTimersByTime(FLUSH_DELAY_MS);
    const req = http.expectOne(URL);
    expect(req.request.body.events).toEqual([
      { type: 'SEARCH_IMPRESSION', professionalId: 'p1', serviceId: 's1', zoneId: 'z1', isUrgent: false, isFeaturedPlacement: false, page: 1 },
      { type: 'SEARCH_IMPRESSION', professionalId: 'p2', serviceId: 's1', zoneId: 'z1', isUrgent: false, isFeaturedPlacement: true, page: 1 },
    ]);
    req.flush({ accepted: 2 });
  });

  it('otra búsqueda (barrio, urgente o página) es otra aparición', () => {
    const { tracker, http } = setup();
    for (const c of [ctx(), ctx({ zoneId: 'z2' }), ctx({ isUrgent: true }), ctx({ page: 2 })]) tracker.impression(c);
    vi.advanceTimersByTime(FLUSH_DELAY_MS);
    const req = http.expectOne(URL);
    expect(req.request.body.events).toHaveLength(4);
    req.flush({ accepted: 4 });
  });

  it('clave de sesión anónima y estable (sessionStorage), sin datos personales', () => {
    user.set({ professionalProfileId: null, email: 'cliente@test.dev' });
    const { tracker, http } = setup();
    tracker.impression(ctx());
    vi.advanceTimersByTime(FLUSH_DELAY_MS);
    const first = http.expectOne(URL);
    const key = first.request.body.sessionKey as string;
    expect(key).toMatch(/^[0-9a-f]{32}$/);
    expect(JSON.stringify(first.request.body)).not.toContain('cliente@test.dev');
    first.flush({ accepted: 1 });
    tracker.profileView('p9');
    vi.advanceTimersByTime(FLUSH_DELAY_MS);
    const second = http.expectOne(URL);
    expect(second.request.body.sessionKey).toBe(key);
    second.flush({ accepted: 1 });
  });

  it('visita al perfil: una cada 30 min por pestaña (F5 no suma); la propia nunca', () => {
    user.set({ professionalProfileId: 'mine', email: 'pro@test.dev' });
    const { tracker, http } = setup();
    const t0 = Date.now();
    tracker.profileView('p1', t0);
    tracker.profileView('p1', t0 + 10 * 60_000);
    tracker.profileView('mine', t0);
    tracker.impression(ctx({ professionalId: 'mine' }));
    vi.advanceTimersByTime(FLUSH_DELAY_MS);
    const req = http.expectOne(URL);
    expect(req.request.body.events).toEqual([{ type: 'PROFILE_VIEW', professionalId: 'p1' }]);
    req.flush({ accepted: 1 });
    tracker.profileView('p1', t0 + PROFILE_VIEW_WINDOW_MS);
    vi.advanceTimersByTime(FLUSH_DELAY_MS);
    http.expectOne(URL).flush({ accepted: 1 });
  });

  it('un error de red no rompe nada (silencioso)', () => {
    const { tracker, http } = setup();
    tracker.profileView('p1');
    vi.advanceTimersByTime(FLUSH_DELAY_MS);
    http.expectOne(URL).flush(null, { status: 500, statusText: 'x' });
  });
});

// ---- Directiva ---------------------------------------------------------------
type IOCallback = (entries: Partial<IntersectionObserverEntry>[]) => void;
const observers: { callback: IOCallback; disconnected: boolean }[] = [];

class FakeIntersectionObserver {
  private readonly record: { callback: IOCallback; disconnected: boolean };
  constructor(callback: IOCallback) {
    this.record = { callback, disconnected: false };
    observers.push(this.record);
  }
  observe(): void {}
  disconnect(): void {
    this.record.disconnected = true;
  }
}

@Component({
  imports: [TrackImpression],
  template: `<article [appTrackImpression]="context()">Tarjeta</article>`,
})
class Host {
  readonly context = signal(ctx());
}

describe('exposición: aparición real (IntersectionObserver)', () => {
  const impression = vi.fn();

  beforeEach(() => {
    observers.length = 0;
    impression.mockReset();
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
    vi.useFakeTimers();
    TestBed.configureTestingModule({ providers: [{ provide: ExposureTracker, useValue: { impression } }] });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const render = () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    TestBed.tick();
    return fixture;
  };
  const see = (ratio: number) => observers.at(-1)!.callback([{ isIntersecting: ratio > 0, intersectionRatio: ratio }]);

  it('≥ 50 % visible durante ≥ 500 ms: cuenta una vez y deja de observar', () => {
    render();
    see(0.6);
    vi.advanceTimersByTime(IMPRESSION_DWELL_MS - 1);
    expect(impression).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(impression).toHaveBeenCalledTimes(1);
    expect(impression).toHaveBeenCalledWith(ctx());
    expect(observers.at(-1)!.disconnected).toBe(true);
  });

  it('un vistazo (scroll rápido) o menos de la mitad visible no cuenta', () => {
    render();
    see(0.3);
    vi.advanceTimersByTime(1000);
    see(0.8);
    vi.advanceTimersByTime(200);
    see(0);
    vi.advanceTimersByTime(1000);
    expect(impression).not.toHaveBeenCalled();
  });

  it('rerender con el mismo contexto no vuelve a contar; otra búsqueda sí', () => {
    const fixture = render();
    see(1);
    vi.advanceTimersByTime(IMPRESSION_DWELL_MS);
    fixture.componentInstance.context.set(ctx()); // objeto nuevo, misma búsqueda
    fixture.detectChanges();
    TestBed.tick();
    expect(observers).toHaveLength(1);
    fixture.componentInstance.context.set(ctx({ zoneId: 'z2' }));
    fixture.detectChanges();
    TestBed.tick();
    expect(observers).toHaveLength(2);
    see(1);
    vi.advanceTimersByTime(IMPRESSION_DWELL_MS);
    expect(impression).toHaveBeenCalledTimes(2);
  });
});
