import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { MonthAnalytics } from '../models/pro-analytics';
import { ProStore } from '../state/pro.store';
import { WorkPhotosStore } from '../state/work-photos.store';
import { ProValuePanel } from '../../features/pro/plans/pro-value-panel';
import { lateText } from '../../features/pro/pro-ui';
import { acceptedQuotesAmount, featuredValueFacts, proGainFacts, proObservedGroups, withoutProFacts } from './pro-value';

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
    ...patch,
  };
}

describe('valor de PRO con los números del profesional', () => {
  it('sin PRO: solo hechos que pasaron (nada inventado si no hubo demoras ni cupo)', () => {
    expect(withoutProFacts(month())).toEqual([]);
    const one = withoutProFacts(month({ proPreview: { ...month().proPreview!, delayedOpportunities: 1, delayedAfterOtherQuote: 1 } }));
    expect(one).toEqual([
      { value: '1', text: 'solicitud nueva te llegó después que a un perfil PRO que también la recibió; ya tenía un presupuesto de otro profesional.' },
    ]);
    // Con PRO no hay "sin PRO".
    expect(withoutProFacts(month({ proPreview: null }))).toEqual([]);
  });

  it('lo aceptado del mes: solo con aceptados, como dato y sin precio de PRO', () => {
    expect(acceptedQuotesAmount(month())).toBeNull();
    expect(acceptedQuotesAmount(month({ basic: { ...month().basic, acceptedQuotesValue: '90000.00' } }))).toBe('$ 90.000');
  });

  it('PRO: lo que sumó sin ceros ni atribuir causas', () => {
    const advanced = {
      acceptedQuotesValue: '240000.00',
      acceptance: { sent: 6, accepted: 5, rate: 83.3 },
      attribution: { earlyAccessOpportunities: 4, featuredAttributedRequests: 0, featuredAttributedAccepted: 0 },
      previous: null, weekly: [], byService: [], byZone: [],
    };
    const pro = month({ plan: 'PRO', proPreview: null, advanced });
    // Sin ceros: lo que no pasó no se muestra como logro.
    expect(proGainFacts(pro).map((f) => `${f.value} ${f.text}`)).toEqual([
      '4 solicitudes nuevas que viste antes que los perfiles Free',
    ]);
  });

  it('Destacados: no atribuye las visitas ni los toques generales, aunque sean positivos', () => {
    const data = month({ plan: 'PRO', exposure: {
      impressions: 70, featuredImpressions: 12, profileViews: 9, whatsappClicks: 4, phoneClicks: 2,
      rates: { viewsPerImpression: null, requestsPerView: null, acceptance: null }, previous: null,
    } });
    expect(featuredValueFacts(data)).toEqual([{ value: '12', text: 'apariciones en Destacados' }]);
    expect(featuredValueFacts(month())).toEqual([]);
    expect(featuredValueFacts(month({ plan: 'PRO', exposure: null }))).toEqual([]);
  });

  it('Destacados: conserva un aceptado de otro mes aunque no haya solicitudes nuevas en este', () => {
    const data = month({ plan: 'PRO_PLUS', advanced: {
      acceptedQuotesValue: '0', acceptance: { sent: 0, accepted: 0, rate: null },
      attribution: { earlyAccessOpportunities: 0, featuredAttributedRequests: 0, featuredAttributedAccepted: 1 },
      previous: null, weekly: [], byService: [], byZone: [],
    } });
    expect(featuredValueFacts(data)).toEqual([{
      value: '1', text: 'presupuesto aceptado de un pedido originado en Destacados',
    }]);
    expect(proGainFacts(data)).toEqual(featuredValueFacts(data));
  });

  it('"Te llegó 30 min después": solo ya disponible y con demora real', () => {
    expect(lateText({ lateByMinutes: 30 })).toBe('Te llegó 30 min después que a un perfil PRO que también la recibió.');
    expect(lateText({ lateByMinutes: 90 })).toBe('Te llegó 1 h 30 min después que a un perfil PRO que también la recibió.');
    expect(lateText({ lateByMinutes: 30, delayed: true })).toBeNull();
    expect(lateText({ lateByMinutes: 0 })).toBeNull();
    expect(lateText(null)).toBeNull();
  });

  const EXPOSURE = (patch: Partial<NonNullable<MonthAnalytics['exposure']>> = {}): NonNullable<MonthAnalytics['exposure']> => ({
    impressions: 0, featuredImpressions: 0, profileViews: 0,
    rates: { viewsPerImpression: null, requestsPerView: null, acceptance: null }, previous: null, ...patch,
  });

  it('PRO: interés (toques incluidos) y trabajo por Resuelve van en grupos separados, sin ceros', () => {
    const groups = proObservedGroups(
      month({
        plan: 'PRO',
        exposure: EXPOSURE({ impressions: 40, profileViews: 7, whatsappClicks: 3, phoneClicks: 0 }),
        basic: { ...month().basic, quotesSent: 6, quotesAccepted: 1, completedJobs: 0 },
      }),
    );
    expect(groups.map((g) => g.key)).toEqual(['interest', 'work']);
    expect(groups[0].facts.map((f) => `${f.value} ${f.text}`)).toEqual([
      '40 apariciones en búsquedas',
      '7 visitas a tu perfil',
      '3 toques en WhatsApp',
    ]);
    // Un toque no es una conversación ni un trabajo, y se dice.
    expect(groups[0].note).toContain('no es una conversación');
    expect(groups[0].note).toContain('una conversación no es un trabajo');
    expect(groups[1].facts.map((f) => `${f.value} ${f.text}`)).toEqual([
      '6 presupuestos enviados',
      '1 presupuesto aceptado por un cliente',
    ]);
    expect(groups[1].note).toContain('aceptó por Resuelve');
    expect(proObservedGroups(month({ plan: 'PRO', exposure: EXPOSURE() }))).toEqual([]);
  });

  it('panel PRO: sin atribuirle los resultados al plan; con poca actividad, acciones sobre su perfil real', () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: WorkPhotosStore, useValue: { loaded: signal(true), activeWorks: signal([{}]), load: () => Promise.resolve() } },
        { provide: ProStore, useValue: { ownProfile: signal({ featured: { reason: 'NO_COVERAGE' }, avatarUrl: null, coverage: [] }) } },
      ],
    });
    const fixture = TestBed.createComponent(ProValuePanel);
    fixture.componentRef.setInput('data', month({ plan: 'PRO_PLUS', exposure: EXPOSURE(), proPreview: null }));
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;
    const text = host.textContent!.replace(/\s+/g, ' ');
    expect(text).toContain('Tu mes con Resuelve PRO Plus');
    expect(text).toContain('Todavía no hay actividad registrada en tu perfil este mes.');
    expect(host.querySelector('[data-testid="pro-value-disclaimer"]')!.textContent).toContain('No decimos que Resuelve PRO Plus los causó');
    const actions = host.querySelector('[data-testid="pro-value-actions"]')!;
    expect(actions.textContent).toContain('Falta dónde trabajás');
    expect(actions.querySelector('a[href="/pro/perfil"]')).not.toBeNull();
    expect(text).not.toMatch(/gracias a PRO|por tener PRO|PRO te consiguió|garantiz/i);
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
        entitlements: { ...month().entitlements, portfolioWorkLimit: 10 },
        proPreview: null,
        exposure: {
          impressions: 40, featuredImpressions: 9, profileViews: 7,
          rates: { viewsPerImpression: null, requestsPerView: null, acceptance: null }, previous: null,
        },
        advanced: {
          acceptedQuotesValue: '240000.00',
          acceptance: { sent: 6, accepted: 5, rate: 83.3 },
          attribution: { earlyAccessOpportunities: 2, featuredAttributedRequests: 1, featuredAttributedAccepted: 0 },
          previous: null, weekly: [], byService: [], byZone: [],
        },
      }),
    );
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;
    const text = host.textContent!.replace(/\s+/g, ' ');
    expect(text).toContain('Lo que pasó en tu perfil en octubre');
    expect(text).toContain('Lo que registramos de tu plan');
    expect(text).toContain('Tu presencia en Destacados');
    expect(text).toContain('Eso no significa que sean cero.');
    expect(text).toContain('no forman una tasa de conversión');
    expect(host.querySelectorAll('[data-testid="featured-value-fact"]').length).toBe(2);
    expect(host.querySelector('[data-testid="pro-value-actions"]')).toBeNull(); // con actividad, no se le pide nada
    expect(host.querySelectorAll('[data-testid="pro-value-plan"] [data-testid="pro-value-fact"]').length).toBe(1);
    expect(host.querySelectorAll('[data-testid="pro-value-interest"] [data-testid="pro-value-fact"]').length).toBe(2);
    expect(host.querySelector('[data-testid="pro-value-works"]')!.textContent!.replace(/\s+/g, ' ')).toContain(
      '3 de 10trabajos publicados; en Free se ve 1', // número (bloque) + texto
    );
    expect(text).not.toMatch(/equivale|veces el precio/);
    expect(text).not.toContain('sin decir que PRO lo causó'); // se dice una vez, en Tu mes
  });

  it('PRO Plus con 20 trabajos: el máximo sale de sus entitlements ("20 de 30"), nunca 10', () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: WorkPhotosStore,
          useValue: { loaded: signal(true), activeWorks: signal(Array.from({ length: 20 }, () => ({}))), load: () => Promise.resolve() },
        },
      ],
    });
    const fixture = TestBed.createComponent(ProValuePanel);
    fixture.componentRef.setInput(
      'data',
      month({
        plan: 'PRO_PLUS',
        entitlements: { ...month().entitlements, portfolioWorkLimit: 30 },
        proPreview: null,
        exposure: { impressions: 40, featuredImpressions: 0, profileViews: 7, rates: { viewsPerImpression: null, requestsPerView: null, acceptance: null }, previous: null },
      }),
    );
    fixture.detectChanges();
    const works = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="pro-value-works"]')!.textContent!.replace(/\s+/g, ' ');
    expect(works).toContain('20 de 30');
    expect(works).not.toContain('de 10');
  });
});
