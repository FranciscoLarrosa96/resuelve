import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { API_URL } from '../../../core/api/api.config';
import { flushMonth } from '../../../core/api/pro-tools.testing';
import { BillingStatus, BillingSubscription } from '../../../core/models/billing';
import { Entitlements, OwnPlan, PlansInfo } from '../../../core/models/pro-analytics';
import { OwnProfessional, ProTrial } from '../../../core/models/pro-profile';
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
  portfolioWorkLimit: pro ? 10 : 0,
});
const FREE: OwnPlan = { tier: 'FREE', source: null, expiresAt: null, entitlements: ent(false) };
const INFO: PlansInfo = { free: { quoteLimit: 5 }, pro: { monthlyPriceArs: 15000, selfServe: true, features: { quoteTemplates: false } } };

const sub = (patch: Partial<BillingSubscription> = {}): BillingSubscription => ({
  id: 'sub-1',
  status: 'ACTIVE',
  provider: 'MERCADO_PAGO',
  currentAmount: 15000,
  baseAmount: 15000,
  currency: 'ARS',
  nextPaymentAt: '2026-10-27T15:00:00.000Z',
  accessUntil: null,
  graceUntil: null,
  checkoutUrl: null,
  withdrawableUntil: null,
  refundAmount: 0,
  withdrawnAt: null,
  refundPending: false,
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
  checkoutPrice: { amount: 15000, baseAmount: 15000, currency: 'ARS', offerCode: null, offerCycles: null, discountPercent: null },
  hadSubscription: false,
  ...patch,
});
const ACTIVE = status({ plan: 'PRO', source: 'BILLING', entitlements: ent(true), subscription: sub(), canCheckout: false, checkoutPrice: null });

function setup() {
  const plan = signal<OwnPlan | null>(FREE);
  const ownProfile = signal<OwnProfessional | null>({ id: 'p1', displayName: 'Marta', services: [], zones: [], plan: FREE, quoteUsage: { used: 5, limit: 5, remaining: 0 } } as unknown as OwnProfessional);
  const pro = {
    plan,
    ownProfile,
    hasPro: computed(() => (plan() ? plan()!.tier === 'PRO' : null)),
    requestingPro: signal(false),
    introOffer: signal(null),
    trackOffer: vi.fn(),
    refreshProfile: vi.fn(),
    proTrial: signal<ProTrial | null>(null), trialSummary: signal(null), loadTrialSummary: async () => null, startingTrial: signal(false),
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
  afterEach(() => { const http = TestBed.inject(HttpTestingController); http.match(req => (req.url.includes('/pro/acquisition/') || req.url.endsWith('/billing/transfer'))).forEach(req => req.flush({ enabled: false, available: false })); flushMonth(http); http.verify(); });

  it('durante la prueba permite contratar y confirma las condiciones antes de crear un checkout', async () => {
    const ctx = await plansPage(status({ plan: 'PRO', source: 'BONUS', entitlements: ent(true) }));
    ctx.pro.plan.set({ tier: 'PRO', source: 'BONUS', expiresAt: '2026-12-01T12:00:00Z', entitlements: ent(true) });
    ctx.pro.proTrial.set({ state: 'ACTIVE', days: 7, startedAt: '2026-11-24T12:00:00Z', endsAt: '2026-12-01T12:00:00Z', summaryPending: false });
    ctx.fixture.detectChanges();
    ctx.buttons('Continuar con PRO')[0].click();
    ctx.fixture.detectChanges();
    expect(ctx.host.querySelector('[data-testid="trial-charge-note"]')?.textContent).toContain('la prueba no posterga el cobro');
    ctx.http.expectNone(`${API}/billing/pro/checkout`);
    ctx.buttons('Continuar con Mercado Pago')[0].click();
    ctx.http.expectOne(`${API}/billing/pro/checkout`).flush({ checkoutUrl: 'https://mp.test/trial', subscriptionId: 's1' });
    await flush();
    expect(ctx.navigate).toHaveBeenCalledWith('https://mp.test/trial');
    ctx.pro.plan.set({ tier: 'PRO', source: 'BILLING', expiresAt: null, entitlements: ent(true) });
    ctx.fixture.detectChanges();
    expect(ctx.host.querySelector('[data-testid="trial-purchase"]')).toBeNull();
  });

  it('un error al cargar facturación muestra un reintento que recupera la contratación', async () => {
    const ctx = setup();
    const fixture = TestBed.createComponent(ProPlansPage);
    ctx.http.expectOne(`${API}/plans`).flush(INFO);
    fixture.detectChanges();
    await flush();
    ctx.http.expectOne(`${API}/billing/pro/status`).flush({}, { status: 503, statusText: 'Unavailable' });
    await flush();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    host.querySelector<HTMLButtonElement>('[data-testid="billing-load-error"] button')!.click();
    ctx.http.expectOne(`${API}/billing/pro/status`).flush(status());
    await flush();
    fixture.detectChanges();
    expect(host.querySelector('[data-testid="billing-load-error"]')).toBeNull();
    const purchase = [...host.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Quiero Resuelve PRO');
    expect(purchase?.disabled).toBe(false);
  });

  it('si hay dos medios, elegir el plan no inicia un cobro y transferencia no crea un checkout de Mercado Pago', async () => {
    const ctx = await plansPage(status());
    ctx.http.expectOne(`${API}/billing/transfer`).flush({
      enabled: true, available: true, options: [{ months: 1, days: 30, amountArs: 15000, basePriceArs: 15000 }],
      pending: null, last: null, recentOutcome: null, proUntil: null, withdrawal: null, refundPending: null,
    });
    await flush();
    ctx.fixture.detectChanges();
    ctx.buttons('Quiero Resuelve PRO')[0].click();
    ctx.fixture.detectChanges();
    expect(ctx.text()).toContain('¿Cómo querés pagar?');
    ctx.http.expectNone(`${API}/billing/pro/checkout`);
    ctx.buttons('Elegir transferencia')[0].click();
    ctx.fixture.detectChanges();
    expect(ctx.host.querySelector('[data-testid="transfer-body"]') ?? ctx.host.querySelector('#transfer-body')).not.toBeNull();
    ctx.http.expectNone(`${API}/billing/pro/checkout`);
    expect(ctx.navigate).not.toHaveBeenCalled();
  });

  it('un error de Mercado Pago no bloquea el medio de transferencia disponible', async () => {
    const ctx = setup();
    const fixture = TestBed.createComponent(ProPlansPage);
    ctx.http.expectOne(`${API}/plans`).flush(INFO);
    fixture.detectChanges();
    await flush();
    ctx.http.expectOne(`${API}/billing/pro/status`).flush({}, { status: 503, statusText: 'Unavailable' });
    ctx.http.expectOne(`${API}/billing/transfer`).flush({
      enabled: true, available: true, options: [{ months: 1, days: 30, amountArs: 15000, basePriceArs: 15000 }],
      pending: null, last: null, recentOutcome: null, proUntil: null, withdrawal: null, refundPending: null,
    });
    await flush();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const choose = [...host.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Quiero Resuelve PRO')!;
    expect(choose.disabled).toBe(false);
    choose.click();
    fixture.detectChanges();
    expect(host.querySelector('#transfer-body')).not.toBeNull();
    ctx.http.expectNone(`${API}/billing/pro/checkout`);
  });

  it('Free: "Quiero Resuelve PRO" crea el checkout y navega SOLO al init_point del backend', async () => {
    const { buttons, http, navigate, fixture, text, host } = await plansPage(status());
    expect(text()).toContain('Pagás con Mercado Pago');
    expect(text()).toContain('Se renueva automáticamente cada mes hasta que canceles');
    expect(host.querySelector('[data-testid="pro-terms-link"]')?.getAttribute('href')).toBe('/terminos#pro-pagos');
    const [cta] = buttons('Quiero Resuelve PRO');
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

  it('Cómo se contrata: el arrepentimiento de 10 días y la renovación, junto al precio', async () => {
    const a = await plansPage(status());
    const note = a.host.querySelector('[data-testid="withdrawal-note"]')!.textContent!.replace(/\s+/g, ' ');
    expect(note).toContain('Tenés 10 días desde que contratás para arrepentirte');
    expect(a.host.querySelector('[data-testid="payment-subscription"]')?.textContent).toContain('Se renueva automáticamente cada mes hasta que canceles');
    expect(a.host.querySelector('[data-testid="reputation-note"]')).toBeNull();
  });

  it('con la oferta elegible el botón sigue siendo "Quiero Resuelve PRO": el descuento va junto al precio', async () => {
    const { buttons } = await plansPage(
      status({ checkoutPrice: { amount: 12000, baseAmount: 15000, currency: 'ARS', offerCode: 'PRO_FIRST_MONTH_20', offerCycles: 1, discountPercent: 20 } }),
    );
    expect(buttons('Quiero Resuelve PRO').length).toBeGreaterThan(0);
    expect(buttons('Aprovechar 20% OFF')).toHaveLength(0);
  });

  it('si ya tuvo PRO pago dice "Volver a PRO"', async () => {
    const { buttons } = await plansPage(status({ hadSubscription: true }));
    expect(buttons('Volver a PRO').length).toBeGreaterThan(0);
  });

  it('error al crear el checkout → copy propio, sin navegar y el botón vuelve a estar disponible', async () => {
    const { buttons, http, navigate, toast, fixture } = await plansPage(status());
    buttons('Quiero Resuelve PRO')[0].click();
    http
      .expectOne(`${API}/billing/pro/checkout`)
      .flush({ code: 'BILLING_PROVIDER_ERROR', message: 'MercadoPago 400 preapproval_validation_error' }, { status: 502, statusText: 'Bad Gateway' });
    await flush();
    fixture.detectChanges();
    expect(navigate).not.toHaveBeenCalled();
    expect(toast.show).toHaveBeenCalledWith(BILLING_MESSAGES.checkoutFailed, 3600, 'info');
    expect(buttons('Quiero Resuelve PRO')[0].disabled).toBe(false);
  });

  it('PENDING: espera la confirmación y ofrece continuar en Mercado Pago (sin decir que ya es PRO)', async () => {
    const { host, text, buttons } = await plansPage(
      status({ subscription: sub({ status: 'PENDING', nextPaymentAt: null, checkoutUrl: 'https://mp.test/checkout/1' }) }),
    );
    expect(text()).toContain('Estamos esperando la confirmación de Mercado Pago.');
    const link = [...host.querySelectorAll('a')].find((a) => a.textContent!.includes('Continuar en Mercado Pago'))!;
    expect(link.getAttribute('href')).toBe('https://mp.test/checkout/1');
    expect(buttons('Quiero Resuelve PRO')).toHaveLength(0);
    expect(text()).not.toContain('Ya sos');
  });

  it('ACTIVE: estado, próximo cobro, precio y cancelar; sin botón para comprar otra vez', async () => {
    const { text, buttons, pro } = await plansPage(ACTIVE);
    expect(text()).toContain('Tu plan actual');
    expect(text()).toContain('Activa');
    expect(text()).toContain('Próximo cobro');
    expect(text()).toContain('27 de octubre');
    expect(text()).toContain('$15.000 / mes');
    expect(buttons('Dejar de renovar')).toHaveLength(1);
    expect(buttons('Quiero Resuelve PRO')).toHaveLength(0);
    // El plan cambió respecto de /pro/me: se relee para el badge.
    expect(pro.refreshProfile).toHaveBeenCalled();
  });

  it('ciclo promocional sin cobrar: muestra primer mes y el precio normal después', async () => {
    const { text } = await plansPage(status({ ...ACTIVE, subscription: sub({ currentAmount: 12000, offerCode: 'PRO_FIRST_MONTH_20' }) }));
    expect(text()).toContain('$12.000 el primer mes · luego $15.000 / mes');
  });

  it('cancelar pide confirmación sin dark patterns y llama al backend', async () => {
    const { buttons, fixture, http, text, host } = await plansPage(ACTIVE);
    buttons('Dejar de renovar')[0].click();
    fixture.detectChanges();
    expect(text()).toContain('Dejar de renovar Resuelve PRO');
    expect(text()).toContain('No volveremos a cobrarte.');
    expect(text()).toContain('Tu perfil, reseñas y datos no se eliminan.');
    expect(text()).toContain('Vas a mantener los beneficios PRO hasta el fin del período que ya pagaste.');
    expect(text()).toContain('Acceso hasta');
    expect(host.querySelector('[data-testid="cancel-access-until"]')?.textContent).toBe('27 de octubre');
    expect(buttons('Volver')).toHaveLength(1);
    const confirm = buttons('Dejar de renovar').at(-1)!;
    confirm.click();
    http.expectOne({ method: 'POST', url: `${API}/billing/pro/cancel` }).flush(
      status({ ...ACTIVE, canCheckout: false, subscription: sub({ status: 'CANCELLED', nextPaymentAt: null, accessUntil: '2026-10-27T15:00:00.000Z' }) }),
    );
    await flush();
    fixture.detectChanges();
    // Cancelar = cancelar la renovación: sigue "Resuelve PRO", sin F5 y sin botón de cancelar.
    const panel = host.querySelector('[data-testid="subscription-panel"]')!;
    expect(panel.getAttribute('data-status')).toBe('CANCELLED');
    expect(panel.querySelector('h2')?.textContent?.trim()).toBe('Resuelve PRO');
    expect(host.querySelector('[data-testid="subscription-state"]')?.textContent).toBe('Cancelada');
    expect(text()).toContain('Acceso PRO hasta');
    expect(host.querySelector('[data-testid="access-until"]')?.textContent).toBe('27 de octubre de 2026');
    expect(text()).toContain('Tu suscripción está cancelada. Seguís teniendo Resuelve PRO hasta el 27 de octubre de 2026. No se realizarán nuevos cobros.');
    expect(text()).not.toContain('Tu plan actual es Free');
    expect(buttons('Dejar de renovar')).toHaveLength(0);
    expect(buttons('Volver a PRO')).toHaveLength(0);
  });

  it('CANCELLED con acceso vigente: Resuelve PRO · Cancelada, sin cancelar otra vez ni CTA engañoso', async () => {
    const accessUntil = new Date(Date.now() + 20 * 86_400_000).toISOString();
    const { host, text, buttons } = await plansPage(
      status({ ...ACTIVE, hadSubscription: true, subscription: sub({ status: 'CANCELLED', nextPaymentAt: null, accessUntil }) }),
    );
    expect(host.querySelector('[data-testid="subscription-panel"]')?.getAttribute('data-status')).toBe('CANCELLED');
    expect(text()).toContain('Resuelve PRO');
    expect(text()).toContain('Cancelada');
    expect(text()).toContain('Tu suscripción no se renovará.');
    expect(buttons('Dejar de renovar')).toHaveLength(0);
    expect(buttons('Volver a PRO')).toHaveLength(0);
  });

  it('PAST_DUE: el botón de cancelar está visible y el diálogo no promete PRO', async () => {
    const graceUntil = new Date(Date.now() + 5 * 86_400_000).toISOString();
    const { text, buttons, fixture } = await plansPage(status({ ...ACTIVE, subscription: sub({ status: 'PAST_DUE', graceUntil }) }));
    buttons('Dejar de renovar')[0].click();
    fixture.detectChanges();
    expect(text()).toContain('al cancelar tu plan pasa a Free');
    expect(text()).not.toContain('Vas a mantener los beneficios PRO');
  });

  describe('arrepentimiento', () => {
    const until = () => new Date(Date.now() + 8 * 86_400_000).toISOString();
    const WITHDRAWABLE = () => status({ ...ACTIVE, subscription: sub({ withdrawableUntil: until(), refundAmount: 15000 }) });

    it('dentro de la ventana: botón visible con la fecha límite', async () => {
      const { host, text, buttons } = await plansPage(WITHDRAWABLE());
      expect(host.querySelector('[data-testid="withdraw-section"]')).not.toBeNull();
      expect(text()).toContain('podés revocar la contratación hasta el');
      expect(buttons('Botón de arrepentimiento')).toHaveLength(1);
    });

    it('fuera de la ventana el botón no aparece', async () => {
      const { host, buttons } = await plansPage(ACTIVE);
      expect(host.querySelector('[data-testid="withdraw-section"]')).toBeNull();
      expect(buttons('Botón de arrepentimiento')).toHaveLength(0);
    });

    it('el diálogo dice qué pasa (cancela, devuelve y quita PRO) y revocar llama al backend', async () => {
      const { buttons, fixture, http, text, host } = await plansPage(WITHDRAWABLE());
      buttons('Botón de arrepentimiento')[0].click();
      fixture.detectChanges();
      expect(text()).toContain('Revocar la contratación de PRO');
      expect(text()).toContain('no se vuelve a cobrar');
      expect(host.querySelector('[data-testid="withdraw-refund"]')?.textContent).toContain('Te devolvemos $15.000');
      expect(text()).toContain('volvés a Free');
      expect(text()).toContain('Tu perfil, reseñas y datos no se eliminan.');
      buttons('Revocar contratación')[0].click();
      http.expectOne({ method: 'POST', url: `${API}/billing/pro/withdraw` }).flush(
        status({
          canCheckout: true,
          hadSubscription: true,
          subscription: sub({ status: 'CANCELLED', nextPaymentAt: null, withdrawnAt: new Date().toISOString(), refundAmount: 15000 }),
        }),
      );
      await flush();
      fixture.detectChanges();
      expect(host.querySelector('[data-testid="withdrawn-title"]')?.textContent).toContain('Revocaste tu contratación');
      expect(host.querySelector('[data-testid="refund-done"]')?.textContent).toContain('Te devolvimos $15.000');
      expect(buttons('Botón de arrepentimiento')).toHaveLength(0);
      expect(buttons('Dejar de renovar')).toHaveLength(0);
    });

    it('reembolso pendiente: avisa que la devolución está en curso', async () => {
      const { host } = await plansPage(
        status({
          subscription: sub({ status: 'CANCELLED', nextPaymentAt: null, withdrawnAt: new Date().toISOString(), refundAmount: 15000, refundPending: true }),
        }),
      );
      expect(host.querySelector('[data-testid="refund-pending"]')?.textContent).toContain('Estamos procesando la devolución de $15.000');
    });

    it('plazo vencido (409): avisa y relee el estado', async () => {
      const { buttons, fixture, http, toast } = await plansPage(WITHDRAWABLE());
      buttons('Botón de arrepentimiento')[0].click();
      fixture.detectChanges();
      buttons('Revocar contratación')[0].click();
      http
        .expectOne({ method: 'POST', url: `${API}/billing/pro/withdraw` })
        .flush({ code: 'BILLING_WITHDRAWAL_EXPIRED', message: 'x' }, { status: 409, statusText: 'Conflict' });
      await flush();
      expect(toast.show).toHaveBeenCalledWith(BILLING_MESSAGES.withdrawExpired, 3600, 'info');
      http.expectOne({ method: 'GET', url: `${API}/billing/pro/status` }).flush(ACTIVE);
    });
  });

  it('PRO manual sin suscripción: sin botón de Mercado Pago', async () => {
    const { host, buttons } = await plansPage(
      status({ plan: 'PRO', source: 'MANUAL', entitlements: ent(true), canCheckout: false, checkoutPrice: null }),
    );
    expect(host.querySelector('[data-testid="subscription-panel"]')).toBeNull();
    expect(buttons('Dejar de renovar')).toHaveLength(0);
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
    const acquisitionHttp = TestBed.inject(HttpTestingController);
      acquisitionHttp.match(req => (req.url.includes('/pro/acquisition/') || req.url.endsWith('/billing/transfer'))).forEach(req => req.flush({ enabled: false, available: false }));
      flushMonth(acquisitionHttp); acquisitionHttp.verify();
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

describe('intento 6 con billing', () => {
  afterEach(() => (flushMonth(TestBed.inject(HttpTestingController)), TestBed.inject(HttpTestingController).verify()));

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
    const cta = [...document.querySelectorAll('button')].find((b) => b.textContent!.trim() === 'Quiero Resuelve PRO')!;
    cta.click();
    const req = http.expectOne({ method: 'POST', url: `${API}/billing/pro/checkout` });
    expect(req.request.body).toEqual({ returnTo: '/pro/solicitudes/req-9/presupuesto' });
    req.flush({ checkoutUrl: 'https://mp.test/checkout/9', subscriptionId: 's9' });
    await flush();
    expect(navigate).toHaveBeenCalledWith('https://mp.test/checkout/9');
    fixture.destroy();
  });
});
