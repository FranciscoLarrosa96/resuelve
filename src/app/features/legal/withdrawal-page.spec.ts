import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { API_URL } from '../../core/api/api.config';
import { AuthStore } from '../../core/state/auth.store';
import { routes } from '../../app.routes';
import { SiteFooter } from '../../shared/components/site-footer/site-footer';
import { WithdrawalPage } from './withdrawal-page';

function render(user: unknown = null) {
  TestBed.configureTestingModule({
    providers: [provideRouter(routes), provideHttpClient(), provideHttpClientTesting(), { provide: API_URL, useValue: 'http://api.test/api/v1' }],
  });
  if (user) {
    const store = TestBed.inject(AuthStore) as unknown as Record<string, { set(v: unknown): void }>;
    store['_user'].set(user);
    store['_accessToken'].set('token');
  }
  const fixture = TestBed.createComponent(WithdrawalPage);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

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
    // Sin botón que revoque nada desde acá.
    expect(el.querySelector('button')).toBeNull();
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
