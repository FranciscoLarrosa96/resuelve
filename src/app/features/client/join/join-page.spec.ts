import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { API_URL } from '../../../core/api/api.config';
import { AUTO_PRO_DELAY_MS, JoinPage } from './join-page';

const API = 'http://api.test/api/v1';
const flush = () => new Promise((r) => setTimeout(r));
const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ');

type ObserverCallback = (entries: { isIntersecting: boolean }[]) => void;

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_URL, useValue: API },
      { provide: PLATFORM_ID, useValue: 'browser' },
    ],
  });
  const http = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(JoinPage);
  fixture.detectChanges();
  http.expectOne(`${API}/plans`).flush({
    free: { quoteLimit: 3 },
    pro: { monthlyPriceArs: 9900, selfServe: true, features: { quoteTemplates: true } },
    founder: null,
  });
  return { http, fixture, el: fixture.nativeElement as HTMLElement };
}

const toggleButton = (el: HTMLElement, group: string, label: string) =>
  [...el.querySelectorAll(`[aria-label="${group}"] button`)].find((b) => text(b).trim() === label) as HTMLButtonElement;

describe('Trabajá con Resuelve: vistas previas Gratis / PRO', () => {
  const original = (window as { IntersectionObserver?: unknown }).IntersectionObserver;
  afterEach(() => {
    (window as { IntersectionObserver?: unknown }).IntersectionObserver = original;
    vi.useRealTimers();
    TestBed.inject(HttpTestingController).verify();
  });

  it('sin IntersectionObserver muestra PRO; el interruptor cambia el perfil y los resultados a la vez', async () => {
    delete (window as { IntersectionObserver?: unknown }).IntersectionObserver;
    const { fixture, el } = setup();
    await flush();
    fixture.detectChanges();

    expect(el.querySelectorAll('[data-testid="join-preview-works"] img').length).toBe(4);
    expect(el.querySelector('[data-testid="join-search-you"]')!.querySelectorAll('img').length).toBe(3);
    expect(text(el.querySelector('[data-testid="join-search-preview"]'))).toContain('Ejemplo ilustrativo');
    // Fotos de muestra, nunca de un profesional real.
    for (const img of el.querySelectorAll('[data-testid="join-profile-preview"] img, [data-testid="join-search-preview"] img')) {
      expect(img.getAttribute('src')).toMatch(/^\/portfolio-demo\//);
    }

    toggleButton(el, 'Ver tu tarjeta con cada plan', 'Vos con Gratis').click();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="join-preview-empty"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="join-search-you"]')!.querySelectorAll('img').length).toBe(0);
    expect(toggleButton(el, 'Ver tu perfil con cada plan', 'Gratis').getAttribute('aria-pressed')).toBe('true');
    // WhatsApp, llamadas y reseñas siguen incluidos en Gratis; lo de PRO queda bloqueado.
    const benefits = text(el.querySelector('[data-testid="join-hero-benefits"]'));
    expect(benefits).toContain('WhatsApp, llamadas y reseñas');
    expect(benefits).toContain('(con PRO)');
  });

  it('dice qué no se cobra ni se pide, y la matrícula verificada como algo de cualquier plan', async () => {
    const { fixture, el } = setup();
    await flush();
    fixture.detectChanges();

    const guarantees = text(el.querySelector('[data-testid="join-guarantees"]'));
    for (const g of ['Sin comisión', 'Sin exclusividad', 'Sin permanencia', 'Tu perfil gratis no vence']) expect(guarantees).toContain(g);
    const notAsked = text(el.querySelector('[data-testid="join-not-asked"]'));
    expect(notAsked).toContain('CUIT ni condición de IVA');
    expect(notAsked).toContain('Matrícula para aparecer');
    const license = text(el.querySelector('[data-testid="join-license"]'));
    expect(license).toContain('registro oficial');
    expect(license).toContain('con cualquier plan');
    // Nunca "solicitudes sin límite" para Free.
    expect(text(el)).not.toMatch(/solicitudes sin límite/i);
  });

  it('arranca en Gratis y pasa una sola vez a PRO al verse el perfil, salvo que la persona ya haya elegido', async () => {
    vi.useFakeTimers();
    const callbacks: ObserverCallback[] = [];
    (window as { IntersectionObserver?: unknown }).IntersectionObserver = class {
      constructor(cb: ObserverCallback) {
        callbacks.push(cb);
      }
      observe() {}
      disconnect() {}
    };
    const { fixture, el } = setup();
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="join-preview-empty"]')).not.toBeNull();

    callbacks[0]([{ isIntersecting: true }]);
    await vi.advanceTimersByTimeAsync(AUTO_PRO_DELAY_MS);
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="join-preview-works"]')).not.toBeNull();
  });

  it('si la persona toca el interruptor antes, el cambio automático no la pisa', async () => {
    vi.useFakeTimers();
    const callbacks: ObserverCallback[] = [];
    (window as { IntersectionObserver?: unknown }).IntersectionObserver = class {
      constructor(cb: ObserverCallback) {
        callbacks.push(cb);
      }
      observe() {}
      disconnect() {}
    };
    const { fixture, el } = setup();
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
    callbacks[0]([{ isIntersecting: true }]);
    toggleButton(el, 'Ver tu perfil con cada plan', 'Gratis').click();
    await vi.advanceTimersByTimeAsync(AUTO_PRO_DELAY_MS);
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="join-preview-empty"]')).not.toBeNull();
  });
});
