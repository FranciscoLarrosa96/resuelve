import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { API_URL } from '../../../core/api/api.config';
import { TransferOverview, TransferPayment } from '../../../core/models/transfer';
import { ToastService } from '../../../core/services/toast.service';
import { ProStore } from '../../../core/state/pro.store';
import { TRANSFER_MESSAGES } from '../../../core/state/transfer.store';
import { ProTransferPanel } from './pro-transfer-panel';

const API = 'http://api.test/api/v1';
const flush = () => new Promise((r) => setTimeout(r));
const ACCOUNT = { holder: 'Francisco Larrosa', alias: 'resuelve.pro', cbu: '2850590940090418135201', bank: 'Banco Macro', cuit: '20-39550730-4' };
const OPTIONS: TransferOverview['options'] = [
  { months: 1, days: 30, amountArs: 15000, basePriceArs: 15000, discountedFirstMonthArs: null, offerCode: null },
  { months: 3, days: 90, amountArs: 45000, basePriceArs: 15000, discountedFirstMonthArs: null, offerCode: null },
  { months: 6, days: 180, amountArs: 90000, basePriceArs: 15000, discountedFirstMonthArs: null, offerCode: null },
];
const payment = (patch: Partial<TransferPayment> = {}): TransferPayment => ({
  id: 't1',
  reference: 'RES-7F3K9Q',
  status: 'AWAITING_PROOF',
  months: 3,
  amountArs: 45000,
  basePriceArs: 15000,
  offerCode: null,
  proofUploaded: false,
  rejectionReason: null,
  periodStart: null,
  periodEnd: null,
  reviewedAt: null,
  withdrawnAt: null,
  refundedAt: null,
  createdAt: '2026-10-09T12:00:00.000Z',
  ...patch,
});
const overview = (patch: Partial<TransferOverview> = {}): TransferOverview => ({
  available: true,
  account: ACCOUNT,
  blocked: null,
  options: OPTIONS,
  pending: null,
  last: null,
  recentOutcome: null,
  proUntil: null,
  withdrawal: null,
  refundPending: null,
  proofUploads: true,
  ...patch,
});

async function render(o: TransferOverview, opts: { collapsible?: boolean } = {}) {
  const plan = signal({ tier: 'FREE', source: null, expiresAt: null });
  const pro = {
    plan,
    hasPro: computed(() => plan().tier === 'PRO'),
    refreshProfile: vi.fn(),
    proTrial: signal(null), trialSummary: signal(null), loadTrialSummary: async () => null, startingTrial: signal(false),
  };
  const toast = { show: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_URL, useValue: API },
      { provide: ProStore, useValue: pro },
      { provide: ToastService, useValue: toast },
    ],
  });
  const http = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(ProTransferPanel);
  if (opts.collapsible) fixture.componentRef.setInput('collapsible', true);
  fixture.detectChanges();
  http.expectOne(`${API}/billing/transfer`).flush(o);
  await flush();
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const button = (label: string) =>
    Array.from(el.querySelectorAll<HTMLButtonElement>('button')).find((b) => (b.textContent ?? '').trim() === label);
  return { fixture, http, el, button, pro, toast };
}

describe('Pagar por transferencia (Mi plan)', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  describe('desplegable "Prefiero pagar por transferencia" (con Mercado Pago)', () => {
    it('sin nada en curso arranca cerrado, con la condición a la vista, y se abre con teclado o click', async () => {
      const { fixture, el } = await render(overview(), { collapsible: true });
      const toggle = el.querySelector<HTMLButtonElement>('[data-testid="transfer-toggle"]')!;
      expect(toggle.textContent).toContain('Prefiero pagar por transferencia');
      expect(toggle.textContent).toContain('1, 3 o 6 meses por adelantado, al mismo precio. No se renueva solo.');
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
      expect(el.querySelector('#transfer-body')).toBeNull();
      expect(el.querySelector('#transferencia')).not.toBeNull();

      toggle.click();
      fixture.detectChanges();
      expect(toggle.getAttribute('aria-expanded')).toBe('true');
      expect(toggle.getAttribute('aria-controls')).toBe('transfer-body');
      expect(el.querySelector('#transfer-body')!.textContent).toContain('Ver datos para transferir');
      expect(el.querySelectorAll('input[name="transfer-months"]')).toHaveLength(3);
    });

    it('expand() (enlace del hero) lo abre', async () => {
      const { fixture, el } = await render(overview(), { collapsible: true });
      fixture.componentInstance.expand();
      fixture.detectChanges();
      expect(el.querySelector('#transfer-body')).not.toBeNull();
    });

    it('con un pago en curso o el arrepentimiento vigente nunca se esconde', async () => {
      for (const o of [
        overview({ pending: payment() }),
        overview({ withdrawal: { paymentId: 't1', until: '2026-10-20T03:00:00.000Z', amountArs: 45000 } }),
        overview({ recentOutcome: payment({ status: 'REJECTED' }) }),
      ]) {
        TestBed.resetTestingModule();
        const { el } = await render(o, { collapsible: true });
        expect(el.querySelector('[data-testid="transfer-toggle"]')).toBeNull();
        expect(el.querySelector('#transfer-body')).not.toBeNull();
        TestBed.inject(HttpTestingController).verify();
      }
    });

    it('sin collapsible (solo transferencia) se muestra abierto, como siempre', async () => {
      const { el } = await render(overview());
      expect(el.querySelector('[data-testid="transfer-toggle"]')).toBeNull();
      expect(el.textContent).toContain('Ver datos para transferir');
    });
  });

  it('sin datos bancarios o con Mercado Pago activo no aparece', async () => {
    const off = await render(overview({ available: false, account: null, options: [] }));
    expect(off.el.querySelector('[data-testid="transfer-panel"]')).toBeNull();
    TestBed.resetTestingModule();
    const mp = await render(overview({ blocked: 'SUBSCRIPTION_ACTIVE', options: [] }));
    expect(mp.el.querySelector('[data-testid="transfer-panel"]')).toBeNull();
  });

  it('elige el período (el monto lo da el backend) y pide los datos', async () => {
    const { el, http, fixture } = await render(overview());
    const text = el.textContent!.replace(/\s+/g, ' ');
    expect(text).toContain('1 mes');
    expect(text).toContain('$15.000');
    expect(text).toContain('$45.000');
    expect(text).toContain('$90.000');
    expect(text).toContain('No se renueva solo');
    const radios = el.querySelectorAll<HTMLInputElement>('input[type="radio"]');
    radios[1].dispatchEvent(new Event('change'));
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('[data-testid="transfer-request"]')!.click();
    const req = http.expectOne(`${API}/billing/transfer`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ months: 3 }); // nunca un monto
    req.flush(overview({ pending: payment(), options: [] }));
    await flush();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="transfer-amount"]')!.textContent).toContain('$45.000');
    expect(el.querySelector('[data-testid="transfer-reference"]')!.textContent).toBe('RES-7F3K9Q');
    expect(el.querySelector('[data-testid="transfer-alias"]')!.textContent).toBe('resuelve.pro');
    expect(el.textContent).toContain('2850590940090418135201');
  });

  it('"Ya transferí" sin comprobante pasa a revisión', async () => {
    const { el, http, fixture, toast } = await render(overview({ pending: payment(), options: [] }));
    el.querySelector<HTMLButtonElement>('[data-testid="transfer-submit"]')!.click();
    const req = http.expectOne(`${API}/billing/transfer/submit`);
    expect(req.request.body).toEqual({});
    req.flush(overview({ pending: payment({ status: 'IN_REVIEW' }), options: [] }));
    await flush();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="transfer-in-review"]')).not.toBeNull();
    expect(toast.show).toHaveBeenCalledWith(TRANSFER_MESSAGES.submitted, 3600, 'info');
  });

  it('un comprobante con formato no permitido no se sube', async () => {
    const { el, fixture, toast } = await render(overview({ pending: payment(), options: [] }));
    const input = el.querySelector<HTMLInputElement>('#transfer-proof')!;
    const file = new File(['x'], 'virus.exe', { type: 'application/x-msdownload' });
    Object.defineProperty(input, 'files', { value: [file] });
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('[data-testid="transfer-submit"]')!.click();
    await flush();
    expect(toast.show).toHaveBeenCalledWith(TRANSFER_MESSAGES.invalidFile, 3600, 'info');
  });

  it('rechazo: aviso en rojo con el motivo y vuelve a ofrecer los períodos', async () => {
    const rejected = payment({ status: 'REJECTED', rejectionReason: 'No encontramos una transferencia con ese código.' });
    const { el } = await render(overview({ last: rejected, recentOutcome: rejected }));
    const card = el.querySelector('[data-testid="transfer-rejected"]')!;
    expect(card.textContent).toContain('Motivo: No encontramos una transferencia con ese código.');
    expect(card.className).toContain('bg-danger-soft');
    expect(el.querySelector('[data-testid="transfer-request"]')).not.toBeNull();
  });

  it('confirmada: aviso en verde con el período', async () => {
    const approved = payment({ status: 'APPROVED', months: 1, periodEnd: '2026-11-08T12:00:00.000Z' });
    const { el } = await render(overview({ last: approved, recentOutcome: approved }));
    const card = el.querySelector('[data-testid="transfer-approved"]')!;
    expect(card.textContent).toContain('Confirmamos tu transferencia RES-7F3K9Q.');
    expect(card.textContent).toContain('1 mes de Resuelve PRO, hasta el');
    expect(card.className).toContain('bg-success-soft');
  });

  it('pasados los 7 días (sin recentOutcome) el rechazo ya no se muestra', async () => {
    const { el } = await render(overview({ last: payment({ status: 'REJECTED', rejectionReason: 'Viejo' }) }));
    expect(el.querySelector('[data-testid="transfer-rejected"]')).toBeNull();
    expect(el.textContent).not.toContain('Viejo');
  });

  it('"Entendido" oculta el aviso y lo recuerda; un rechazo nuevo se vuelve a mostrar', async () => {
    const first = payment({ id: 't1', status: 'REJECTED' });
    const { el, fixture, button } = await render(overview({ last: first, recentOutcome: first }), { collapsible: true });
    expect(el.querySelector('[data-testid="transfer-toggle"]')).toBeNull();
    button('Entendido')!.click();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="transfer-rejected"]')).toBeNull();
    // Sin el aviso, el desplegable vuelve a arrancar cerrado.
    expect(el.querySelector('[data-testid="transfer-toggle"]')).not.toBeNull();
    expect(localStorage.getItem('resuelve-transfer-outcome-dismissed')).toBe('t1');
    TestBed.inject(HttpTestingController).verify();

    TestBed.resetTestingModule();
    const again = await render(overview({ last: first, recentOutcome: first }));
    expect(again.el.querySelector('[data-testid="transfer-rejected"]')).toBeNull();
    TestBed.inject(HttpTestingController).verify();

    TestBed.resetTestingModule();
    const second = payment({ id: 't2', reference: 'RES-AAAAAA', status: 'REJECTED' });
    const next = await render(overview({ last: second, recentOutcome: second }));
    expect(next.el.querySelector('[data-testid="transfer-rejected"]')!.textContent).toContain('RES-AAAAAA');
  });

  it('arrepentimiento: pide alias o CBU válido y revoca', async () => {
    const { el, http, fixture, button } = await render(
      overview({ withdrawal: { paymentId: 't1', amountArs: 45000, until: '2026-10-19T12:00:00.000Z' }, proUntil: '2026-11-08T12:00:00.000Z' }),
    );
    expect(el.querySelector('[data-testid="transfer-withdraw"]')!.textContent).toContain('$45.000');
    button('Botón de arrepentimiento')!.click();
    fixture.detectChanges();
    const input = document.querySelector<HTMLInputElement>('#refund-to')!;
    input.value = 'a b';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await flush();
    const revoke = () =>
      Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((b) => (b.textContent ?? '').trim() === 'Revocar pago')!;
    expect(revoke().disabled).toBe(true);
    input.value = 'mi.alias.mp';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();
    expect(revoke().disabled).toBe(false);
    revoke().click();
    const req = http.expectOne(`${API}/billing/transfer/withdraw`);
    expect(req.request.body).toEqual({ refundTo: 'mi.alias.mp', paymentId: 't1' });
    req.flush(overview({ refundPending: { amountArs: 45000, withdrawnAt: '2026-10-10T12:00:00.000Z' } }));
    await flush();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="transfer-refund-pending"]')!.textContent).toContain('$45.000');
  });
  describe('arrepentimiento de un PRO Plus programado', () => {
    const plus = (periodState: 'NOT_STARTED' | 'STARTED') => ({
      paymentId: 't2',
      amountArs: 24900,
      until: '2026-10-28T12:00:00.000Z',
      planTier: 'PRO_PLUS' as const,
      reference: 'RES-PLUSAA',
      startsAt: '2026-11-05T12:00:00.000Z',
      endsAt: '2026-12-05T12:00:00.000Z',
      periodState,
    });

    it('Plus que no empezó: devuelve el total y aclara que el acceso de hoy y el PRO pagado no cambian', async () => {
      const { el, button, fixture } = await render(overview({ withdrawal: plus('NOT_STARTED'), proUntil: '2026-12-05T12:00:00.000Z' }));
      const text = el.querySelector('[data-testid="transfer-withdraw"]')!.textContent!;
      expect(text).toContain('PRO Plus');
      expect(text).toContain('$24.900');
      expect(text).toContain('Te devolvemos el total de ese pago');
      expect(text).toContain('todavía no empezó');
      expect(text).toContain('no cambian');
      expect(text).not.toContain('quitamos esos días');
      button('Botón de arrepentimiento')!.click();
      fixture.detectChanges();
      const dialog = document.querySelector('#transfer-withdraw-text')!.textContent!;
      expect(dialog).toContain('todavía no empezó');
      expect(dialog).toContain('código de arrepentimiento');
      expect(dialog).toContain('a mano');
    });

    it('Plus que ya empezó (confirmación tardía): termina en el acto y no se descuentan los días usados', async () => {
      const { el } = await render(overview({ withdrawal: plus('STARTED') }));
      const text = el.querySelector('[data-testid="transfer-withdraw"]')!.textContent!;
      expect(text).toContain('termina en el acto');
      expect(text).toContain('no descontamos los días que ya usaste');
      expect(text).not.toContain('todavía no empezó');
    });

    it('con un Plus programado detrás, el pago anterior se puede pedir: queda registrado con su fecha y avisa que lo resuelve el equipo', async () => {
      const prev = {
        paymentId: 't1',
        amountArs: 15000,
        until: '2026-10-27T12:00:00.000Z',
        planTier: 'PRO' as const,
        reference: 'RES-PROAAA',
        startsAt: '2026-10-17T12:00:00.000Z',
        endsAt: '2026-11-16T12:00:00.000Z',
        periodState: 'STARTED' as const,
        deferred: true,
        requestedAt: null,
      };
      const { el, http, fixture, button } = await render(
        overview({ withdrawal: plus('NOT_STARTED'), withdrawals: [{ ...plus('NOT_STARTED'), deferred: false, requestedAt: null }, prev] }),
      );
      const items = el.querySelectorAll('[data-testid="transfer-withdraw-item"]');
      expect(items).toHaveLength(2);
      expect(items[1].textContent).toContain('dependen de este');
      expect(items[1].textContent).toContain('no anulamos tus otros pagos');
      Array.from(items[1].querySelectorAll('button')).find((b) => b.textContent!.trim() === 'Botón de arrepentimiento')!.click();
      fixture.detectChanges();
      const dialog = document.querySelector('#transfer-withdraw-text')!.textContent!;
      expect(dialog).toContain('esa fecha es la que cuenta para el plazo');
      expect(dialog).toContain('no anulamos tus otros pagos');
      const input = document.querySelector<HTMLInputElement>('#refund-to')!;
      input.value = 'mi.alias.mp';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      await flush();
      fixture.detectChanges();
      const submit = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((b) => (b.textContent ?? '').trim() === 'Registrar solicitud')!;
      expect(button('Revocar pago')).toBeFalsy();
      submit.click();
      const req = http.expectOne(`${API}/billing/transfer/withdraw`);
      expect(req.request.body).toEqual({ refundTo: 'mi.alias.mp', paymentId: 't1' });
      req.flush(overview({ withdrawals: [{ ...prev, requestedAt: '2026-10-20T12:00:00.000Z' }] }));
      await flush();
      fixture.detectChanges();
      const after = el.querySelector('[data-testid="transfer-withdraw-item"]')!.textContent!;
      expect(after).toContain('Solicitud en trámite');
      expect(after).toContain('RES-PROAAA');
      expect(after).toContain('tu acceso no cambia');
      expect(el.querySelector('[data-testid="transfer-withdraw-item"] button')).toBeNull(); // no se puede repetir
    });

    it('una solicitud hecha a tiempo sigue visible con su fecha y código aunque el plazo ya haya vencido (y no ofrece iniciar otra)', async () => {
      const requested = {
        paymentId: 't1',
        amountArs: 15000,
        until: '2026-10-01T12:00:00.000Z', // vencido
        planTier: 'PRO' as const,
        reference: 'RES-PROAAA',
        startsAt: '2026-09-21T12:00:00.000Z',
        endsAt: '2026-10-21T12:00:00.000Z',
        periodState: 'STARTED' as const,
        deferred: true,
        requestedAt: '2026-09-30T12:00:00.000Z',
        canRequest: false,
      };
      const { el } = await render(overview({ withdrawal: null, withdrawals: [requested] }));
      const box = el.querySelector('[data-testid="transfer-withdraw"]')!;
      expect(box).toBeTruthy(); // recarga de Mi plan: no desaparece
      expect(box.textContent).toContain('Solicitud en trámite');
      expect(box.textContent).toContain('RES-PROAAA');
      expect(box.textContent).toContain('30 de septiembre');
      expect(box.textContent).toContain('que el plazo termine no la cancela');
      expect(box.textContent).not.toContain('¿Te arrepentiste?');
      expect(box.querySelector('button')).toBeNull();
    });

    it('después de revocar muestra el código de arrepentimiento', async () => {
      const { el } = await render(
        overview({ refundPending: { amountArs: 24900, withdrawnAt: '2026-10-20T12:00:00.000Z', reference: 'RES-PLUSAA', planTier: 'PRO_PLUS' } }),
      );
      const text = el.querySelector('[data-testid="transfer-refund-pending"]')!.textContent!;
      expect(text).toContain('PRO Plus');
      expect(text).toContain('RES-PLUSAA');
      expect(text).toContain('$24.900');
    });
  });

  describe('cambio programado a PRO Plus (PRO por transferencia vigente)', () => {
    const PLUS = (startsNow = false): TransferOverview['options'] =>
      [1, 3, 6].map((months) => ({
        months: months as 1 | 3 | 6,
        days: months * 30,
        amountArs: 24900 * months,
        basePriceArs: 24900,
        discountedFirstMonthArs: null,
        offerCode: null,
        startsAt: '2026-11-20T15:00:00.000Z',
        endsAt: new Date(Date.parse('2026-11-20T15:00:00.000Z') + months * 30 * 86_400_000).toISOString(),
        startsNow,
      }));
    const withPlus = (patch: Partial<TransferOverview> = {}) =>
      overview({ plusOptions: PLUS(), currentTier: 'PRO', scheduledPlus: true, proUntil: '2026-11-20T15:00:00.000Z', ...patch });
    const pickPlus = (fixture: { detectChanges: () => void }, el: HTMLElement) => {
      const select = el.querySelector<HTMLSelectElement>('#transfer-tier')!;
      select.value = 'PRO_PLUS';
      select.dispatchEvent(new Event('change'));
      fixture.detectChanges();
    };

    it('antes de pedir muestra precio, fecha prevista de inicio, qué pasa hasta entonces y la renovación', async () => {
      const { fixture, el } = await render(withPlus());
      expect(el.querySelector('[data-testid="transfer-plan-change-summary"]')).toBeNull(); // con PRO elegido no aparece
      pickPlus(fixture, el);
      const text = el.querySelector('[data-testid="transfer-plan-change-summary"]')!.textContent!.replace(/\s+/g, ' ');
      expect(text).toContain('$24.900');
      expect(text).toContain('por 1 mes, pago único');
      expect(text).toContain('PRO Plus empieza (fecha prevista)');
      expect(text).toContain('20 de noviembre de 2026');
      expect(text).toContain('Seguís con PRO. No perdés ningún día ya pagado.');
      expect(text).toContain('No se renueva solo. Termina el 20 de diciembre de 2026 y te avisamos 3 días antes.');
      expect(text).toContain('Si confirmamos tu pago después de esa fecha, PRO Plus empieza al confirmar');
      expect(el.textContent).toContain('Tu plan cambia cuando confirmamos el pago y llega la fecha de inicio.');
    });

    it('el resumen sigue al período elegido (3 meses → $74.700 y otra fecha de fin)', async () => {
      const { fixture, el } = await render(withPlus());
      pickPlus(fixture, el);
      const radio = el.querySelectorAll<HTMLInputElement>('input[name="transfer-months"]')[1];
      radio.dispatchEvent(new Event('change'));
      fixture.detectChanges();
      const text = el.querySelector('[data-testid="transfer-plan-change-summary"]')!.textContent!.replace(/\s+/g, ' ');
      expect(text).toContain('$74.700');
      expect(text).toContain('por 3 meses');
      expect(text).toContain('Termina el 18 de febrero de 2027');
    });

    it('si Plus empezaría ya (no hay nada pago vigente) no hay resumen de cambio', async () => {
      const { fixture, el } = await render(withPlus({ plusOptions: PLUS(true), currentTier: null, proUntil: null }));
      pickPlus(fixture, el);
      expect(el.querySelector('[data-testid="transfer-plan-change-summary"]')).toBeNull();
    });

    it('pedir Plus manda solo el período y el plan: el monto y las fechas no viajan', async () => {
      const { fixture, el, http, button } = await render(withPlus());
      pickPlus(fixture, el);
      button('Ver datos para transferir')!.click();
      const req = http.expectOne(`${API}/billing/transfer`);
      expect(req.request.body).toEqual({ months: 1, plan: 'PRO_PLUS' });
      req.flush(withPlus());
      await flush();
    });

    it('pedido en curso: dice cuándo empezaría Plus y que hasta entonces sigue PRO (en revisión también)', async () => {
      const planned = { planTier: 'PRO_PLUS' as const, months: 1, amountArs: 24900, startsAt: '2026-11-20T15:00:00.000Z', startsNow: false };
      const awaiting = await render(withPlus({ pending: payment({ ...planned, status: 'AWAITING_PROOF' }), plusOptions: [] }));
      expect(awaiting.el.querySelector('[data-testid="transfer-planned-start"]')!.textContent).toContain('PRO Plus empieza el 20 de noviembre de 2026');
      TestBed.resetTestingModule();
      const review = await render(withPlus({ pending: payment({ ...planned, status: 'IN_REVIEW' }), plusOptions: [] }));
      expect(review.el.querySelector('[data-testid="transfer-planned-start"]')!.textContent).toContain('Hasta entonces seguís con PRO');
    });

    it('confirmado antes de empezar: "empieza el … Hasta entonces seguís con PRO"; un Plus que rige ya, el texto de siempre', async () => {
      const scheduled = payment({
        status: 'APPROVED', planTier: 'PRO_PLUS', months: 3,
        periodStart: '2026-11-20T15:00:00.000Z', periodEnd: '2027-02-18T15:00:00.000Z', reviewedAt: '2026-11-01T12:00:00.000Z',
      });
      const a = await render(withPlus({ recentOutcome: scheduled, options: [], plusOptions: [] }));
      const text = a.el.querySelector('[data-testid="transfer-approved"]')!.textContent!.replace(/\s+/g, ' ');
      expect(text).toContain('3 meses de Resuelve PRO Plus: empieza el 20 de noviembre de 2026 y dura hasta el 18 de febrero de 2027. Hasta entonces seguís con PRO.');
      TestBed.resetTestingModule();
      const now = payment({ ...scheduled, periodStart: '2026-11-01T12:00:00.000Z', reviewedAt: '2026-11-01T12:00:00.000Z' });
      const b = await render(withPlus({ recentOutcome: now, options: [], plusOptions: [] }));
      expect(b.el.querySelector('[data-testid="transfer-approved"]')!.textContent).toContain('3 meses de Resuelve PRO Plus, hasta el 18 de febrero de 2027.');
    });

    it('selectPlan(PRO_PLUS, focus) abre el desplegable, elige Plus, muestra su resumen y deja el foco en el formulario sin pedir nada', async () => {
      const { fixture, http, el } = await render(withPlus(), { collapsible: true });
      const scroll = vi.fn();
      Element.prototype.scrollIntoView = scroll;
      expect(el.querySelector('#transfer-tier')).toBeNull(); // cerrado
      fixture.componentInstance.selectPlan('PRO_PLUS', { focus: true });
      fixture.detectChanges();
      await flush();
      fixture.detectChanges();
      const select = el.querySelector<HTMLSelectElement>('#transfer-tier')!;
      expect(select.value).toBe('PRO_PLUS');
      expect(el.querySelector('[data-testid="transfer-plan-change-summary"]')).not.toBeNull();
      expect(document.activeElement).toBe(select);
      expect(scroll).toHaveBeenCalled();
      http.expectNone(`${API}/billing/transfer/request`);
    });

    it('con "reducir movimiento" el desplazamiento no es animado', async () => {
      const { fixture, el } = await render(withPlus());
      const matchMedia = window.matchMedia;
      window.matchMedia = ((q: string) => ({ matches: q.includes('reduce'), media: q }) as MediaQueryList) as typeof window.matchMedia;
      const scroll = vi.fn();
      Element.prototype.scrollIntoView = scroll;
      fixture.componentInstance.selectPlan('PRO_PLUS', { focus: true });
      fixture.detectChanges();
      await flush();
      expect(scroll).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' });
      window.matchMedia = matchMedia;
      expect(el.querySelector('#transferencia')).not.toBeNull();
    });
  });
});
