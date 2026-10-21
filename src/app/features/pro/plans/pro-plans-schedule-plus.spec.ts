import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { API_URL } from '../../../core/api/api.config';
import { flushMonth } from '../../../core/api/pro-tools.testing';
import { FunnelTracker } from '../../../core/analytics/funnel-tracker';
import { OwnPlan, PlansInfo } from '../../../core/models/pro-analytics';
import { OwnProfessional } from '../../../core/models/pro-profile';
import { TransferOverview } from '../../../core/models/transfer';
import { ProStore } from '../../../core/state/pro.store';
import { ProPlansPage } from './pro-plans-page';

const API = 'http://api.test/api/v1';
const flush = () => new Promise((r) => setTimeout(r));
const PRO: OwnPlan = {
  tier: 'PRO',
  expiresAt: '2026-12-31T02:59:59.000Z',
  source: 'TRANSFER',
  entitlements: { canSendUnlimitedQuotes: true, canBeFeatured: true, canUseAdvancedAnalytics: true, canSeeExposureAnalytics: true, canUseQuoteTemplates: false, portfolioWorkLimit: 10 },
} as unknown as OwnPlan;
const INFO = { free: { quoteLimit: 5 }, pro: { monthlyPriceArs: 15000, selfServe: false, features: { quoteTemplates: false } }, proPlus: { monthlyPriceArs: 24900 } } as unknown as PlansInfo;
const opt = (months: 1 | 3 | 6, plus: boolean) => ({
  months, days: months * 30, amountArs: (plus ? 24900 : 15000) * months, basePriceArs: plus ? 24900 : 15000,
  discountedFirstMonthArs: null, offerCode: null,
  ...(plus ? { startsAt: '2026-11-20T15:00:00.000Z', endsAt: '2026-12-20T15:00:00.000Z', startsNow: false } : {}),
});
const overview = (patch: Partial<TransferOverview> = {}): TransferOverview => ({
  available: true,
  account: { holder: 'F', alias: 'resuelve.pro', cbu: '2850590940090418135201', bank: 'B', cuit: '20-1' },
  blocked: null,
  options: [opt(1, false), opt(3, false)],
  plusOptions: [opt(1, true), opt(3, true)],
  scheduledPlus: true,
  currentTier: 'PRO',
  pending: null,
  last: null,
  recentOutcome: null,
  proUntil: '2026-11-20T15:00:00.000Z',
  withdrawal: null,
  refundPending: null,
  proofUploads: true,
  ...patch,
});

async function render(o: TransferOverview) {
  const planSignal = signal<OwnPlan>(PRO);
  const store = {
    plan: planSignal,
    ownProfile: signal({ id: 'p1', displayName: 'Marta', services: [], zones: [], plan: PRO } as unknown as OwnProfessional),
    hasPro: computed(() => true),
    requestingPro: signal(false),
    proTrial: signal(null),
    trialSummary: signal(null),
    loadTrialSummary: async () => null,
    startingTrial: signal(false),
    introOffer: signal(null),
    trackOffer: () => undefined,
    refreshProfile: async () => undefined,
  };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_URL, useValue: API },
      { provide: ProStore, useValue: store },
      { provide: FunnelTracker, useValue: { track: () => undefined } },
    ],
  });
  const fixture = TestBed.createComponent(ProPlansPage);
  const http = TestBed.inject(HttpTestingController);
  http.expectOne(`${API}/plans`).flush(INFO);
  fixture.detectChanges();
  http.match((r) => r.url.endsWith('/billing/transfer')).forEach((r) => r.flush(o));
  http.match((r) => r.url.includes('/pro/acquisition/')).forEach((r) => r.flush({ enabled: false, available: false }));
  flushMonth(http);
  await flush();
  fixture.detectChanges();
  return { fixture, http, el: fixture.nativeElement as HTMLElement };
}

describe('Mi plan: "Programar cambio a Plus" (transferencia)', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });
  const button = (el: HTMLElement) => el.querySelector<HTMLButtonElement>('[data-testid="schedule-plus-transfer"]');

  it('no ofrece otra compra Plus ni crea pedidos aunque lleguen opciones históricas', async () => {
    const { http, el } = await render(overview());
    expect(button(el)).toBeNull();
    expect(el.querySelector('#transfer-tier')).toBeNull();
    expect(el.textContent).not.toContain('PRO Plus');
    http.expectNone((r) => r.method !== 'GET');
  });

  it.each([
    ['el backend no lo permite', overview({ scheduledPlus: false })],
    ['no hay opciones de Plus', overview({ plusOptions: [] })],
    ['hay un pago en curso', overview({ pending: { id: 't1', reference: 'RES-AAAAAA', status: 'AWAITING_PROOF', months: 1, amountArs: 24900, planTier: 'PRO_PLUS' } as never })],
    ['Plus ya está programado', overview({ plusStartsAt: '2026-11-20T15:00:00.000Z' })],
  ])('sin botón si %s', async (_name, o) => {
    const { el } = await render(o);
    expect(button(el)).toBeNull();
  });
});
