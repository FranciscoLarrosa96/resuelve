import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_URL } from '../../../core/api/api.config';
import { AdminWithdrawalRequest } from '../../../core/models/admin';
import { AdminWithdrawalRequests } from './admin-withdrawal-requests';

const API = 'http://api.test/api/v1';
const row = (over: Partial<AdminWithdrawalRequest> = {}): AdminWithdrawalRequest => ({
  id: 'r1',
  code: 'ARR-K7M2XQ',
  status: 'PENDING',
  requestedAt: '2026-10-17T15:30:00.000Z',
  name: 'Ana Pérez',
  email: 'ana@example.com',
  phone: null,
  paymentReference: 'RES-ABC234',
  note: 'pagué el 10/10',
  linkedPaymentId: null,
  handledAt: null,
  adminNote: null,
  ...over,
});
const settle = () => new Promise((r) => setTimeout(r));

async function setup(items: AdminWithdrawalRequest[]) {
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), { provide: API_URL, useValue: API }] });
  const http = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(AdminWithdrawalRequests);
  fixture.detectChanges();
  http.expectOne(`${API}/admin/withdrawal-requests`).flush({ items, counts: { pending: items.filter((i) => i.status === 'PENDING').length } });
  await settle();
  fixture.detectChanges();
  return { fixture, http, el: fixture.nativeElement as HTMLElement };
}

describe('Admin · arrepentimientos sin sesión', () => {
  it('sin solicitudes no muestra nada', async () => {
    const { el } = await setup([]);
    expect(el.querySelector('[data-testid="withdrawal-requests"]')).toBeNull();
  });

  it('muestra código, fecha de recepción y datos de contacto; el código del pago viene marcado como sin verificar', async () => {
    const { el } = await setup([row()]);
    const text = el.querySelector('[data-testid="withdrawal-request"]')!.textContent!.replace(/\s+/g, ' ');
    expect(text).toContain('ARR-K7M2XQ');
    expect(text).toContain('ana@example.com');
    expect(text).toContain('hora de Argentina');
    expect(text).toContain('RES-ABC234');
    expect(text).toContain('sin verificar');
  });

  it('vincula con el código del pago y el destino de devolución, y relee la lista', async () => {
    const { fixture, http, el } = await setup([row()]);
    const dest = el.querySelector<HTMLInputElement>('input[placeholder^="Alias"]')!;
    dest.value = 'mi.alias.mp';
    dest.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    el.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    const req = http.expectOne(`${API}/admin/withdrawal-requests/r1/link`);
    expect(req.request.body).toEqual({ reference: 'RES-ABC234', refundTo: 'mi.alias.mp' });
    req.flush(row({ status: 'LINKED' }));
    await settle();
    http.expectOne(`${API}/admin/withdrawal-requests`).flush({ items: [row({ status: 'LINKED' })], counts: { pending: 0 } });
    await settle();
    fixture.detectChanges();
    expect(el.textContent).toContain('Vinculada');
    expect(el.querySelector('form')).toBeNull();
  });

  it('si llegó fuera de la ventana lo dice y no la vincula', async () => {
    const { fixture, http, el } = await setup([row()]);
    const dest = el.querySelector<HTMLInputElement>('input[placeholder^="Alias"]')!;
    dest.value = 'mi.alias.mp';
    dest.dispatchEvent(new Event('input'));
    el.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    http.expectOne(`${API}/admin/withdrawal-requests/r1/link`).flush({ code: 'TRANSFER_WITHDRAWAL_EXPIRED', message: 'x' }, { status: 409, statusText: 'Conflict' });
    await settle();
    http.expectOne(`${API}/admin/withdrawal-requests`).flush({ items: [row()], counts: { pending: 1 } });
    await settle();
    fixture.detectChanges();
    expect(el.querySelector('[role="alert"]')!.textContent).toContain('llegó después de la ventana');
  });
});
