import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { MonthAnalytics } from '../models/pro-analytics';
import { WorkPhotosStore } from '../state/work-photos.store';
import { ProValuePanel } from '../../features/pro/plans/pro-value-panel';
import { lateText } from '../../features/pro/pro-ui';
import { acceptedVsPrice, priceMultipleText, proGainFacts, withoutProFacts } from './pro-value';

function month(patch: Partial<MonthAnalytics> = {}): MonthAnalytics {
  return {
    period: { year: 2026, month: 10, start: '', end: '', isCurrent: true, earliest: { year: 2026, month: 9 } },
    plan: 'FREE',
    entitlements: {
      canSendUnlimitedQuotes: false,
      canBeFeatured: false,
      canUseAdvancedAnalytics: false,
      canSeeExposureAnalytics: false,
      canUseQuoteTemplates: false,
      portfolioWorkLimit: 1,
    },
    basic: {
      requestsReceived: 0, quotesSent: 0, quotesAccepted: 0, scheduledJobs: 0, completedJobs: 0,
      reviewsReceived: 0, currentRating: null, reviewCount: 0, acceptedQuotesValue: '0.00',
    },
    recentReviews: [],
    advanced: null,
    exposure: null,
    proPreview: { impressions: 0, profileViews: 0, delayedOpportunities: 0, delayedAfterOtherQuote: 0, blockedOpportunities: 0 },
    proMonthlyPrice: 15000,
    ...patch,
  };
}

describe('valor de PRO con los números del profesional', () => {
  it('sin PRO: solo hechos que pasaron (nada inventado si no hubo demoras ni cupo)', () => {
    expect(withoutProFacts(month())).toEqual([]);
    const one = withoutProFacts(month({ proPreview: { ...month().proPreview!, delayedOpportunities: 1, delayedAfterOtherQuote: 1 } }));
    expect(one).toEqual([
      { value: '1', text: 'solicitud nueva te llegó después que a los perfiles PRO; ya tenía un presupuesto de otro profesional.' },
    ]);
    // Con PRO no hay "sin PRO".
    expect(withoutProFacts(month({ proPreview: null }))).toEqual([]);
  });

  it('lo aceptado contra el precio: solo con aceptados y precio, y en pesos por día', () => {
    expect(acceptedVsPrice(month())).toBeNull();
    expect(acceptedVsPrice(month({ basic: { ...month().basic, acceptedQuotesValue: '90000.00' } }))).toEqual({
      accepted: '$ 90.000',
      price: '$15.000',
      perDay: '$500',
    });
    expect(acceptedVsPrice(month({ basic: { ...month().basic, acceptedQuotesValue: '90000.00' }, proMonthlyPrice: 0 }))).toBeNull();
  });

  it('PRO: múltiplo del precio solo desde 1 vez, y lo que sumó sin atribuir causas', () => {
    const advanced = {
      acceptedQuotesValue: '240000.00',
      planPriceMultiple: 16,
      acceptance: { sent: 6, accepted: 5, rate: 83.3 },
      attribution: { earlyAccessOpportunities: 4, featuredAttributedRequests: 0, featuredAttributedAccepted: 0 },
      previous: null, weekly: [], byService: [], byZone: [],
    };
    const pro = month({ plan: 'PRO', proPreview: null, advanced });
    expect(priceMultipleText(pro)).toBe('Lo que te aceptaron este mes ($ 240.000) equivale a 16 veces el precio de PRO.');
    expect(priceMultipleText(month({ advanced: { ...advanced, planPriceMultiple: 0.5 } }))).toBeNull();
    // Sin ceros: lo que no pasó no se muestra como logro.
    expect(proGainFacts(pro).map((f) => `${f.value} ${f.text}`)).toEqual([
      '4 solicitudes nuevas que viste antes que los perfiles Free',
    ]);
  });

  it('"Te llegó 30 min después": solo ya disponible y con demora real', () => {
    expect(lateText({ lateByMinutes: 30 })).toBe('Te llegó 30 min después que a los perfiles PRO.');
    expect(lateText({ lateByMinutes: 90 })).toBe('Te llegó 1 h 30 min después que a los perfiles PRO.');
    expect(lateText({ lateByMinutes: 30, delayed: true })).toBeNull();
    expect(lateText({ lateByMinutes: 0 })).toBeNull();
    expect(lateText(null)).toBeNull();
  });

  it('panel "Tu Resuelve PRO": lo que sumó, trabajos por encima de Free y el múltiplo del precio', () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: WorkPhotosStore,
          useValue: { loaded: signal(true), activeWorks: signal([{}, {}, {}]), load: () => Promise.resolve() },
        },
      ],
    });
    const fixture = TestBed.createComponent(ProValuePanel);
    fixture.componentRef.setInput(
      'data',
      month({
        plan: 'PRO',
        proPreview: null,
        exposure: {
          impressions: 40, featuredImpressions: 9, profileViews: 7,
          rates: { viewsPerImpression: null, requestsPerView: null, acceptance: null }, previous: null,
        },
        advanced: {
          acceptedQuotesValue: '240000.00', planPriceMultiple: 16,
          acceptance: { sent: 6, accepted: 5, rate: 83.3 },
          attribution: { earlyAccessOpportunities: 2, featuredAttributedRequests: 1, featuredAttributedAccepted: 0 },
          previous: null, weekly: [], byService: [], byZone: [],
        },
      }),
    );
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;
    const text = host.textContent!.replace(/\s+/g, ' ');
    expect(text).toContain('Lo que sumó PRO en octubre');
    expect(host.querySelectorAll('[data-testid="pro-value-fact"]').length).toBe(3);
    expect(host.querySelector('[data-testid="pro-value-works"]')!.textContent!.replace(/\s+/g, ' ')).toContain(
      '3 de 10trabajos publicados; en Free se ve 1', // número (bloque) + texto
    );
    expect(text).toContain('equivale a 16 veces el precio de PRO');
    expect(text).toContain('sin decir que PRO lo causó');
  });
});
