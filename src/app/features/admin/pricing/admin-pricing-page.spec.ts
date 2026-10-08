import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { API_URL } from '../../../core/api/api.config';
import { AdminProPricing } from '../../../core/models/admin';
import { PRICING_MESSAGES } from '../../../core/state/admin-pricing.store';
import { AdminPricingPage } from './admin-pricing-page';

const API = 'http://api.test/api/v1';

const pricing = (o: Partial<AdminProPricing> = {}): AdminProPricing => ({
  monthlyPriceArs: 15000,
  source: 'CONFIG',
  defaultPriceArs: 15000,
  minPriceArs: 19,
  introOffer: {
    code: 'PRO_FIRST_MONTH_20',
    discountPercent: 20,
    cycles: 1,
    discountedPriceArs: 12000,
  },
  selfServe: true,
  history: [],
  inUse: [{ amountArs: 15000, subscriptions: 3 }],
  ...o,
});

@Component({ template: '' })
class Blank {}
const flush = () => new Promise((r) => setTimeout(r));

async function open(data: AdminProPricing = pricing()) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([{ path: '**', component: Blank }]),
      { provide: API_URL, useValue: API },
    ],
  });
  const http = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(AdminPricingPage);
  fixture.detectChanges();
  http.expectOne(`${API}/admin/pricing`).flush(data);
  const el = fixture.nativeElement as HTMLElement;
  const render = async () => {
    await flush();
    fixture.detectChanges();
    await fixture.whenStable();
  };
  await render();
  const type = async (value: string) => {
    const input = el.querySelector('#price') as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await render();
  };
  const save = async () => {
    (el.querySelector('[data-testid="save"]') as HTMLButtonElement).click();
    await render();
  };
  const confirmButton = () =>
    document.querySelector('[data-testid="confirm"]') as HTMLButtonElement;
  return { http, el, render, type, save, confirmButton };
}

describe('AdminPricingPage', () => {
  it('muestra el precio vigente y la oferta de bienvenida real', async () => {
    const { el } = await open();
    expect(el.querySelector('h1')?.textContent).toContain('Precio de Resuelve PRO');
    expect(el.querySelector('[data-testid="current"]')?.textContent).toContain('15.000');
    expect(el.querySelector('[data-testid="intro"]')?.textContent).toContain('12.000');
    expect(el.textContent).toContain('3 suscripciones');
  });

  it('avisa si el cobro online está apagado', async () => {
    const { el } = await open(pricing({ selfServe: false }));
    expect(el.querySelector('[data-testid="no-billing"]')).not.toBeNull();
  });

  it('no deja guardar un monto fuera de rango y no llama al servidor', async () => {
    const { http, el, type, save } = await open();
    await type('0');
    await save();
    expect(el.textContent).toContain('Ingresá un monto entre');
    expect(document.querySelector('[data-testid="confirm"]')).toBeNull();
    http.expectNone(`${API}/admin/pricing`);
  });

  it('no deja guardar menos del mínimo que acepta Mercado Pago (con la oferta)', async () => {
    const { http, el, type, save } = await open();
    await type('18');
    await save();
    expect(el.textContent).toContain('Ingresá un monto entre $');
    expect(el.textContent).toContain('19');
    expect(document.querySelector('[data-testid="confirm"]')).toBeNull();
    http.expectNone(`${API}/admin/pricing`);
  });

  it('permite el mínimo para probar el cobro real, avisando que es un precio de prueba', async () => {
    const { http, el, type, save, confirmButton } = await open();
    await type('19');
    expect(el.querySelector('[data-testid="test-warning"]')?.textContent).toContain('Precio de prueba');
    await save();
    expect(document.querySelector('[data-testid="confirm-test-warning"]')).not.toBeNull();
    confirmButton().click();
    expect(http.expectOne(`${API}/admin/pricing`).request.body).toEqual({ monthlyPriceArs: 19 });
  });

  it('el rechazo del servidor por precio bajo explica el mínimo', async () => {
    const { http, el, type, save, confirmButton, render } = await open();
    await type('19');
    await save();
    confirmButton().click();
    http
      .expectOne(`${API}/admin/pricing`)
      .flush(
        { statusCode: 400, code: 'PRO_PRICE_TOO_LOW', message: 'x' },
        { status: 400, statusText: 'Bad Request' },
      );
    await render();
    expect(el.textContent).toContain('Mercado Pago no cobra menos de $ 15');
  });

  it('un precio normal no muestra el aviso de prueba', async () => {
    const { el, type } = await open();
    await type('20000');
    expect(el.querySelector('[data-testid="test-warning"]')).toBeNull();
  });

  it('vista previa de la oferta sobre el precio escrito', async () => {
    const { el, type } = await open();
    await type('20000');
    expect(el.querySelector('#price-hint')?.textContent).toContain('16.000');
  });

  it('pide confirmación (de → a) y recién ahí guarda', async () => {
    const { http, el, type, save, confirmButton, render } = await open();
    await type('20.000');
    await save();
    expect(document.querySelector('[data-testid="confirm-text"]')?.textContent).toMatch(
      /15\.000.*20\.000/,
    );
    http.expectNone(`${API}/admin/pricing`);
    confirmButton().click();
    const req = http.expectOne(`${API}/admin/pricing`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ monthlyPriceArs: 20000 });
    req.flush(
      pricing({
        monthlyPriceArs: 20000,
        source: 'ADMIN',
        introOffer: {
          code: 'PRO_FIRST_MONTH_20',
          discountPercent: 20,
          cycles: 1,
          discountedPriceArs: 16000,
        },
        history: [
          {
            priceArs: 20000,
            previousPriceArs: 15000,
            changedBy: 'admin@example.com',
            createdAt: '2026-10-06T12:00:00.000Z',
          },
        ],
      }),
    );
    await render();
    expect(el.querySelector('[data-testid="current"]')?.textContent).toContain('20.000');
    expect(el.querySelector('[data-testid="saved"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="history"]')?.textContent).toContain('admin@example.com');
  });

  it('si el servidor dice que no cambió, lo explica', async () => {
    const { http, el, type, save, confirmButton, render } = await open();
    await type('15000');
    await save();
    confirmButton().click();
    http
      .expectOne(`${API}/admin/pricing`)
      .flush(
        { statusCode: 409, code: 'PRO_PRICE_UNCHANGED', message: 'x' },
        { status: 409, statusText: 'Conflict' },
      );
    await render();
    expect(el.textContent).toContain(PRICING_MESSAGES.unchanged);
  });
});
