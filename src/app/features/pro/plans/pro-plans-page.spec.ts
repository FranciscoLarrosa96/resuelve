import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { API_URL } from '../../../core/api/api.config';
import { Entitlements, OwnPlan, PlansInfo, QuoteUsage } from '../../../core/models/pro-analytics';
import { EligibleIntroOffer, OwnProfessional } from '../../../core/models/pro-profile';
import { ProStore } from '../../../core/state/pro.store';
import { PRO_PILLARS, ProPlansPage } from './pro-plans-page';

const API = 'http://api.test/api/v1';
const ent = (pro: boolean): Entitlements => ({
  canSendUnlimitedQuotes: pro,
  canBeFeatured: pro,
  canUseAdvancedAnalytics: pro,
  canSeeExposureAnalytics: pro,
  canUseQuoteTemplates: false,
  portfolioPhotoLimit: pro ? 20 : 5,
});
const FREE: OwnPlan = { tier: 'FREE', expiresAt: null, entitlements: ent(false) };
const PRO: OwnPlan = {
  tier: 'PRO',
  expiresAt: '2026-12-31T02:59:59.000Z',
  entitlements: ent(true),
};
const INFO: PlansInfo = {
  free: { quoteLimit: 5 },
  pro: { monthlyPriceArs: 15000, selfServe: false, features: { quoteTemplates: false } },
};
const OFFER: EligibleIntroOffer = {
  eligible: true,
  offerCode: 'PRO_FIRST_MONTH_20',
  discountPercent: 20,
  appliesToCycles: 1,
  basePriceArs: 15000,
  discountedPriceArs: 12000,
  reserved: false,
};
const USAGE: QuoteUsage = {
  used: 2,
  limit: 5,
  remaining: 3,
  compatibleReceived: 6,
  blockedOpportunities: 0,
};

/** Perfil propio real mínimo: lo que lee la vista previa del destacado. */
const me = (plan: OwnPlan, patch: Partial<OwnProfessional> = {}) =>
  ({
    id: 'p1',
    displayName: 'Marta Gómez',
    firstName: 'Marta',
    lastName: 'Gómez',
    avatarUrl: null,
    headline: 'Electricista en Tandil',
    yearsExperience: 8,
    averageRating: null,
    reviewsCount: 0,
    availableToday: true,
    services: [{ id: 's1', name: 'Electricidad', slug: 'electricidad' }],
    coversEntireCity: false,
    zones: [{ id: 'z1', name: 'Centro', slug: 'centro' }],
    plan,
    quoteUsage: USAGE,
    proInterestAt: null,
    ...patch,
  }) as unknown as OwnProfessional;

function render(
  plan: OwnPlan | null,
  opts: { info?: PlansInfo | 'error'; profile?: OwnProfessional | null; quiero?: string } = {},
) {
  const ownProfile = signal<OwnProfessional | null>(
    opts.profile === undefined ? (plan ? me(plan) : null) : opts.profile,
  );
  const requestingPro = signal(false);
  const calls: string[] = [];
  const planSignal = signal(plan);
  const store = {
    plan: planSignal,
    ownProfile,
    hasPro: computed(() => (planSignal() ? planSignal()!.tier === 'PRO' : null)),
    requestingPro,
    introOffer: computed(() => {
      const o = ownProfile()?.proIntroOffer;
      return o?.eligible ? o : null;
    }),
    // Como el store real: una vez por sesión y superficie.
    trackOffer: (type: string, surface: string) => {
      if (!calls.includes(`${type}:${surface}`)) calls.push(`${type}:${surface}`);
    },
    requestPro: async () => {
      calls.push('requestPro');
      ownProfile.update((p) => {
        if (!p) return p;
        const o = p.proIntroOffer;
        return {
          ...p,
          proInterestAt: '2026-09-26T15:00:00.000Z',
          ...(o?.eligible ? { proIntroOffer: { ...o, reserved: true } } : {}),
        } as OwnProfessional;
      });
      return true;
    },
  };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_URL, useValue: API },
      { provide: ProStore, useValue: store },
    ],
  });
  const fixture = TestBed.createComponent(ProPlansPage);
  if (opts.quiero) fixture.componentRef.setInput('quiero', opts.quiero);
  const info = opts.info ?? INFO;
  const req = TestBed.inject(HttpTestingController).expectOne(`${API}/plans`);
  if (info === 'error') req.flush(null, { status: 500, statusText: 'Error' });
  else req.flush(info);
  fixture.detectChanges();
  const host = fixture.nativeElement as HTMLElement;
  const text = () => host.textContent!.replace(/\s+/g, ' ');
  const buttons = (label: string) =>
    [...host.querySelectorAll('button')].filter((b) => b.textContent!.trim() === label);
  return { fixture, host, text, buttons, calls };
}

describe('página Plan', () => {
  afterEach(() => {
    const http = TestBed.inject(HttpTestingController);
    http
      .match((req) => req.url.includes('/pro/acquisition/'))
      .forEach((req) => req.flush({ enabled: false, available: false }));
    http.verify();
  });

  it('en una mirada: $15.000 / mes y los tres motivos (sin límite, visibilidad, datos)', () => {
    const { host, text } = render(FREE);
    expect(host.querySelector('h1')!.textContent?.trim()).toBe(
      'Aprovechá todas las oportunidades.',
    );
    const price = host
      .querySelector('[data-testid="pro-price"]')!
      .textContent!.replace(/\s+/g, ' ')
      .trim();
    expect(price).toBe('$15.000 / mes por mes'); // "/ mes" visible; "por mes" para lectores de pantalla
    expect(text()).toContain(
      'Presupuestá sin límite, destacá tu perfil y entendé qué está funcionando en tu trabajo.',
    );
    expect(text()).toContain(
      'Para profesionales que ya usan Resuelve como una herramienta de todos los días.',
    );
    for (const p of ['Presupuestos sin límite', 'Más visibilidad', 'Datos para decidir'])
      expect(text()).toContain(p);
  });

  it('vende antes de comparar: hero → beneficios → ejemplo de Tu mes → destacado → comparación → valor → CTA final', () => {
    const { host } = render(FREE);
    const headings = [...host.querySelectorAll('h1, h2')].map((h) => h.textContent!.trim());
    expect(headings).toEqual([
      'Aprovechá todas las oportunidades.',
      'Respondé sin límite',
      'Entendé qué te genera Resuelve',
      'Destacate cuando te buscan',
      'Free y PRO',
      'PRO cuesta $15.000 por mes.',
      'No dejes oportunidades sin responder.',
    ]);
  });

  it('explica analytics sin inventar métricas ni resultados comerciales', () => {
    const { host } = render(FREE);
    const preview = host.querySelector('[aria-labelledby="analytics-preview-title"]')!;
    expect(preview.textContent).toContain('Ves tus conteos reales');
    expect(preview.querySelector('a')?.getAttribute('href')).toBe('/pro/estadisticas');
    expect(host.querySelector('[aria-labelledby="example-caption"]')).toBeNull();
    expect(preview.textContent).not.toMatch(/1.284|1.840.000|96%/);
  });

  it('la vista previa del destacado usa TU perfil real: sin rating inventado', () => {
    const { host } = render(FREE);
    const preview = host.querySelector('#destacado figure')!;
    const t = preview.textContent!;
    expect(t).toContain('Marta Gómez');
    expect(t).toContain('Electricidad · 8 años');
    expect(t).toContain('Sin reseñas todavía');
    expect(t).toContain('Disponible hoy');
    expect(t).toContain('Destacado');
    expect(t).toContain(
      'Así se vería tu perfil en un espacio destacado, con tus datos reales de hoy.',
    );
    expect(t).not.toContain('★');
  });

  it('tarjetas Free y PRO, y comparación unificada en una sola tabla', () => {
    const { host } = render(FREE);
    const free = host.querySelector('[aria-labelledby="free-title"]')!.textContent!;
    for (const item of [
      'Para empezar con Resuelve.',
      'Tu plan actual',
      '2 de 5',
    ])
      expect(free).toContain(item);
    const pro = host.querySelector('[aria-labelledby="pro-title"]')!.textContent!;
    for (const item of [
      '$15.000',
      'Quiero PRO',
    ])
      expect(pro).toContain(item);

    // El detalle vive solo en la tabla: las tarjetas no repiten las listas.
    const table = host.querySelector('table')!.textContent!;
    for (const row of [
      'Perfil profesional',
      'Oportunidades para responder',
      '5 incluidas',
      'Agenda',
      'Reseñas',
      'Perfil PRO',
      'Espacios destacados',
      'Apariciones y visitas',
      'Embudo de oportunidades',
      'Por servicio y barrio',
    ])
      expect(table).toContain(row);

    expect(host.querySelectorAll('table tbody')).toHaveLength(1);
    expect(host.textContent).not.toContain('Crecer en Resuelve');
    const cells = (label: string) => {
      const tr = [...host.querySelectorAll('tbody tr')].find(
        (r) => r.querySelector('th[scope="row"]')?.textContent!.trim() === label,
      )!;
      return [...tr.querySelectorAll('td')].map((td) => td.textContent!.trim());
    };
    expect(cells('Solicitudes')).toEqual(['Sin límite', 'Sin límite']);
    expect(cells('Oportunidades para responder')).toEqual(['5 incluidas', 'Sin límite']);
    expect(cells('Apariciones y visitas')).toEqual(['—No incluido', '✓Incluido']);
    expect(host.querySelector('table caption')!.textContent).toContain(
      'Comparación entre Resuelve Free y Resuelve PRO',
    );
  });

  it('Mi Plan conserva el acceso anticipado y una comparación unificada', () => {
    const { host } = render(FREE);
    expect(PRO_PILLARS.find((item) => item.title === 'Acceso anticipado')?.icon).toBe('clock');
    expect(host.querySelectorAll('table tbody')).toHaveLength(1);
  });

  it('prueba de valor honesta: no garantiza trabajos', () => {
    const { text } = render(FREE);
    expect(text()).toContain(
      'Para muchos oficios, una sola oportunidad adicional puede superar ese valor.',
    );
    expect(text()).toContain('Resuelve no garantiza trabajos');
    expect(text()).not.toMatch(
      /Premium|Maximizá|siguiente nivel|Desbloqueá el éxito|garantizamos|asegurad|a confirmar|consultar precio|días gratis|Probar PRO/i,
    );
  });

  it('"Quiero PRO" sin checkout: registra el pedido y lo dice, sin cambiar el plan', async () => {
    const { fixture, host, buttons, calls } = render(FREE);
    expect(buttons('Quiero PRO').length).toBe(3); // hero, tarjeta y cierre
    buttons('Quiero PRO')[0].click();
    fixture.detectChanges();
    const dialog = host.querySelector('dialog')!;
    expect(dialog.hasAttribute('open')).toBe(true);
    expect(dialog.textContent).toContain('La contratación online se está habilitando');
    expect(dialog.textContent).toContain('Registrarlo no te cobra nada ni cambia tu plan.');
    expect(dialog.textContent).toContain('$15.000');
    [...dialog.querySelectorAll('button')]
      .find((b) => b.textContent!.includes('Registrar mi pedido'))!
      .click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(calls).toEqual(['requestPro']);
    expect(dialog.textContent).toContain('Pedido registrado');
    expect(dialog.textContent).toContain(
      'Registramos tu pedido de Resuelve PRO el 26 de septiembre.',
    );
    expect(host.querySelector('[data-testid="plan-state"]')!.textContent).toContain(
      'Pediste PRO el 26 de septiembre.',
    );
  });

  it('"Pasarme a PRO" (?quiero=1) abre el pedido al entrar; a un PRO no', () => {
    const free = render(FREE, { quiero: '1' });
    expect(free.host.querySelector('dialog')!.hasAttribute('open')).toBe(true);
    TestBed.resetTestingModule();
    const pro = render(PRO, { quiero: '1' });
    expect(pro.host.querySelector('dialog')!.hasAttribute('open')).toBe(false);
  });

  it('PRO actual: su plan con vencimiento real, sin botones de venta', () => {
    const { host, buttons, text } = render(PRO);
    expect(host.querySelector('[data-testid="plan-state"]')!.textContent).toContain(
      'Tenés Resuelve PRO · hasta el 30 de diciembre de 2026',
    );
    expect(host.querySelector('[aria-labelledby="pro-title"]')!.textContent).toContain(
      'Tu plan actual · hasta el 30 de diciembre de 2026',
    );
    expect(host.querySelector('[aria-labelledby="free-title"]')!.textContent).not.toContain(
      'Tu plan actual',
    );
    expect(buttons('Quiero PRO')).toEqual([]);
    expect(text()).not.toContain('No dejes oportunidades sin responder.');
  });

  it('configurable: otro precio y otro cupo salen del backend', () => {
    const { text } = render(FREE, {
      info: { free: { quoteLimit: 25 }, pro: { ...INFO.pro, monthlyPriceArs: 21500 } },
    });
    expect(text()).toContain('$21.500');
    expect(text()).toContain('25 oportunidades incluidas');
    expect(text()).toContain('Free incluye 25 oportunidades para responder en total.');
  });

  it('sin plan cargado no afirma ninguno; si /plans falla no inventa un precio', () => {
    const { host, text } = render(null, { info: 'error' });
    expect(text()).not.toContain('Tu plan actual');
    expect(host.querySelector('[data-testid="pro-price"]')).toBeNull();
    expect(text()).not.toContain('$15.000');
  });

  // ---- Oferta de bienvenida (decidida por el backend en /pro/me) --------------
  it('elegible: "Oferta disponible" arriba de PRO, 20% OFF el primer mes y el precio normal a la vista', () => {
    const { host, text, calls } = render(FREE, { profile: me(FREE, { proIntroOffer: OFFER }) });
    const card = host.querySelector('[aria-labelledby="pro-title"]')!;
    const banner = card.querySelector('[data-testid="plan-offer"]')!;
    expect([...banner.querySelectorAll('span')].map((e) => e.textContent!.trim())).toEqual([
      'Oferta disponible',
      '20% OFF en tu primer mes',
    ]);
    expect(card.textContent).toContain('$12.000 el primer mes');
    expect(card.textContent).toContain('Luego $15.000 / mes');
    expect(host.querySelector('[data-testid="hero-offer"]')!.textContent).toContain(
      '20% OFF en tu primer mes',
    );
    expect(host.querySelector('[data-testid="pro-price"]')!.textContent).toContain('$15.000'); // el normal no se esconde
    // Sin urgencia inventada.
    expect(text()).not.toMatch(/Solo hoy|termina en|\d{2}:\d{2}:\d{2}|últimas horas/i);
    expect(calls).toEqual(['SHOWN:PLAN_PAGE']);
  });

  it('elegible: el pedido reserva la oferta (solo el código viaja; el resto lo decide el backend)', async () => {
    const { fixture, host, buttons, calls } = render(FREE, {
      profile: me(FREE, { proIntroOffer: OFFER }),
    });
    buttons('Quiero PRO')[0].click();
    fixture.detectChanges();
    const dialog = host.querySelector('dialog')!;
    expect(dialog.querySelector('[data-testid="want-offer"]')!.textContent).toContain(
      '$12.000 el primer mes',
    );
    expect(dialog.textContent).toContain('Luego $15.000 / mes');
    [...dialog.querySelectorAll('button')]
      .find((b) => b.textContent!.includes('Registrar mi pedido'))!
      .click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(calls).toEqual(['SHOWN:PLAN_PAGE', 'CLICKED:PLAN_PAGE', 'requestPro']);
    expect(dialog.textContent).toContain('Tu oferta queda reservada: 20% OFF en tu primer mes.');
    expect(host.querySelector('[data-testid="plan-state"]')!.textContent).toContain(
      'con 20% OFF en tu primer mes reservado',
    );
  });

  it('no elegible, ya usada o ya PRO: $15.000 / mes sin hablar de descuento', () => {
    for (const [plan, offer] of [
      [FREE, { eligible: false, reason: 'USAGE_BELOW_THRESHOLD' }],
      [FREE, { eligible: false, reason: 'ALREADY_REDEEMED' }],
      [PRO, { ...OFFER }],
    ] as const) {
      TestBed.resetTestingModule();
      const { host, text, calls } = render(plan, { profile: me(plan, { proIntroOffer: offer }) });
      expect(text()).not.toContain('OFF');
      expect(text()).not.toContain('Oferta');
      expect(host.querySelector('[data-testid="plan-offer"]')).toBeNull();
      expect(calls).toEqual([]);
      const acquisitionHttp = TestBed.inject(HttpTestingController);
      acquisitionHttp
        .match((req) => req.url.includes('/pro/acquisition/'))
        .forEach((req) => req.flush({ enabled: false, available: false }));
      acquisitionHttp.verify();
    }
  });
});
