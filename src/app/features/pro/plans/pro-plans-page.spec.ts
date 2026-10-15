import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { API_URL } from '../../../core/api/api.config';
import { flushMonth, flushNoWorks } from '../../../core/api/pro-tools.testing';
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
  portfolioWorkLimit: pro ? 10 : 1,
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
    proTrial: computed(() => ownProfile()?.proTrial ?? null),
    trialSummary: signal(null),
    loadTrialSummary: async () => null,
    startingTrial: signal(false),
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
      .match((req) => (req.url.includes('/pro/acquisition/') || req.url.endsWith('/billing/transfer')))
      .forEach((req) => req.flush({ enabled: false, available: false }));
    flushMonth(http); http.verify();
  });

  it('en una mirada: "Hacé que más clientes te encuentren", $15.000 / mes y tres beneficios con la visibilidad primero', () => {
    const { host, text, buttons } = render(FREE);
    expect(host.querySelector('h1')!.textContent?.trim()).toBe(
      'Hacé que más clientes te encuentren.',
    );
    const price = host
      .querySelector('[data-testid="pro-price"]')!
      .textContent!.replace(/\s+/g, ' ')
      .trim();
    expect(price).toBe('$15.000 / mes por mes'); // "/ mes" visible; "por mes" para lectores de pantalla
    expect(text()).toContain(
      'Destacá tus servicios, mostrá tus mejores trabajos y enterate antes de las solicitudes nuevas.',
    );
    expect(PRO_PILLARS.map((p) => p.title)).toEqual([
      'Destacate cuando te buscan',
      'Enterate antes y respondé sin límite',
      'Mostrá más y medí el interés',
    ]);
    for (const p of PRO_PILLARS) expect(text()).toContain(p.title);
    // Solo ventajas de PRO: el contacto directo no es un beneficio (es de los dos planes) y se dice aparte.
    for (const p of PRO_PILLARS) expect(p.title).not.toMatch(/contacto|WhatsApp|llamad/i);
    expect(PRO_PILLARS[2].text).toBe('Hasta 10 trabajos con 5 fotos cada uno (Free: 1), portada y Tu mes completo.');
    expect(host.querySelector('[data-testid="pro-free-note"]')!.textContent!.trim()).toBe(
      'Tu perfil, WhatsApp, llamadas, solicitudes y reseñas siguen siendo gratis en Free.',
    );
    // El CTA principal usa el flujo real (sin billing: el pedido) y el secundario lleva a comparar.
    expect(buttons('Quiero Resuelve PRO').length).toBeGreaterThan(0);
    expect(host.querySelector('a[href="/pro/plan#comparacion"]')!.textContent!.trim()).toBe('Comparar planes');
  });

  it('más corta: sus números → lo que suma PRO → comparación → contratar (sin vender Free dentro de PRO)', () => {
    const { host } = render(FREE);
    const headings = [...host.querySelectorAll('h1, h2')].map((h) => h.textContent!.trim());
    expect(headings).toEqual([
      'Hacé que más clientes te encuentren.',
      'Lo que suma PRO',
      'Gratis', 'PRO', 'PRO Plus',
      'Gratis, PRO y PRO Plus',
      'Destacate cuando buscan profesionales en tu ciudad.',
    ]);
    expect(host.querySelector('[data-testid="free-included"]')).toBeNull();
  });

  it('recibir no es responder: nunca promete solicitudes ni respuestas "sin límite" a Free', () => {
    const { host, text } = render(FREE);
    expect(host.querySelector('[data-testid="quotes-text"]')!.textContent!.replace(/\s+/g, ' ')).toContain(
      'Usaste 2 de 5 oportunidades Free. Con PRO respondés sin límite y las solicitudes nuevas te llegan antes.',
    );
    expect(text()).not.toContain('Solicitudes por Resuelve, sin límite');
    expect(text()).not.toContain('nunca tiene límite');
  });

  it('la vista previa del destacado usa TU perfil real y, sin trabajos, fotos rotuladas "Ejemplo"', async () => {
    const { host, fixture } = render(FREE);
    const http = TestBed.inject(HttpTestingController);
    flushNoWorks(http);
    await fixture.whenStable();
    fixture.detectChanges();
    const preview = host.querySelector('[data-testid="featured-preview"]')!;
    const t = preview.textContent!;
    expect(t).toContain('Marta Gómez');
    expect(t).toContain('Electricidad · 8 años');
    expect(t).toContain('Sin reseñas todavía');
    expect(t).toContain('Atiende urgencias');
    expect(t).toContain('Destacado');
    expect(t).toContain('Así se vería tu perfil en un espacio destacado, con tus datos reales de hoy.');
    expect(t).toContain('Las fotos son de ejemplo');
    const covers = [...preview.querySelectorAll<HTMLImageElement>('[data-testid="work-covers"] img')];
    expect(covers.map((i) => i.getAttribute('src'))).toEqual([
      '/portfolio-demo/electrica-1.webp',
      '/portfolio-demo/cocina-1.webp',
      '/portfolio-demo/ducha-1.webp',
    ]);
    expect(preview.querySelectorAll('[data-testid="work-covers"] li span')).toHaveLength(3);
    expect([...preview.querySelectorAll('[data-testid="work-covers"] li span')].every((s) => s.textContent!.trim() === 'Ejemplo')).toBe(true);
    expect(t).not.toContain('★');
  });

  it('comparación unificada en una sola tabla (lo de los dos planes con ✓ en Free)', () => {
    const { host } = render(FREE);
    const table = host.querySelector('table')!.textContent!;
    for (const row of [
      'Perfil público en las búsquedas de tus localidades',
      'Contacto por WhatsApp y llamadas',
      'Presupuestos a solicitudes nuevas',
      '5 en total',
      'Agenda',
      'Compartir tu perfil y pedir reseñas',
      'Identificación PRO en tu perfil',
      'Espacios destacados en búsquedas',
      'Visitas al perfil y apariciones',
      'Toques en WhatsApp y Llamar',
      'Embudo, servicios y barrios',
    ])
      expect(table).toContain(row);

    expect(host.querySelectorAll('table tbody')).toHaveLength(1);
    const cells = (label: string) => {
      const tr = [...host.querySelectorAll('tbody tr')].find(
        (r) => r.querySelector('th[scope="row"]')?.textContent!.trim() === label,
      )!;
      return [...tr.querySelectorAll('td')].map((td) => td.textContent!.trim());
    };
    for (const label of [
      'Perfil público en las búsquedas de tus localidades',
      'Contacto por WhatsApp y llamadas',
      'Atender urgencias',
      'Compartir tu perfil y pedir reseñas',
    ])
      expect(cells(label)).toEqual(['✓Incluido', '✓Incluido', '✓Incluido']);
    expect(cells('Recibir solicitudes por Resuelve')).toEqual(['✓Incluido', '✓Incluido', '✓Incluido']);
    expect(cells('Trabajos realizados (hasta 5 fotos cada uno)')).toEqual(['1', 'Hasta 10', 'Hasta 30']);
    expect(cells('Presupuestos a solicitudes nuevas')).toEqual(['5 en total', 'Sin límite', 'Sin límite']);
    expect(cells('Presupuestos a clientes que te eligen')).toEqual(['Sin límite', 'Sin límite', 'Sin límite']);
    expect(cells('Cuándo ves las solicitudes nuevas')).toEqual(['Más tarde', 'Antes', 'Antes']);
    expect(cells('Visitas al perfil y apariciones')).toEqual(['Totales del mes', 'Con detalle', 'Con detalle']);
    expect(cells('Tus presupuestos con PRO y fotos de tus trabajos')).toEqual(['—No incluido', '✓Incluido', '✓Incluido']);
    expect(host.querySelector('[data-testid="compare-note"]')!.textContent).toContain(
      'En Free respondés sin límite hasta conseguir tu primer cliente; después, 5',
    );
    expect(host.querySelector('table caption')!.textContent).toContain(
      'Comparación entre Resuelve Gratis, PRO y PRO Plus',
    );
  });

  describe('transferencia: dónde va el panel', () => {
    const transfer = (patch: Record<string, unknown>) => ({
      available: true,
      account: { holder: 'Francisco Larrosa', alias: 'resuelve.pro', cbu: null, bank: null, cuit: null },
      blocked: null,
      options: [
        { months: 1, days: 30, amountArs: 15000, basePriceArs: 15000, discountedFirstMonthArs: null, offerCode: null },
      ],
      pending: null,
      last: null,
      recentOutcome: null,
      proUntil: null,
      withdrawal: null,
      refundPending: null,
      proofUploads: false,
      ...patch,
    });
    const place = async (patch: Record<string, unknown>) => {
      const ctx = render(FREE);
      TestBed.inject(HttpTestingController).expectOne(`${API}/billing/transfer`).flush(transfer(patch));
      await new Promise((r) => setTimeout(r));
      ctx.fixture.detectChanges();
      const panel = ctx.host.querySelector('[data-testid="transfer-panel"]')!;
      const featured = ctx.host.querySelector('#destacado')!;
      const compare = ctx.host.querySelector('#comparacion')!;
      return {
        ...ctx,
        panel,
        beforeFeatured: !!(panel.compareDocumentPosition(featured) & Node.DOCUMENT_POSITION_FOLLOWING),
        afterCompare: !!(panel.compareDocumentPosition(compare) & Node.DOCUMENT_POSITION_PRECEDING),
      };
    };

    it('sin nada en curso: en "Contratar", después de la comparación', async () => {
      const r = await place({});
      expect(r.afterCompare).toBe(true);
      expect(r.beforeFeatured).toBe(false);
    });

    it('con un pago por hacer: arriba, antes de los beneficios (es una tarea pendiente)', async () => {
      const r = await place({
        pending: {
          id: 't1', reference: 'RES-7F3K9Q', status: 'AWAITING_PROOF', months: 1, amountArs: 15000,
          basePriceArs: 15000, offerCode: null, proofUploaded: false, rejectionReason: null,
          periodStart: null, periodEnd: null, reviewedAt: null, withdrawnAt: null, refundedAt: null,
          createdAt: '2026-10-09T12:00:00.000Z',
        },
      });
      expect(r.beforeFeatured).toBe(true);
      expect(r.panel.textContent).toContain('RES-7F3K9Q');
    });
  });

  it('prueba de valor honesta: no garantiza trabajos', () => {
    const { text } = render(FREE);
    expect(text()).toContain('Resuelve no garantiza contactos ni trabajos');
    expect(text()).not.toMatch(
      /Premium|Maximizá|siguiente nivel|Desbloqueá|todo tu potencial|garantizamos|garantizados|asegurad|siempre primero|multiplicá|a confirmar|consultar precio|días gratis|Probar PRO/i,
    );
  });

  it('"Quiero Resuelve PRO" sin checkout: registra el pedido y lo dice, sin cambiar el plan', async () => {
    const { fixture, host, buttons, calls } = render(FREE);
    expect(buttons('Quiero Resuelve PRO').length).toBe(2); // hero y Contratar
    buttons('Quiero Resuelve PRO')[0].click();
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

  it('"Quiero Resuelve PRO" (?quiero=1) abre el pedido al entrar; a un PRO no', () => {
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
    // "Tu cuenta PRO": no se le vuelve a vender lo que ya paga.
    expect(host.querySelector('h1')!.textContent!.trim()).toBe('Tu cuenta PRO');
    expect(host.querySelector('[data-testid="pro-includes"]')!.textContent).toContain('espacios Destacados');
    expect(buttons('Quiero Resuelve PRO')).toEqual([]);
    expect(text()).not.toContain('Destacate cuando buscan profesionales en tu ciudad.');
    expect(text()).not.toContain('Hacé que más clientes te encuentren');
    expect(text()).not.toContain('Lo que suma PRO');
    expect(host.querySelector('table')).toBeNull();
  });

  it('configurable: otro precio y otro cupo salen del backend', () => {
    const { text } = render(FREE, {
      info: { free: { quoteLimit: 25 }, pro: { ...INFO.pro, monthlyPriceArs: 21500 } },
    });
    expect(text()).toContain('$21.500');
    expect(text()).toContain('25 en total');
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
    const card = host.querySelector('#contratar')!;
    const banner = card.querySelector('[data-testid="plan-offer"]')!;
    expect([...banner.querySelectorAll('span')].map((e) => e.textContent!.trim())).toEqual([
      'Oferta disponible',
      '20% OFF en tu primer mes',
    ]);
    expect(card.textContent).toContain('$12.000 el primer mes');
    expect(card.textContent).toContain('Luego $15.000 / mes');
    expect(host.querySelector('[data-testid="hero-offer"]')!.textContent).toContain(
      'Primer mes $12.000 · 20% OFF',
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
    buttons('Quiero Resuelve PRO')[0].click();
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
        .match((req) => (req.url.includes('/pro/acquisition/') || req.url.endsWith('/billing/transfer')))
        .forEach((req) => req.flush({ enabled: false, available: false }));
      flushMonth(acquisitionHttp); acquisitionHttp.verify();
    }
  });
});
