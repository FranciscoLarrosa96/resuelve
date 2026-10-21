import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { API_URL } from '../../../core/api/api.config';
import { flushMonth, flushNoWorks } from '../../../core/api/pro-tools.testing';
import { Entitlements, OwnPlan, PlansInfo, QuoteUsage } from '../../../core/models/pro-analytics';
import { EligibleIntroOffer, OwnProfessional } from '../../../core/models/pro-profile';
import { FunnelTracker } from '../../../core/analytics/funnel-tracker';
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
  const tracks: string[] = [];
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
      { provide: FunnelTracker, useValue: { track: (type: string, surface: string) => tracks.push(`${type}:${surface}`) } },
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
  return { fixture, host, text, buttons, calls, tracks };
}

describe('página Plan', () => {
  it('ofrece la prueba elegible en Mi plan sin activarla al entrar', () => {
    const { host } = render(FREE, { profile: me(FREE, { proTrial: { state: 'AVAILABLE', days: 7 } }) });
    expect(host.querySelector('[data-testid="pro-trial-open"]')?.textContent).toContain('Probar PRO gratis');
    expect(host.querySelector('[data-testid="pro-trial-start"]')).toBeNull();
    expect(host.querySelectorAll('app-plan-options')).toHaveLength(1);
  });

  it.each([
    ['MISSING_AVATAR', 'Agregá tu foto de perfil', '/pro/perfil?editar=avatar'],
    ['MISSING_WORK_PHOTO', 'Cargá un trabajo con fotos', '/pro/perfil?editar=portfolio'],
    ['PROFILE_NOT_PUBLISHED', 'Publicá tu perfil', '/pro/perfil'],
  ])('orienta a preparar el perfil cuando la prueba está bloqueada por %s', (reason, copy, href) => {
    const { host } = render(FREE, { profile: me(FREE, { proTrial: { state: 'UNAVAILABLE', reason } }) });
    const next = host.querySelector('[data-testid="trial-preparation"]');
    expect(next?.textContent).toContain(copy);
    expect(next?.querySelector('a')?.getAttribute('href')).toBe(href);
    expect(host.querySelector('[data-testid="pro-trial-open"]')).toBeNull();
  });

  it('no ofrece otra prueba ni preparación a quien ya la usó', () => {
    const { host } = render(FREE, { profile: me(FREE, { proTrial: { state: 'UNAVAILABLE', reason: 'ALREADY_HAD_TRIAL' } }) });
    expect(host.querySelector('[data-testid="trial-preparation"]')).toBeNull();
    expect(host.querySelector('[data-testid="pro-trial-open"]')).toBeNull();
  });
  afterEach(() => {
    const http = TestBed.inject(HttpTestingController);
    http
      .match((req) => (req.url.includes('/pro/acquisition/') || req.url.endsWith('/billing/transfer')))
      .forEach((req) => req.flush({ enabled: false, available: false }));
    flushMonth(http); http.verify();
  });

  it('en una mirada: "Hacé que más clientes te encuentren y contacten", el precio en la tarjeta de PRO y tres beneficios con la visibilidad primero', () => {
    const { host, text, buttons } = render(FREE);
    expect(host.querySelector('h1')!.textContent?.trim()).toBe(
      'Hacé que más clientes te encuentren y contacten.',
    );
    const proCard = host.querySelector('[data-testid="three-plans"] article:nth-of-type(2)')!;
    expect(proCard.textContent!.replace(/\s+/g, ' ')).toContain('$15.000 / mes');
    expect(text()).not.toContain('Los planes pagos no garantizan clientes ni ingresos.');
    expect(PRO_PILLARS.map((p) => p.title)).toEqual([
      'Destacate cuando te buscan',
      'Respondé pedidos de búsqueda sin el cupo de Free',
      'Mostrá más y medí el interés',
    ]);
    for (const p of PRO_PILLARS) expect(text()).toContain(p.title);
    // Solo ventajas de PRO: el contacto directo no es un beneficio (es de los dos planes) y se dice aparte.
    for (const p of PRO_PILLARS) expect(p.title).not.toMatch(/contacto|WhatsApp|llamad/i);
    expect(PRO_PILLARS[2].text).toBe('Hasta 10 trabajos con 5 fotos cada uno (Free: 1), portada y Tu mes completo.');
    expect(host.querySelector('[data-testid="pro-free-note"]')!.textContent!.trim()).toBe(
      'Tu perfil, WhatsApp, llamadas, solicitudes y reseñas siguen siendo gratis en Free.',
    );
    // Una sola decisión: "Quiero Resuelve PRO" (sin billing abre el pedido). Ni botón en el encabezado ni segundo botón al final.
    expect(buttons('Quiero Resuelve PRO')).toHaveLength(1);
    expect(host.querySelector('a[href="/pro/plan#comparacion"]')).toBeNull();
  });

  it('planes y precio antes de las métricas y beneficios, sin tabla repetida', () => {
    const { host } = render(FREE);
    const headings = [...host.querySelectorAll('h1, h2')].map((h) => h.textContent!.trim());
    expect(headings).toEqual([
      'Hacé que más clientes te encuentren y contacten.',
      'Elegí cómo seguir',
      'Gratis', 'PRO', 'PRO Plus',
      'Cómo se contrata',
      'Lo que suma PRO',
    ]);
    expect(host.querySelector('table')).toBeNull();
    expect(host.querySelector('[data-testid="free-included"]')).toBeNull();
    // La comparación va a la vista (sin desplegar) y PRO sigue "Recomendado" sin inventar un "más elegido".
    expect(host.querySelector('details')).toBeNull();
    expect(host.querySelector('[data-testid="three-plans"]')!.textContent).toContain('Recomendado');
    expect(host.textContent).not.toMatch(/más elegido|más popular/i);
  });

  it('recibir no es responder: nunca promete solicitudes ni respuestas "sin límite" a Free', () => {
    const { host, text } = render(FREE);
    expect(host.querySelector('[data-testid="quotes-text"]')!.textContent!.replace(/\s+/g, ' ')).toContain(
      'Usaste 2 de 5 oportunidades Free.',
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
    // El límite que se ofrece es el de PRO, nunca el del plan actual (Free permite 1).
    expect(t).toContain('(hasta 10)');
    expect(t).not.toContain('(hasta 1)');
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

  it('comparación de los tres planes a la vista: límites y precios de las fuentes, Plus sin prioridad extra', () => {
    const { host } = render(FREE);
    const plans = host.querySelector('[data-testid="three-plans"]')!;
    const [free, pro, plus] = [...plans.querySelectorAll('article')].map((a) => a.textContent!.replace(/\s+/g, ' '));
    expect(free).toContain('Perfil, WhatsApp, llamadas y reseñas');
    expect(free).toContain('1 trabajo con hasta 5 fotos');
    expect(free).toContain('5 oportunidades de búsqueda en total, desde el primer presupuesto');
    expect(pro).toContain('Hasta 10 trabajos, con 5 fotos cada uno');
    expect(pro).toContain('Participación en espacios Destacados');
    expect(pro).toContain('$15.000 / mes');
    expect(plus).toContain('Todo lo de PRO, más:');
    expect(plus).toContain('Hasta 30 trabajos');
    expect(plus).toContain('Presupuestos en PDF');
    expect(plus).toContain('Tu mes en CSV');
    // PRO y Plus compiten en Destacados con las mismas reglas: nada de prioridad adicional.
    expect(plus).not.toMatch(/prioridad|primero|más visibilidad/i);
    expect(plans.parentElement!.textContent).not.toContain('participan en Destacados con las mismas reglas');
    expect(host.querySelector('[data-testid="compare-note"]')!.textContent).toContain(
      'En Free tenés 5 oportunidades de búsqueda en total, desde el primer presupuesto.',
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
      const compare = ctx.host.querySelector('#contratar')!;
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
      expect(r.beforeFeatured).toBe(true);
      expect(r.host.querySelector('#contratar [data-testid="payment-prepaid"]')?.textContent).toContain('sin renovación automática');
      expect(r.host.querySelector('#contratar [data-testid="payment-prepaid"] a')?.getAttribute('href')).toBe('/pro/plan#transferencia');
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

  describe('medición de la oferta', () => {
    // IntersectionObserver controlable: el test decide cuándo la sección de planes entra en pantalla.
    type Obs = { cb: (e: { isIntersecting: boolean }[]) => void; target: Element | null; disconnected: boolean };
    let observers: Obs[];
    const original = globalThis.IntersectionObserver;
    beforeEach(() => {
      observers = [];
      globalThis.IntersectionObserver = class {
        o: Obs;
        constructor(cb: Obs['cb']) {
          this.o = { cb, target: null, disconnected: false };
          observers.push(this.o);
        }
        observe(t: Element) { this.o.target = t; }
        disconnect() { this.o.disconnected = true; }
        unobserve() {}
        takeRecords() { return []; }
      } as unknown as typeof IntersectionObserver;
    });
    afterEach(() => { globalThis.IntersectionObserver = original; });
    const scrollToOffer = () => observers.filter((o) => !o.disconnected).forEach((o) => o.cb([{ isIntersecting: true }]));

    it('abrir Mi plan sin llegar a las tarjetas no cuenta como oferta vista; al llegar cuenta una sola vez', () => {
      const { host, tracks } = render(FREE);
      expect(tracks).toEqual(['PRO_PLAN_VIEWED:PLAN_PAGE']);
      expect(observers.some((o) => o.target === host.querySelector('#contratar [class~="mt-5"]'))).toBe(true);
      scrollToOffer();
      scrollToOffer();
      expect(tracks).toEqual(['PRO_PLAN_VIEWED:PLAN_PAGE', 'PRO_PLAN_VIEWED:PLAN_OFFER']);
    });

    it('Free: la oferta se registra como vista una vez que se ve, y el clic por plan elegido', () => {
      const { fixture, buttons, tracks } = render(FREE);
      scrollToOffer();
      expect(tracks).toEqual(['PRO_PLAN_VIEWED:PLAN_PAGE', 'PRO_PLAN_VIEWED:PLAN_OFFER']);
      buttons('Quiero Resuelve PRO')[0].click();
      fixture.detectChanges();
      expect(tracks).toContain('PRO_CTA_CLICKED:PLAN_PAGE');
      expect(tracks).not.toContain('PRO_CTA_CLICKED:PLAN_PLUS');
      (fixture.componentInstance as unknown as { choosePlan(t: 'PRO' | 'PRO_PLUS'): void }).choosePlan('PRO_PLUS');
      expect(tracks).toContain('PRO_CTA_CLICKED:PLAN_PLUS');
    });

    it('un PRO que visita Mi plan no cuenta como oferta vista ni genera clics de venta', () => {
      const { tracks } = render(PRO);
      scrollToOffer();
      expect(tracks).toEqual(['PRO_PLAN_VIEWED:PLAN_PAGE']);
    });

    it('sin plan cargado todavía no se registra ninguna oferta', () => {
      const { tracks } = render(null);
      scrollToOffer();
      expect(tracks).toEqual(['PRO_PLAN_VIEWED:PLAN_PAGE']);
    });
  });

  it('presenta los beneficios sin aclaraciones defensivas ni promesas de trabajos', () => {
    const { text } = render(FREE);
    expect(text()).not.toContain('Los planes pagos no garantizan clientes ni ingresos.');
    expect(text()).not.toMatch(
      /Premium|Maximizá|siguiente nivel|Desbloqueá|todo tu potencial|garantizamos|garantizados|asegurad|siempre primero|multiplicá|a confirmar|consultar precio|días gratis|Probar PRO/i,
    );
  });

  it('"Quiero Resuelve PRO" sin checkout: registra el pedido y lo dice, sin cambiar el plan', async () => {
    const { fixture, host, buttons, calls } = render(FREE);
    expect(buttons('Quiero Resuelve PRO').length).toBe(1);
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
    expect(host.querySelector('[data-testid="pro-includes"]')).toBeNull();
    expect(buttons('Quiero Resuelve PRO')).toEqual([]);
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
    expect(text()).toContain('25 oportunidades de búsqueda en total, desde el primer presupuesto');
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
    const card = host.querySelector('[data-testid="hire-info"]')!;
    const banner = card.querySelector('[data-testid="plan-offer"]')!;
    expect([...banner.querySelectorAll('span')].map((e) => e.textContent!.trim())).toEqual([
      'Oferta disponible',
      '20% OFF en tu primer mes',
    ]);
    expect(card.textContent).toContain('$12.000 el primer mes');
    expect(card.textContent).toContain('Luego $15.000 / mes');
    expect(host.querySelector('[data-testid="plan-card-offer"]')!.textContent).toContain(
      'Primer mes $12.000 · 20% OFF',
    );
    expect(host.querySelector('[data-testid="three-plans"]')!.textContent).toContain('$15.000'); // el normal no se esconde
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
