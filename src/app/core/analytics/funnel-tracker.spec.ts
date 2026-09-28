import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_URL } from '../api/api.config';
import { AuthStore } from '../state/auth.store';
import { FLUSH_DELAY_MS } from './exposure-tracker';
import { FunnelTracker } from './funnel-tracker';

const API = 'http://api.test/api/v1';
const URL = `${API}/pro/funnel-events`;
const user = signal<{ professionalProfileId: string | null } | null>(null);

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_URL, useValue: API },
      { provide: AuthStore, useValue: { user, accessToken: signal('token') } },
    ],
  });
  return { tracker: TestBed.inject(FunnelTracker), http: TestBed.inject(HttpTestingController) };
}

describe('embudo PRO: tracker', () => {
  beforeEach(() => {
    user.set({ professionalProfileId: 'pro-1' });
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    TestBed.inject(HttpTestingController).verify();
  });

  it('diferido (~2 s) y una vez por evento + superficie en la sesión', () => {
    const { tracker, http } = setup();
    tracker.track('PRO_PLAN_VIEWED', 'PLAN_PAGE');
    tracker.track('PRO_PLAN_VIEWED', 'PLAN_PAGE');
    tracker.track('PRO_CTA_CLICKED', 'LIMIT_MODAL');
    http.expectNone(URL);
    vi.advanceTimersByTime(FLUSH_DELAY_MS);
    const reqs = http.match(URL);
    expect(reqs.map((r) => r.request.body)).toEqual([
      { type: 'PRO_PLAN_VIEWED', surface: 'PLAN_PAGE' },
      { type: 'PRO_CTA_CLICKED', surface: 'LIMIT_MODAL' },
    ]);
    reqs.forEach((r) => r.flush({ recorded: true }));
  });

  it('sin perfil profesional no mide nada', () => {
    user.set({ professionalProfileId: null });
    const { tracker, http } = setup();
    tracker.track('PRO_PLAN_VIEWED', 'PLAN_PAGE');
    vi.advanceTimersByTime(FLUSH_DELAY_MS);
    http.expectNone(URL);
  });
});
