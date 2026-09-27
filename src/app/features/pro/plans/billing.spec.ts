import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { API_URL } from '../../../core/api/api.config';
import { BillingStatus, BillingSubscription } from '../../../core/models/billing';
import { Entitlements, OwnPlan, PlansInfo } from '../../../core/models/pro-analytics';
import { OwnProfessional } from '../../../core/models/pro-profile';
import { BILLING_MESSAGES, EXTERNAL_NAVIGATION } from '../../../core/state/billing.store';
import { ProStore } from '../../../core/state/pro.store';
import { ToastService } from '../../../core/services/toast.service';
import { QuoteLimitDialog } from '../../../shared/components/quote-limit-dialog/quote-limit-dialog';
import { ProPlanResultPage, RESULT_POLL } from './pro-plan-result-page';
import { ProPlansPage } from './pro-plans-page';

const API = 'http://api.test/api/v1';
const flush = () => new Promise((r) => setTimeout(r));
const ent = (pro: boolean): Entitlements => ({
  canSendUnlimitedQuotes: pro,
  canBeFeatured: pro,
  canUseAdvancedAnalytics: pro,
  canSeeExposureAnalytics: pro,
  canUseQuoteTemplates: false,
});
const FREE: OwnPlan = { tier: 'FREE', source: null, expiresAt: null, entitlements: ent(false) };
const INFO: PlansInfo = { free: { monthlyQuoteLimit: 10 }, pro: { monthlyPriceArs: 19000, selfServe: true, features: { quoteTemplates: false } } };

const sub = (patch: Partial<BillingSubscription> = {}): BillingSubscription => ({
  id: 'sub-1',
  status: 'ACTIVE',
  provider: 'MERCADO_PAGO',
  currentAmount: 19000,
  baseAmount: 19000,
  currency: 'ARS',
  nextPaymentAt: '2026-10-27T15:00:00.000Z',
  accessUntil: null,
  graceUntil: null,
  checkoutUrl: null,
  offerCode: null,
  offerRedeemed: false,
  returnPath: null,
  createdAt: '2026-09-27T15:00:00.000Z',
  ...patch,
});
const status = (patch: Partial<BillingStatus> = {}): BillingStatus => ({
  enabled: true,
  plan: 'FREE',
  source: null,
  entitlements: ent(false),
  subscription: null,
  canCheckout: true,
  checkoutPrice: { amount: 19000, baseAmount: 19000, currency: 'ARS', offerCode: null, offerCycles: null, discountPercent: null },
  hadSubscription: false,
  ...patch,
});
const ACTIVE = status({ plan: 'PRO', source: 'BILLING', entitlements: ent(true), subscription: sub(), canCheckout: false, checkoutPrice: null });

function setup() {
  const plan = signal<OwnPlan | null>(FREE);
  const ownProfile = signal<OwnProfessional | null>({ id: 'p1', displayName: 'Marta', services: [], zones: [], plan: FREE, quoteUsage: { period: { year: 2026, month: 9 }, used: 10, limit: 10, remaining: 0 } } as unknown as OwnProfessional);
  const pro = {
    plan,
    ownProfile,
    hasPro: computed(() => (plan() ? plan()!.tier === 'PRO' : null)),
    requestingPro: signal(false),
    introOffer: signal(null),
    trackOffer: vi.fn(),
    refreshProfile: vi.fn(),
  };
  const navigate = vi.fn();
  const toast = { show: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_URL, useValue: API },
      { provide: ProStore, useValue: pro },
      { provide: EXTERNAL_NAVIGATION, useValue: navigate },
      { provide: ToastService, useValue: toast },
    ],
  });
  return { http: TestBed.inject(HttpTestingController), pro, navigate, toast };
}

async function plansPage(s: BillingStatus) {
  const ctx = setup();
  const fixture = TestBed.createComponent(ProPlansPage);
  ctx.http.expectOne(`${API}/plans`).flush(INFO);
  fixture.detectChanges();
  await flush();
  ctx.http.expectOne(`${API}/billing/pro/status`).flush(s);
  await flush();
  fixture.detectChanges();
  const host = fixture.nativeElement as HTMLElement;
  const text = () => host.textContent!.replace(/\s+/g, ' ');
  const buttons = (label: string) => [...host.querySelectorAll('button')].filter((b) => b.textContent!.trim() === label);
  return { ...ctx, fixture, host, text, buttons };
}

describe('billing en la página Plan', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('Free: "Pasarme a PRO" crea el checkout y navega SOLO al init_point del backend', async () => {
    const { buttons, http, navigate, fixture, text } = await plansPage(status());
    expect(text()).toContain('Pagás con Mercado Pago');
    expect(text()).not.toContain('Quiero PRO');
    const [cta] = buttons('Pasarme a PRO');
    cta.click();
    fixture.detectChanges();
    expect(cta.getAttribute('aria-busy')).toBe('true');
    expect(cta.disabled).toBe(true);
    // Doble click: el segundo no hace otro pedido.
    cta.click();
    const req = http.expectOne({ method: 'POST', url: `${API}/billing/pro/checkout` });
    expect(req.request.body).toEqual({});
    req.flush({ checkoutUrl: 'https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_id=abc', subscriptionId: 'sub-1' });
    await flush();
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_id=abc');
  });

  it('con la oferta elegible el botón dice el descuento (lo decide el backend)', async () => {
    const { buttons } = await plansPage(
      status({ checkoutPrice: { amount: 15200, baseAmount: 19000, currency: 'ARS', offerCode: 'PRO_FIRST_MONTH_20', offerCycles: 1, discountPercent: 20 } }),
    );
    expect(buttons('Aprovechar 20% OFF').length).toBeGreaterThan(0);
  });

  it('si ya tuvo PRO pago dice "Volver a PRO"', async () => {
    const { buttons } = await plansPage(status({ hadSubscription: true }));
    expect(buttons('Volver a PRO').length).toBeGreaterThan(0);
  });

  it('error al crear el checkout → copy propio, sin navegar y el botón vuelve a estar disponible', async () => {
    const { buttons, http, navigate, toast, fixture } = await plansPage(status());
    buttons('Pasarme a PRO')[0].click();
    http
      .expectOne(`${API}/billing/pro/checkout`)
      .flush({ code: 'BILLING_PROVIDER_ERROR', message: 'MercadoPago 400 preapproval_validation_error' }, { status: 502, statusText: 'Bad Gateway' });
    await flush();
    fixture.detectChanges();
    expect(navigate).not.toHaveBeenCalled();
    expect(toast.show).toHaveBeenCalledWith(BILLING_MESSAGES.checkoutFailed, 3600, 'info');
    expect(buttons('Pasarme a PRO')[0].disabled).toBe(false);
  });

  it('PENDING: espera la confirmación y ofrece continuar en Mercado Pago (sin decir que ya es PRO)', async () => {
    const { host, text, buttons } = await plansPage(
      status({ subscription: sub({ status: 'PENDING', nextPaymentAt: null, checkoutUrl: 'https://mp.test/checkout/1' }) }),
    );
    expect(text()).toContain('Estamos esperando la confirmación de Mercado Pago.');
    const link = [...host.querySelectorAll('a')].find((a) => a.textContent!.includes('Continuar en Mercado Pago'))!;
    expect(link.getAttribute('href')).toBe('https://mp.test/checkout/1');
    expect(buttons('Pasarme a PRO')).toHaveLength(0);
    expect(text()).not.toContain('Ya sos');
  });

  it('ACTIVE: estado, próximo cobro, precio y cancelar; sin botón para comprar otra vez', async () => {
    const { text, buttons, pro } = await plansPage(ACTIVE);
    expect(text()).toContain('Tu plan actual');
    expect(text()).toContain('Activa');
    expect(text()).toContain('Próximo cobro');
    expect(text()).toContain('27 de octubre');
    expect(text()).toContain('$19.000 / mes');
    expect(buttons('Cancelar suscripción')).toHaveLength(1);
    expect(buttons('Pasarme a PRO')).toHaveLength(0);
    // El plan cambió respecto de /pro/me: se relee para el badge.
    expect(pro.refreshProfile).toHaveBeenCalled();
  });

  it('ciclo promocional sin cobrar: muestra primer mes y el precio normal después', async () => {
    const { text } = await plansPage(status({ ...ACTIVE, subscription: sub({ currentAmount: 15200, offerCode: 'PRO_FIRST_MONTH_20' }) }));
    expect(text()).toContain('$15.200 el primer mes · luego $19.000 / mes');
  });

  it('cancelar pide confirmación sin dark patterns y llama al backend', async () => {
    const { buttons, fixture, http, text } = await plansPage(ACTIVE);
    buttons('Cancelar suscripción')[0].click();
    fixture.detectChanges();
    expect(text()).toContain('Cancelar Resuelve PRO');
    expect(text()).toContain('No volveremos a cobrarte.');
    expect(text()).toContain('Tu perfil, reseñas y datos no se eliminan.');
    expect(buttons('Volver')).toHaveLength(1);
    const confirm = buttons('Cancelar suscripción').at(-1)!;
    confirm.click();
    http.expectOne({ method: 'POST', url: `${API}/billing/pro/cancel` }).flush(
      status({ ...ACTIVE, canCheckout: false, subscription: sub({ status: 'CANCELLED', nextPaymentAt: null, accessUntil: '2026-10-27T15:00:00.000Z' }) }),
    );
    await flush();
    fixture.detectChanges();
    expect(text()).toContain('Tu suscripción está cancelada.');
    expect(text()).toContain('Seguís teniendo PRO hasta el 27 de octubre de 2026');
  });

  it('PAST_DUE: problema de cobro, reintento de Mercado Pago y acceso mantenido (sin llamar moroso a nadie)', async () => {
    const graceUntil = new Date(Date.now() + 5 * 86_400_000).toISOString();
    const { text } = await plansPage(status({ ...ACTIVE, subscription: sub({ status: 'PAST_DUE', graceUntil }) }));
    expect(text()).toContain('Hay un problema con el último cobro.');
    expect(text()).toContain('Mercado Pago está reintentando el cobro. Mientras tanto mantenemos tu acceso PRO');
    expect(text().toLowerCase()).not.toContain('moros');
  });

  it('CANCELLED ya vencida: Free con "Volver a PRO"', async () => {
    const { text, buttons } = await plansPage(
      status({ hadSubscription: true, subscription: sub({ status: 'CANCELLED', nextPaymentAt: null, accessUntil: null }) }),
    );
    expect(text()).not.toContain('Tu suscripción está cancelada.');
    expect(buttons('Volver a PRO').length).toBeGreaterThan(0);
  });
});

describe('vuelta de Mercado Pago (/pro/plan/resultado)', () => {
  afterEach(() => {
    vi.useRealTimers();
    TestBed.inject(HttpTestingController).verify();
  });

  async function resultPage() {
    const ctx = setup();
    const fixture = TestBed.createComponent(ProPlanResultPage);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const text = () => host.textContent!.replace(/\s+/g, ' ');
    const answer = async (s: BillingStatus) => {
      ctx.http.expectOne(`${API}/billing/pro/status`).flush(s);
      await flush();
      fixture.detectChanges();
    };
    return { ...ctx, fixture, text, answer, host };
  }

  it('volver no es pagar: "confirmando" mientras está PENDING y "Ya sos Resuelve PRO" recién con ACTIVE', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const { text, answer, pro } = await resultPage();
    expect(text()).toContain('Estamos confirmando tu suscripción');
    await answer(status({ subscription: sub({ status: 'PENDING', nextPaymentAt: null }) }));
    expect(text()).toContain('Estamos confirmando tu suscripción');
    expect(text()).not.toContain('Ya sos');
    vi.advanceTimersByTime(RESULT_POLL.intervalMs);
    await answer(ACTIVE);
    expect(text()).toContain('Ya sos Resuelve PRO');
    expect(text()).toContain('Ir a mi panel');
    expect(pro.refreshProfile).toHaveBeenCalled();
  });

  it('con una solicitud de origen ofrece seguir con esa oportunidad', async () => {
    const { answer, host } = await resultPage();
    await answer({ ...ACTIVE, subscription: sub({ returnPath: '/pro/solicitudes/req-1/presupuesto' }) });
    const link = [...host.querySelectorAll('a')].find((a) => a.textContent!.includes('Seguir con esta oportunidad'))!;
    expect(link.getAttribute('href')).toBe('/pro/solicitudes/req-1/presupuesto');
  });

  it('sin confirmación en 30 s: deja de consultar y ofrece Reintentar / Volver al plan', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const { text, answer, http, fixture, host } = await resultPage();
    const pending = status({ subscription: sub({ status: 'PENDING', nextPaymentAt: null }) });
    await answer(pending);
    for (let t = RESULT_POLL.intervalMs; t < RESULT_POLL.maxMs; t += RESULT_POLL.intervalMs) {
      vi.advanceTimersByTime(RESULT_POLL.intervalMs);
      await flush();
      const reqs = http.match(`${API}/billing/pro/status`);
      reqs.forEach((r) => r.flush(pending));
      await flush();
    }
    fixture.detectChanges();
    expect(text()).toContain('Todavía estamos esperando confirmación de Mercado Pago.');
    vi.advanceTimersByTime(RESULT_POLL.maxMs);
    http.expectNone(`${API}/billing/pro/status`);
    const retry = [...host.querySelectorAll('button')].find((b) => b.textContent!.includes('Reintentar'))!;
    retry.click();
    await answer(ACTIVE);
    expect(text()).toContain('Ya sos Resuelve PRO');
  });

  it('primer cobro rechazado: lo dice sin prometer PRO confirmado', async () => {
    const { answer, text } = await resultPage();
    await answer(status({ ...ACTIVE, subscription: sub({ status: 'PAST_DUE' }) }));
    expect(text()).toContain('Hay un problema con el cobro');
    expect(text()).not.toContain('Ya sos');
  });
});

describe('intento 11 con billing', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('el modal del cupo va directo al checkout y guarda la solicitud para volver', async () => {
    const { http, navigate } = setup();
    await TestBed.inject(Router).navigateByUrl('/');
    vi.spyOn(TestBed.inject(Router), 'url', 'get').mockReturnValue('/pro/solicitudes/req-9/presupuesto?x=1');
    const fixture = TestBed.createComponent(QuoteLimitDialog);
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('limit', 10);
    http.expectOne(`${API}/plans`).flush(INFO);
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();
    const cta = [...document.querySelectorAll('button')].find((b) => b.textContent!.trim() === 'Pasarme a PRO')!;
    cta.click();
    const req = http.expectOne({ method: 'POST', url: `${API}/billing/pro/checkout` });
    expect(req.request.body).toEqual({ returnTo: '/pro/solicitudes/req-9/presupuesto' });
    req.flush({ checkoutUrl: 'https://mp.test/checkout/9', subscriptionId: 's9' });
    await flush();
    expect(navigate).toHaveBeenCalledWith('https://mp.test/checkout/9');
    fixture.destroy();
  });
});
