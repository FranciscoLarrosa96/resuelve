import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { API_URL } from '../../core/api/api.config';
import { AuthStore } from '../../core/state/auth.store';
import { routes } from '../../app.routes';
import { SiteFooter } from '../../shared/components/site-footer/site-footer';
import { WithdrawalPage } from './withdrawal-page';

let current: ComponentFixture<WithdrawalPage>;
const settle = async () => {
  await new Promise((r) => setTimeout(r));
  current.detectChanges();
};

function render(user: unknown = null) {
  TestBed.configureTestingModule({
    providers: [provideRouter(routes), provideHttpClient(), provideHttpClientTesting(), { provide: API_URL, useValue: 'http://api.test/api/v1' }],
  });
  if (user) {
    const store = TestBed.inject(AuthStore) as unknown as Record<string, { set(v: unknown): void }>;
    store['_user'].set(user);
    store['_accessToken'].set('token');
  }
  current = TestBed.createComponent(WithdrawalPage);
  current.detectChanges();
  return current.nativeElement as HTMLElement;
}

const API = 'http://api.test/api/v1';

describe('"No puedo ingresar a mi cuenta" (solicitud sin sesión)', () => {
  function fill(el: HTMLElement, id: string, value: string) {
    const input = el.querySelector<HTMLInputElement>(`#${id}`)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    current.detectChanges();
  }
  async function filled() {
    const el = render();
    fill(el, 'wd-name', 'Ana Pérez');
    fill(el, 'wd-email', 'ana@example.com');
    fill(el, 'wd-ref', 'res-abc234');
    const check = el.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    check.checked = true;
    check.dispatchEvent(new Event('change'));
    current.detectChanges();
    return el;
  }

  it('no se puede enviar sin consentimiento, correo válido o con un código mal formado', () => {
    const el = render();
    const send = () => el.querySelector<HTMLButtonElement>('[data-testid="withdrawal-send"]')!;
    expect(send().disabled).toBe(true);
    fill(el, 'wd-name', 'Ana Pérez');
    fill(el, 'wd-email', 'no-es-correo');
    expect(send().disabled).toBe(true);
  });

  it('envía los datos mínimos sin sesión y muestra el comprobante: código, fecha y que NO se revocó nada', async () => {
    const el = await filled();
    const http = TestBed.inject(HttpTestingController);
    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    const req = http.expectOne(`${API}/withdrawal-requests`);
    expect(req.request.headers.has('Authorization')).toBe(false);
    expect(req.request.body).toEqual({ name: 'Ana Pérez', email: 'ana@example.com', paymentReference: 'RES-ABC234', consent: true });
    req.flush({ code: 'ARR-K7M2XQ', requestedAt: '2026-10-17T15:30:00.000Z' });
    await settle();
    const receipt = el.querySelector('[data-testid="withdrawal-receipt"]')!.textContent!.replace(/\s+/g, ' ');
    expect(el.querySelector('[data-testid="withdrawal-code"]')!.textContent).toBe('ARR-K7M2XQ');
    expect(receipt).toContain('17 de octubre de 2026');
    expect(receipt).toContain('hora de Argentina');
    expect(receipt).toContain('Todavía no revocamos ningún pago ni hicimos ninguna devolución');
    expect(receipt).toContain('La fecha de recepción es la que cuenta para evaluar el plazo');
    expect(el.querySelector('form')).toBeNull();
  });

  it('un 409 por tope muestra un aviso sin datos de cuentas y no muestra comprobante', async () => {
    const el = await filled();
    const http = TestBed.inject(HttpTestingController);
    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    http.expectOne(`${API}/withdrawal-requests`).flush({ code: 'WITHDRAWAL_REQUEST_LIMIT', message: 'x' }, { status: 409, statusText: 'Conflict' });
    await settle();
    expect(el.querySelector('[data-testid="withdrawal-receipt"]')).toBeNull();
    expect(el.querySelector('[data-testid="withdrawal-error"]')!.textContent).toContain('Ya recibimos varias solicitudes');
  });
});

describe('Botón de arrepentimiento público (/arrepentimiento)', () => {
  it('sin sesión: explica plazo y devolución, no muestra pagos y lleva a ingresar con vuelta al trámite', () => {
    const el = render();
    const text = el.textContent!.replace(/\s+/g, ' ');
    expect(text).toContain('Botón de arrepentimiento');
    expect(text).toContain('10 días corridos');
    expect(text).toContain('código de arrepentimiento');
    expect(text).toContain('Esta página no muestra ni modifica ningún pago');
    expect(text).not.toMatch(/\$\s?\d|RES-[A-Z0-9]{6}/); // ningún dato de pagos
    const go = el.querySelector<HTMLAnchorElement>('[data-testid="withdrawal-go"]')!;
    expect(go.textContent).toContain('Ingresar para continuar');
    expect(go.getAttribute('href')).toContain('/ingresar');
    expect(decodeURIComponent(go.getAttribute('href')!)).toContain('returnUrl=/pro/plan#arrepentimiento');
    // Ningún botón revoca nada desde acá: el único es el que registra la solicitud sin sesión.
    expect([...el.querySelectorAll('button')].map((b) => b.textContent!.trim())).toEqual(['Enviar solicitud']);
  });

  it('con sesión: lleva directo al trámite en Mi plan', () => {
    const el = render({ id: 'u1', name: 'Ana' });
    const go = el.querySelector<HTMLAnchorElement>('[data-testid="withdrawal-go"]')!;
    expect(go.getAttribute('href')).toBe('/pro/plan#arrepentimiento');
  });

  it('está enlazado desde el pie en las dos versiones', () => {
    TestBed.configureTestingModule({ imports: [SiteFooter], providers: [provideRouter([])] });
    for (const compact of [false, true]) {
      const f = TestBed.createComponent(SiteFooter);
      f.componentRef.setInput('compact', compact);
      f.detectChanges();
      const hrefs = [...(f.nativeElement as HTMLElement).querySelectorAll('a')].map((a) => a.getAttribute('href'));
      expect(hrefs).toContain('/arrepentimiento');
    }
  });
});
