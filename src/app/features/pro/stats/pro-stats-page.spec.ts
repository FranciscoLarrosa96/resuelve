import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { API_URL } from '../../../core/api/api.config';
import { AdvancedAnalytics, MonthAnalytics } from '../../../core/models/pro-analytics';
import { MONTH_ERROR, ProStatsPage } from './pro-stats-page';

const API = 'http://api.test/api/v1';
const URL = `${API}/pro/analytics/month`;
const MOCKS = ['487.000', '96%', '62%', 'Rosa', 'Cómo te encuentran', 'Búsqueda', 'Urgencias', 'Perfil compartido', 'Visualizaciones'];
const zero = { requestsReceived: 0, quotesSent: 0, quotesAccepted: 0, scheduledJobs: 0, completedJobs: 0, reviewsReceived: 0 };

function month(patch: Partial<MonthAnalytics> = {}): MonthAnalytics {
  return {
    period: { year: 2026, month: 9, start: '2026-09-01T03:00:00Z', end: '2026-10-01T03:00:00Z', isCurrent: true, earliest: { year: 2026, month: 8 } },
    plan: 'FREE',
    entitlements: { canSendUnlimitedQuotes: false, canBeFeatured: false, canUseAdvancedAnalytics: false, canSeeExposureAnalytics: false, canUseQuoteTemplates: false, portfolioPhotoLimit: 5 },
    basic: { requestsReceived: 12, quotesSent: 8, quotesAccepted: 5, scheduledJobs: 5, completedJobs: 1, reviewsReceived: 1, currentRating: 4.8, reviewCount: 23 },
    recentReviews: [{ id: 'r1', rating: 5, comment: 'Impecable y puntual.', reviewerDisplayName: 'Lucía', createdAt: '2026-09-10T12:00:00Z' }],
    advanced: null,
    exposure: null,
    ...patch,
  };
}

const ADVANCED: AdvancedAnalytics = {
  acceptedQuotesValue: '1840000.00',
  acceptance: { sent: 8, accepted: 5, rate: 62.5 },
  previous: { year: 2026, month: 8, ...zero, requestsReceived: 9, quotesSent: 8, completedJobs: 3, acceptedQuotesValue: '900000.00' },
  weekly: [
    { fromDay: 1, toDay: 7, requestsReceived: 2, quotesSent: 1, completedJobs: 0 },
    { fromDay: 8, toDay: 14, requestsReceived: 6, quotesSent: 4, completedJobs: 1 },
    { fromDay: 15, toDay: 21, requestsReceived: 4, quotesSent: 3, completedJobs: 0 },
    { fromDay: 22, toDay: 28, requestsReceived: 0, quotesSent: 0, completedJobs: 0 },
    { fromDay: 29, toDay: 30, requestsReceived: 0, quotesSent: 0, completedJobs: 0 },
  ],
  byService: [
    { id: 's1', name: 'Electricidad', requestsReceived: 9, quotesSent: 6, quotesAccepted: 4 },
    { id: 's2', name: 'Gas', requestsReceived: 3, quotesSent: 2, quotesAccepted: 1 },
  ],
  byZone: [
    { id: 'z1', name: 'Centro', requestsReceived: 7, quotesSent: 0, quotesAccepted: 0 },
    { id: 'z2', name: 'Villa Italia', requestsReceived: 5, quotesSent: 0, quotesAccepted: 0 },
  ],
};

function setup() {
  TestBed.configureTestingModule({
    providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), { provide: API_URL, useValue: API }],
  });
  const fixture = TestBed.createComponent(ProStatsPage);
  const http = TestBed.inject(HttpTestingController);
  const host = fixture.nativeElement as HTMLElement;
  const respond = (body: MonthAnalytics) => {
    http.expectOne((r) => r.url === URL).flush(body);
    fixture.detectChanges();
  };
  fixture.detectChanges();
  return { fixture, http, host, respond };
}

describe('Tu mes', () => {
  afterEach(() => { const http = TestBed.inject(HttpTestingController); http.match(req => req.url.includes('/pro/acquisition/')).forEach(req => req.flush({ enabled: false, available: false })); http.verify(); });

  it('Free: métricas básicas reales, reseña del mes y aviso PRO; sin análisis avanzado ni mocks', () => {
    const { host, respond } = setup();
    expect(host.textContent).toContain('Cargando tu mes…');
    respond(month());
    const text = host.textContent!;
    expect(host.querySelector('h1')!.textContent).toContain('Tu mes · septiembre');
    expect(text).toContain('Trabajos realizados');
    expect(text).toContain('5 trabajos agendados');
    expect(text).toContain('Solicitudes recibidas');
    expect(text).toContain('Presupuestos aceptados');
    expect(text).toContain('4,8');
    expect(text).toContain('23 reseñas en total · 1 nueva este mes');
    expect(text).toContain('“Impecable y puntual.”');
    expect(text).toContain('Tu mes básico');
    expect(text).toContain('Con PRO también podés ver');
    expect(text).toContain('Cuántas veces aparece tu perfil');
    // El teaser de barrios se sacó (el análisis por barrio real sigue dentro de Tu mes PRO).
    expect(text).not.toContain('Qué barrios te generan más oportunidades');
    expect(text).toContain('De la solicitud al trabajo'); // recorrido básico con conteos reales
    expect(text).not.toContain('Tu presencia en Resuelve');
    expect(text).not.toContain('Apariciones en búsquedas');
    expect(host.querySelectorAll('a[href="/pro/plan"]').length).toBe(1); // un solo CTA a PRO
    expect(host.querySelector('a[href="/pro/plan"]')!.textContent).toContain('Desbloquear análisis PRO');
    expect(host.querySelector('[class*="blur"]')).toBeNull(); // nada de gráficos bloqueados
    expect(text).not.toContain('Valor de presupuestos aceptados');
    expect(text).not.toContain('Tasa de aceptación');
    expect(text).not.toContain('vs. agosto');
    for (const mock of MOCKS) expect(text).not.toContain(mock);
  });

  it('PRO: valor aceptado (sin llamarlo ingresos), tasa, comparación absoluta, semanas, servicios, barrios e insights', () => {
    const { host, respond, fixture } = setup();
    respond(month({ plan: 'PRO', entitlements: { canSendUnlimitedQuotes: true, canBeFeatured: true, canUseAdvancedAnalytics: true, canSeeExposureAnalytics: true, canUseQuoteTemplates: false, portfolioPhotoLimit: 20 }, advanced: ADVANCED }));
    const text = host.textContent!;
    expect(text).toContain('Valor de presupuestos aceptados');
    expect(text).toContain('$ 1.840.000');
    expect(text).toContain('No representa necesariamente lo que finalmente cobraste');
    expect(text).not.toMatch(/ingresos|facturación|ganancias/i);
    expect(text).toContain('62,5 %');
    expect(text).toContain('5 de 8 presupuestos enviados este mes.');
    expect(text).toContain('+3 vs. agosto'); // solicitudes 12 vs 9
    expect(text).toContain('2 menos que agosto'); // trabajos 1 vs 3
    expect(text).not.toContain('%  vs.');
    expect(text).toContain('Electricidad fue tu servicio con más solicitudes en septiembre.');
    expect(text).toContain('Centro');
    expect(text).toContain('7 solicitudes');
    expect(text).not.toContain('¿Querés saber');
    // Gráfico: una métrica seleccionable, con tabla accesible.
    const caption = () => host.querySelector('table.sr-only caption')!.textContent;
    expect(caption()).toContain('Solicitudes por semana');
    (host.querySelectorAll('[role="radio"]')[2] as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(caption()).toContain('Trabajos realizados por semana');
    expect(host.querySelector('[role="radio"][aria-checked="true"]')!.textContent).toContain('Trabajos realizados');
  });

  it('PRO muestra respuesta, acceso anticipado y referencia agregada solo con datos reales', () => {
    const { host, respond } = setup();
    respond(month({ plan: 'PRO', advanced: {
      ...ADVANCED,
      planPriceMultiple: 2.5,
      response: { opportunities: 12, answered: 10, rate: 83.3, medianMinutes: 18,
        previous: { opportunities: 8, answered: 6, rate: 75, medianMinutes: 27 } },
      attribution: { earlyAccessOpportunities: 4, featuredAttributedRequests: 2, featuredAttributedAccepted: 1 },
      benchmark: { available: true, periodDays: 90, serviceName: 'Electricidad', cohortSize: 9,
        medianResponseMinutes: 27, responseRate: 74, acceptanceRate: 50 },
    } }));
    const text = host.textContent!;
    expect(text).toContain('equivalen a 2.5× el valor mensual de PRO');
    expect(text).toContain('18 min');
    expect(text).toContain('83,3 %');
    expect(text).toContain('Acceso anticipado');
    expect(text).toContain('9 profesionales activos comparables');
    expect(text).not.toContain('ROI');
  });

  it('sin cohorte suficiente oculta las cifras de referencia', () => {
    const { host, respond } = setup();
    respond(month({ plan: 'PRO', advanced: { ...ADVANCED, benchmark: { available: false, periodDays: 90 } } }));
    expect(host.textContent).toContain('Todavía no hay suficiente actividad comparable');
    expect(host.textContent).not.toContain('profesionales activos comparables');
  });

  it('PRO: "Tu presencia en Resuelve" con apariciones, visitas, embudo real y tasas (sin "personas únicas" ni ROI)', () => {
    const { host, respond } = setup();
    respond(month({
      plan: 'PRO',
      basic: { ...zero, requestsReceived: 18, quotesSent: 12, quotesAccepted: 5, completedJobs: 3, currentRating: null, reviewCount: 0 },
      recentReviews: [],
      advanced: { ...ADVANCED, previous: null },
      exposure: {
        impressions: 1284,
        featuredImpressions: 310,
        profileViews: 87,
        rates: { viewsPerImpression: 6.8, requestsPerView: 20.7, acceptance: 41.7 },
        previous: { impressions: 1000, profileViews: 90 },
      },
    }));
    const section = host.querySelector('[aria-labelledby="presence-title"]')!;
    const text = section.textContent!.replace(/\s+/g, ' ');
    expect(text).toContain('Tu presencia en Resuelve');
    expect(text).toContain('1.284 apariciones en búsquedas');
    expect(text).toContain('310 en espacios destacados');
    expect(text).toContain('+284 vs. agosto');
    expect(text).toContain('3 menos que agosto');
    const steps = [...section.querySelectorAll('ol[aria-label="Del resultado al trabajo"] li')].map((li) => li.textContent!.replace(/\s+/g, ' ').trim());
    expect(steps).toEqual([
      'Visitas al perfil · 3 menos que agosto 87 6,8 % de las apariciones',
      'Solicitudes recibidas 18 20,7 % de las visitas',
      'Presupuestos enviados 12',
      'Presupuestos aceptados 5 41,7 % de tus presupuestos',
      'Trabajos realizados 3',
    ]);
    // Valor aceptado y tasa acompañan a la presencia.
    expect(text).toContain('Valor de presupuestos aceptados');
    expect(text).toContain('$ 1.840.000');
    expect(text).toContain('No son personas únicas.');
    expect(host.querySelector('app-pro-badge')).not.toBeNull();
    expect(host.textContent).not.toMatch(/ROI|retorno|\d+x\b/i);
    expect(host.textContent).not.toContain('Con PRO también podés ver'); // sin upsell para PRO
  });

  it('PRO: insight de visitas solo si subieron contra el mes anterior', () => {
    const { host, respond } = setup();
    respond(month({
      plan: 'PRO',
      advanced: ADVANCED,
      exposure: { impressions: 900, featuredImpressions: 0, profileViews: 60, rates: { viewsPerImpression: 6.7, requestsPerView: 20, acceptance: 62.5 }, previous: { impressions: 800, profileViews: 48 } },
    }));
    expect(host.textContent).toContain('Tu perfil recibió 12 visitas más que en agosto.');
  });

  it('PRO sin apariciones: tasas sin base no se muestran (nunca 0 % sin base)', () => {
    const { host, respond } = setup();
    respond(month({
      plan: 'PRO',
      advanced: ADVANCED,
      exposure: { impressions: 0, featuredImpressions: 0, profileViews: 0, rates: { viewsPerImpression: null, requestsPerView: null, acceptance: 62.5 }, previous: null },
    }));
    const text = host.querySelector('[aria-labelledby="presence-title"]')!.textContent!;
    expect(text).not.toContain('de las apariciones');
    expect(text).not.toContain('de las visitas');
    expect(text).toContain('62,5 % de tus presupuestos');
    expect(text).not.toContain(' 0 %');
  });

  it('PRO sin enviados y sin mes anterior con actividad: "—" en la tasa y sin comparación', () => {
    const { host, respond } = setup();
    respond(month({
      plan: 'PRO',
      basic: { ...zero, requestsReceived: 1, currentRating: null, reviewCount: 0 },
      recentReviews: [],
      advanced: { ...ADVANCED, acceptance: { sent: 0, accepted: 0, rate: null }, previous: null, byService: [], byZone: [] },
    }));
    const text = host.textContent!;
    expect(text).toContain('—');
    expect(text).not.toContain('0 %');
    expect(text).not.toContain('vs.');
    expect(text).toContain('Sin reseñas todavía');
    expect(text).toContain('Todavía no recibiste reseñas este mes.');
  });

  it('mes sin actividad: "Tu mes recién empieza" con CTA a solicitudes, nunca ejemplos', () => {
    const { host, respond } = setup();
    respond(month({ basic: { ...zero, currentRating: null, reviewCount: 0 }, recentReviews: [] }));
    expect(host.textContent).toContain('Tu mes recién empieza');
    expect(host.querySelector('a[href="/pro/solicitudes"]')!.textContent).toContain('Ver solicitudes');
    for (const mock of MOCKS) expect(host.textContent).not.toContain(mock);
  });

  it('error: mensaje y reintento (sin datos de respaldo)', () => {
    const { host, http, fixture, respond } = setup();
    http.expectOne(URL).flush(null, { status: 500, statusText: 'Error' });
    fixture.detectChanges();
    expect(host.querySelector('[role="alert"]')!.textContent).toContain(MONTH_ERROR);
    (host.querySelector('[role="alert"] button') as HTMLButtonElement).click();
    respond(month());
    expect(host.textContent).toContain('Trabajos realizados');
  });

  it('navega al mes anterior hasta el primero con perfil', () => {
    const { host, respond, http, fixture } = setup();
    respond(month());
    const prev = [...host.querySelectorAll('nav button')][0] as HTMLButtonElement;
    expect(prev.textContent).toContain('agosto');
    prev.click();
    const req = http.expectOne((r) => r.url === URL);
    expect(req.request.params.get('year')).toBe('2026');
    expect(req.request.params.get('month')).toBe('8');
    req.flush(month({ period: { ...month().period, month: 8, isCurrent: false } }));
    fixture.detectChanges();
    expect(host.querySelector('h1')!.textContent).toContain('Tu mes · agosto');
    const [before, after] = [...host.querySelectorAll('nav button')] as HTMLButtonElement[];
    expect(before.disabled).toBe(true);
    expect(after.textContent).toContain('septiembre');
    expect(after.disabled).toBe(false);
  });

  it('mes actual: "Siguiente" presente pero deshabilitado, junto a "Anterior"', () => {
    const { host, respond } = setup();
    respond(month());
    const buttons = [...host.querySelectorAll('[data-testid="month-nav"] button')] as HTMLButtonElement[];
    expect(buttons).toHaveLength(2);
    expect(buttons[1].textContent).toContain('Siguiente');
    expect(buttons[1].disabled).toBe(true);
  });

  it('perfil con un solo mes de historial: sin navegación (ningún "Anterior" colgado)', () => {
    const { host, respond } = setup();
    respond(month({ period: { ...month().period, earliest: { year: 2026, month: 9 } } }));
    expect(host.querySelector('[data-testid="month-nav"]')).toBeNull();
    expect(host.textContent).not.toContain('Anterior');
  });
});
