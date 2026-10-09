import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { API_URL } from '../../../core/api/api.config';
import { AdminTransfer, AdminTransferAccount, AdminTransferList } from '../../../core/models/admin';
import { AdminPaymentsPage, PAYMENTS_MESSAGES } from './admin-payments-page';

const API = 'http://api.test/api/v1';
const flush = () => new Promise((r) => setTimeout(r));

const transfer = (patch: Partial<AdminTransfer> = {}): AdminTransfer => ({
  id: 't1',
  reference: 'RES-7F3K9Q',
  status: 'IN_REVIEW',
  origin: 'PROFESSIONAL',
  months: 3,
  amountArs: 45000,
  basePriceArs: 15000,
  offerCode: null,
  hasProof: true,
  proofDeleted: false,
  proofUploadedAt: '2026-10-09T12:00:00.000Z',
  reviewedAt: null,
  reviewerEmail: null,
  rejectionReason: null,
  adminNote: null,
  periodStart: null,
  periodEnd: null,
  withdrawnAt: null,
  refundDestination: null,
  refundedAt: null,
  createdAt: '2026-10-09T11:00:00.000Z',
  updatedAt: '2026-10-09T12:00:00.000Z',
  professional: { userId: 'u1', email: 'marta@test.dev', name: 'Marta Gómez' },
  ...patch,
});
const list = (items: AdminTransfer[], counts = { inReview: 1, awaitingProof: 0, refundsPending: 0 }): AdminTransferList => ({ items, counts });

async function render(items: AdminTransfer[], account: AdminTransferAccount | null = null) {
  TestBed.configureTestingModule({
    providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), { provide: API_URL, useValue: API }],
  });
  const http = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(AdminPaymentsPage);
  fixture.detectChanges();
  const req = http.expectOne((r) => r.url === `${API}/admin/transfers`);
  expect(req.request.params.get('status')).toBe('IN_REVIEW');
  req.flush(list(items));
  http.expectOne(`${API}/admin/transfer-account`).flush(account);
  await flush();
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, http, el };
}

describe('Admin · Pagos por transferencia', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('lista lo que hay que revisar, con código, monto, profesional y el contador', async () => {
    const { el } = await render([transfer()]);
    const row = el.querySelector('[data-testid="transfer-RES-7F3K9Q"]')!;
    expect(row.textContent).toContain('$45.000');
    expect(row.textContent).toContain('3 meses');
    expect(row.textContent).toContain('marta@test.dev');
    expect(row.textContent).toContain('con comprobante');
    expect(el.querySelector('[data-testid="no-account"]')).not.toBeNull();
  });

  it('confirmar manda la nota y relee la lista', async () => {
    const { el, http, fixture } = await render([transfer()]);
    el.querySelector<HTMLButtonElement>('[data-testid="approve-RES-7F3K9Q"]')!.click();
    fixture.detectChanges();
    const note = document.querySelector<HTMLInputElement>('#approve-note')!;
    note.value = 'Macro 9/10';
    note.dispatchEvent(new Event('input'));
    document.querySelector<HTMLButtonElement>('[data-testid="confirm-approve"]')!.click();
    const req = http.expectOne(`${API}/admin/transfers/t1/approve`);
    expect(req.request.body).toEqual({ note: 'Macro 9/10' });
    req.flush(transfer({ status: 'APPROVED' }));
    await flush();
    http.expectOne((r) => r.url === `${API}/admin/transfers`).flush(list([], { inReview: 0, awaitingProof: 0, refundsPending: 0 }));
    await flush();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="empty"]')).not.toBeNull();
  });

  it('si otra persona ya lo resolvió, avisa y relee', async () => {
    const { el, http, fixture } = await render([transfer()]);
    el.querySelector<HTMLButtonElement>('[data-testid="approve-RES-7F3K9Q"]')!.click();
    fixture.detectChanges();
    document.querySelector<HTMLButtonElement>('[data-testid="confirm-approve"]')!.click();
    http
      .expectOne(`${API}/admin/transfers/t1/approve`)
      .flush({ code: 'TRANSFER_INVALID_STATE' }, { status: 409, statusText: 'Conflict' });
    await flush();
    http.expectOne((r) => r.url === `${API}/admin/transfers`).flush(list([]));
    await flush();
    fixture.detectChanges();
    expect(fixture.componentInstance['actionError']()).toBe(PAYMENTS_MESSAGES.invalidState);
  });

  it('devolución pendiente: muestra a dónde devolver y "Ya lo devolví"', async () => {
    const { el, http } = await render([
      transfer({ status: 'WITHDRAWN', refundDestination: 'mi.alias.mp', withdrawnAt: '2026-10-10T12:00:00.000Z' }),
    ]);
    expect(el.querySelector('[data-testid="refund-info"]')!.textContent).toContain('mi.alias.mp');
    Array.from(el.querySelectorAll<HTMLButtonElement>('button'))
      .find((b) => b.textContent!.trim() === 'Ya lo devolví')!
      .click();
    http.expectOne(`${API}/admin/transfers/t1/refunded`).flush(transfer({ status: 'WITHDRAWN', refundedAt: '2026-10-11T12:00:00.000Z' }));
    await flush();
    http.expectOne((r) => r.url === `${API}/admin/transfers`).flush(list([]));
  });

  it('datos bancarios: valida alias y CBU antes de guardar', async () => {
    const { el, http, fixture } = await render([]);
    el.querySelector<HTMLButtonElement>('[data-testid="edit-account"]')!.click();
    fixture.detectChanges();
    const type = (id: string, value: string) => {
      const input = el.querySelector<HTMLInputElement>(`#${id}`)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    };
    const save = () => el.querySelector<HTMLButtonElement>('[data-testid="save-account"]')!;
    type('acc-holder', 'Francisco Larrosa');
    type('acc-alias', 'a b');
    expect(save().disabled).toBe(true);
    type('acc-alias', 'resuelve.pro');
    type('acc-cbu', '123');
    expect(save().disabled).toBe(true);
    type('acc-cbu', '2850590940090418135201');
    expect(save().disabled).toBe(false);
    save().click();
    const req = http.expectOne(`${API}/admin/transfer-account`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toMatchObject({ enabled: true, holder: 'Francisco Larrosa', alias: 'resuelve.pro', cbu: '2850590940090418135201' });
    req.flush({ enabled: true, holder: 'Francisco Larrosa', alias: 'resuelve.pro', cbu: '2850590940090418135201', bank: null, cuit: null, changedBy: 'a@b.c', updatedAt: '2026-10-09T12:00:00.000Z' });
    await flush();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="account-state"]')!.textContent).toContain('Visible en Mi plan');
  });
});
