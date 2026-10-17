import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { API_URL } from '../../../core/api/api.config';
import { BillingStatus, BillingSubscription, PlanChange, PlanChangeOptions } from '../../../core/models/billing';
import { TransferOverview } from '../../../core/models/transfer';
import { ToastService } from '../../../core/services/toast.service';
import { BILLING_MESSAGES, BillingStore } from '../../../core/state/billing.store';
import { ProStore } from '../../../core/state/pro.store';
import { TransferStore } from '../../../core/state/transfer.store';
import { ProPlanChangePanel } from './pro-plan-change-panel';

const API = 'http://api.test/api/v1';
const flush = () => new Promise((r) => setTimeout(r));
const NEXT = '2026-11-12T15:00:00.000Z';

const OPTIONS: PlanChangeOptions = {
  available: true,
  reason: null,
  tier: 'PRO_PLUS',
  amount: 24900,
  currency: 'ARS',
  nextPaymentAt: NEXT,
  minHoursBeforeCharge: 24,
};
const change = (patch: Partial<PlanChange> = {}): PlanChange => ({
  state: 'CONFIRMED',
  tier: 'PRO_PLUS',
  amount: 24900,
  currency: 'ARS',
  requestedAt: '2026-10-20T12:00:00.000Z',
  confirmedAt: '2026-10-20T12:00:01.000Z',
  effectiveAt: NEXT,
  ...patch,
});
const subscription = (planChange: PlanChange | null = null): BillingSubscription => ({
  id: 's1',
  status: 'ACTIVE',
  provider: 'MERCADO_PAGO',
  planTier: 'PRO',
  currentAmount: 15000,
  baseAmount: 15000,
  currency: 'ARS',
  nextPaymentAt: NEXT,
  accessUntil: null,
  graceUntil: null,
  checkoutUrl: null,
  withdrawableUntil: null,
  refundAmount: 0,
  withdrawnAt: null,
  refundPending: false,
  planChange,
  offerCode: null,
  offerRedeemed: false,
  returnPath: null,
  createdAt: '2026-10-12T12:00:00.000Z',
});
const status = (opts: { options?: PlanChangeOptions | null; planChange?: PlanChange | null } = {}): BillingStatus =>
  ({
    enabled: true,
    plan: 'PRO',
    source: 'BILLING',
    entitlements: {} as BillingStatus['entitlements'],
    subscription: subscription(opts.planChange ?? null),
    canCheckout: false,
    checkoutPrice: null,
    planChangeOptions: opts.options === undefined ? OPTIONS : opts.options,
    hadSubscription: true,
  }) as BillingStatus;

function render(initial: BillingStatus | null, transfer: Partial<TransferOverview> | null = null) {
  const toast = { show: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_URL, useValue: API },
      { provide: ToastService, useValue: toast },
      { provide: ProStore, useValue: { plan: signal({ tier: 'PRO', source: 'BILLING' }), refreshProfile: vi.fn() } },
    ],
  });
  const billing = TestBed.inject(BillingStore);
  if (initial) billing.status.set(initial);
  if (transfer) TestBed.inject(TransferStore).overview.set({ available: true, ...transfer } as TransferOverview);
  const http = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(ProPlanChangePanel);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const q = (testid: string) => el.querySelector<HTMLElement>(`[data-testid="${testid}"]`);
  return { fixture, el, q, http, billing, toast };
}

describe('Cambio de plan a PRO Plus (Mi plan)', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('con la función apagada (el backend no manda la opción) no dibuja nada', () => {
    const { el, q } = render(status({ options: null }));
    expect(q('plan-change-offer')).toBeNull();
    expect(q('plan-change')).toBeNull();
    expect(el.querySelector('#cambio-de-plan')).toBeNull();
  });

  describe('confirmación antes de pedir', () => {
    it('muestra precio, fecha prevista del cobro, cuándo empieza Plus y qué pasa con la renovación; nada de eso es una garantía', async () => {
      const { fixture, q } = render(status());
      expect(q('plan-change-offer')).not.toBeNull();
      q('plan-change-open')!.click();
      fixture.detectChanges();
      const text = q('plan-change-summary')!.textContent!.replace(/\s+/g, ' ');
      expect(text).toContain('$24.900 por mes');
      expect(text).toContain('Próximo cobro previsto');
      expect(text).toContain('12 de noviembre');
      expect(text).toContain('Cuando ese cobro figure aprobado. Hasta entonces seguís con PRO.');
      expect(text).toContain('Desde ese cobro se renueva cada mes a $24.900, hasta que dejes de renovar.');
      const dialog = fixture.nativeElement.querySelector('app-dialog') as HTMLElement;
      expect(dialog.textContent).toContain('Hoy no se cobra nada ni se descuenta nada del período que ya pagaste');
      expect(dialog.textContent).toContain('es una previsión');
    });

    it('confirmar pide el cambio una sola vez aunque se haga doble click, y queda solicitado/confirmado sin dar Plus por activo', async () => {
      const { fixture, q, http, billing, toast } = render(status());
      q('plan-change-open')!.click();
      fixture.detectChanges();
      const confirm = q('plan-change-confirm') as HTMLButtonElement;
      confirm.click();
      confirm.click();
      fixture.detectChanges();
      expect(billing.changingPlan()).toBe(true);
      expect(confirm.disabled).toBe(true);
      const req = http.expectOne(`${API}/billing/pro/plan-change`);
      expect(req.request.body).toEqual({}); // el monto nunca viaja desde el navegador
      req.flush(status({ planChange: change() }));
      await flush();
      fixture.detectChanges();
      expect(toast.show).toHaveBeenCalledWith(BILLING_MESSAGES.planChangeConfirmed, 3600, 'info');
      expect(q('plan-change')!.getAttribute('data-state')).toBe('CONFIRMED');
      expect(billing.changingPlan()).toBe(false);
    });

    it.each([
      ['PLAN_CHANGE_TOO_CLOSE', 409, BILLING_MESSAGES.planChangeTooClose],
      ['PLAN_CHANGE_NOT_ALLOWED', 409, BILLING_MESSAGES.planChangeNotAllowed],
      ['PLAN_CHANGE_NOT_AVAILABLE', 503, BILLING_MESSAGES.planChangeNotAvailable],
      ['BILLING_PROVIDER_ERROR', 502, BILLING_MESSAGES.planChangeRejected],
    ])('si el backend responde %s no se muestra ningún cambio y se explica', async (code, httpStatus, message) => {
      const { fixture, q, http, toast } = render(status());
      q('plan-change-open')!.click();
      fixture.detectChanges();
      q('plan-change-confirm')!.click();
      http.expectOne(`${API}/billing/pro/plan-change`).flush({ code, message: 'x' }, { status: httpStatus, statusText: 'x' });
      await flush();
      // El estado se relee del backend (nada queda como "hecho" por haberlo pedido).
      http.expectOne(`${API}/billing/pro/status`).flush(status());
      await flush();
      fixture.detectChanges();
      expect(toast.show).toHaveBeenCalledWith(message, 4200, 'info');
      expect(q('plan-change')).toBeNull();
      expect(q('plan-change-offer')).not.toBeNull();
    });

    it.each([
      ['TOO_CLOSE', 'Tu próximo cobro es muy pronto'],
      ['OFFER_PENDING', 'después de tu próximo cobro'],
    ] as const)('sin margen o con el precio de bienvenida pendiente (%s) se explica y no hay botón', (reason, text) => {
      const { q } = render(status({ options: { ...OPTIONS, available: false, reason } }));
      expect(q('plan-change-open')).toBeNull();
      expect(q('plan-change-blocked')!.textContent).toContain(text);
    });
  });

  describe('estados: solicitado, confirmado por el proveedor y activo (siempre por separado)', () => {
    const step = (el: HTMLElement, key: string) => el.querySelector<HTMLElement>(`[data-step="${key}"]`)!;

    it('SOLICITADO: guardado, esperando a Mercado Pago; no está confirmado ni activo y no promete fecha', () => {
      const { el, q } = render(status({ planChange: change({ state: 'REQUESTED', confirmedAt: null, effectiveAt: null }) }));
      expect(q('plan-change')!.getAttribute('data-state')).toBe('REQUESTED');
      expect(step(el, 'requested').getAttribute('data-done')).toBe('true');
      expect(step(el, 'confirmed').getAttribute('data-done')).toBe('false');
      expect(step(el, 'confirmed').getAttribute('aria-current')).toBe('step');
      expect(step(el, 'confirmed').textContent).toContain('Esperando que Mercado Pago lo confirme');
      expect(step(el, 'active').getAttribute('data-done')).toBe('false');
      expect(el.textContent).not.toMatch(/previsto:/);
    });

    it('CONFIRMADO: Mercado Pago ya informa el monto nuevo y la fecha es "prevista"; PRO Plus sigue sin estar activo', () => {
      const { el, q } = render(status({ planChange: change() }));
      expect(step(el, 'confirmed').getAttribute('data-done')).toBe('true');
      expect(step(el, 'confirmed').textContent).toContain('Próximo cobro previsto: 12 de noviembre');
      expect(step(el, 'active').getAttribute('data-done')).toBe('false');
      expect(step(el, 'active').textContent).toContain('Rige cuando el cobro de PRO Plus figure aprobado');
      expect(q('plan-change-renewal')!.textContent).toContain('Si ese cobro no se aprueba, seguís con PRO');
    });

    it('DESCARTANDO: se vuelve al monto anterior y no hay botón para descartar de nuevo', () => {
      const { q, el } = render(status({ planChange: change({ state: 'REVERTING' }) }));
      expect(q('plan-change')!.getAttribute('data-state')).toBe('REVERTING');
      expect(q('plan-change-discard')).toBeNull();
      expect(step(el, 'confirmed').textContent).toContain('volviendo al monto anterior');
    });

    it('descartar pide cancelar el cambio (una sola vez) y vuelve la oferta', async () => {
      const { fixture, q, http, toast } = render(status({ planChange: change() }));
      const discard = q('plan-change-discard') as HTMLButtonElement;
      discard.click();
      discard.click();
      http.expectOne(`${API}/billing/pro/plan-change/cancel`).flush(status());
      await flush();
      fixture.detectChanges();
      expect(toast.show).toHaveBeenCalledWith(BILLING_MESSAGES.planChangeDiscarded, 3200, 'info');
      expect(q('plan-change')).toBeNull();
      expect(q('plan-change-offer')).not.toBeNull();
    });

    it('si descartar falla, se relee el estado y se avisa', async () => {
      const { fixture, q, http, toast } = render(status({ planChange: change() }));
      q('plan-change-discard')!.click();
      http.expectOne(`${API}/billing/pro/plan-change/cancel`).flush({ code: 'X' }, { status: 502, statusText: 'x' });
      await flush();
      http.expectOne(`${API}/billing/pro/status`).flush(status({ planChange: change() }));
      await flush();
      fixture.detectChanges();
      expect(toast.show).toHaveBeenCalledWith(BILLING_MESSAGES.planChangeDiscardFailed, 3600, 'info');
      expect(q('plan-change')).not.toBeNull();
    });

    it('al activarse Plus el cambio deja de ser pendiente: la tarjeta desaparece y manda el plan de la cuenta', async () => {
      const { fixture, q, billing } = render(status({ planChange: change() }));
      expect(q('plan-change')).not.toBeNull();
      billing.status.set({ ...status({ options: null }), plan: 'PRO_PLUS', subscription: { ...subscription(null), planTier: 'PRO_PLUS', currentAmount: 24900 } });
      fixture.detectChanges();
      expect(q('plan-change')).toBeNull();
      expect(q('plan-change-offer')).toBeNull();
    });
  });

  describe('transferencia', () => {
    it('PRO Plus confirmado que empieza más adelante: fecha de inicio, sin perder días ni renovación automática', () => {
      const { q } = render(null, { plusStartsAt: '2026-11-20T03:00:00.000Z' });
      const t = q('plan-change-transfer')!;
      expect(t.textContent).toContain('PRO Plus empieza el 20 de noviembre');
      expect(t.textContent).toContain('no perdés ningún día ya pagado');
      expect(t.textContent).toContain('No se renueva solo');
    });

    it('sin Plus programado no hay tarjeta', () => {
      const { q } = render(null, { plusStartsAt: null });
      expect(q('plan-change-transfer')).toBeNull();
    });
  });
});
