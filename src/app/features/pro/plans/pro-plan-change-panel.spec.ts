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

describe('Cambio de plan a PRO (Mi plan)', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('con la función apagada (el backend no manda la opción) no dibuja nada', () => {
    const { el, q } = render(status({ options: null }));
    expect(q('plan-change-offer')).toBeNull();
    expect(q('plan-change')).toBeNull();
    expect(el.querySelector('#cambio-de-plan')).toBeNull();
  });

  it('no ofrece un nuevo cambio aunque un cliente viejo reciba opciones Plus', () => {
    const { q, http } = render(status());
    expect(q('plan-change-offer')).toBeNull();
    http.expectNone((r) => r.method !== 'GET');
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

    it('CONFIRMADO: Mercado Pago ya informa el monto nuevo y la fecha es "prevista"; PRO sigue sin estar activo', () => {
      const { el, q } = render(status({ planChange: change() }));
      expect(step(el, 'confirmed').getAttribute('data-done')).toBe('true');
      expect(step(el, 'confirmed').textContent).toContain('Próximo cobro previsto: 12 de noviembre');
      expect(step(el, 'active').getAttribute('data-done')).toBe('false');
      expect(step(el, 'active').textContent).toContain('El importe acordado rige cuando el cobro figure aprobado');
      expect(q('plan-change-renewal')!.textContent).toContain('Si el cobro no se aprueba, el nuevo importe no entra en vigencia. Tu acceso a PRO sigue las condiciones vigentes de tu suscripción.');
      expect(q('plan-change-title')!.textContent).toContain('Tu próximo período de PRO');
      expect(el.textContent).not.toMatch(/seguís con PRO sin cambios|Si ese cobro no se aprueba, seguís/);
    });

    it('DESCARTANDO: se vuelve al monto anterior y no hay botón para descartar de nuevo', () => {
      const { q, el } = render(status({ planChange: change({ state: 'REVERTING' }) }));
      expect(q('plan-change')!.getAttribute('data-state')).toBe('REVERTING');
      expect(q('plan-change-discard')).toBeNull();
      // El encabezado no sigue anunciando el cambio ni afirma que ya quedó cancelado.
      const title = q('plan-change-title')!.textContent!;
      expect(title).toContain('Estamos cancelando el cambio de cobro');
      expect(title).not.toContain('Pasás a PRO');
      expect(q('plan-change-renewal')!.textContent).toContain('Hasta que lo confirme, el cambio sigue en curso');
      expect(el.textContent).not.toMatch(/Tu plan sigue siendo PRO hasta que se apruebe|cambio cancelado|Cancelamos tu cambio/);
      expect(step(el, 'confirmed').textContent).toContain('Todavía no está confirmado');
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
      expect(q('plan-change-offer')).toBeNull();
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
    it('PRO confirmado que empieza más adelante: fecha de inicio, sin perder días ni renovación automática', () => {
      const { q } = render(null, { plusStartsAt: '2026-11-20T03:00:00.000Z' });
      const t = q('plan-change-transfer')!;
      expect(t.textContent).toContain('PRO empieza el 20 de noviembre');
      expect(t.textContent).toContain('no perdés ningún día ya pagado');
      expect(t.textContent).toContain('No se renueva solo');
    });

    it('sin Plus programado no hay tarjeta', () => {
      const { q } = render(null, { plusStartsAt: null });
      expect(q('plan-change-transfer')).toBeNull();
    });
  });
});
