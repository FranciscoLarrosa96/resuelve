import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_URL } from '../../../core/api/api.config';
import { AuthStore } from '../../../core/state/auth.store';
import { DemandAlert } from './demand-alert';

function render(authenticated: boolean) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_URL, useValue: '/api' },
      { provide: AuthStore, useValue: { authenticated: signal(authenticated) } },
    ],
  });
  const fixture = TestBed.createComponent(DemandAlert);
  fixture.componentRef.setInput('cityId', 'city-1');
  fixture.componentRef.setInput('cityName', 'Ayacucho');
  fixture.componentRef.setInput('serviceId', 'svc-1');
  fixture.componentRef.setInput('serviceName', 'Electricidad');
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const http = TestBed.inject(HttpTestingController);
  return { el, fixture, http, text: () => el.textContent?.replace(/\s+/g, ' ').trim() ?? '' };
}

describe('Avisame cuando haya', () => {
  it('sin sesión: lleva a ingresar y no consulta nada', () => {
    const { el, http, text } = render(false);
    expect(text()).toContain('Te avisamos cuando haya profesionales de Electricidad en Ayacucho');
    expect(text()).toContain('No se envía ningún pedido');
    const link = el.querySelector('[data-testid="demand-alert-login"]');
    expect(link?.getAttribute('href')).toContain('/ingresar?returnUrl=');
    http.expectNone(() => true);
  });

  it('con sesión: guarda el aviso con un toque y lo confirma', () => {
    const { el, fixture, http, text } = render(true);
    http.expectOne((r) => r.method === 'GET' && r.url === '/api/me/demand-alerts').flush({ active: false });
    fixture.detectChanges();
    (el.querySelector('[data-testid="demand-alert-button"]') as HTMLButtonElement).click();
    const req = http.expectOne((r) => r.method === 'POST' && r.url === '/api/me/demand-alerts');
    expect(req.request.body).toEqual({ cityId: 'city-1', serviceId: 'svc-1' });
    req.flush({ active: true });
    fixture.detectChanges();
    expect(text()).toContain('Listo. Te avisamos cuando haya profesionales de Electricidad en Ayacucho.');
    expect(el.querySelector('button')).toBeNull();
  });

  it('si ya lo había pedido, se ve confirmado; un error se puede reintentar', () => {
    const first = render(true);
    first.http.expectOne((r) => r.method === 'GET').flush({ active: true });
    first.fixture.detectChanges();
    expect(first.el.querySelector('[data-testid="demand-alert-active"]')).not.toBeNull();
    TestBed.resetTestingModule();

    const { el, fixture, http, text } = render(true);
    http.expectOne((r) => r.method === 'GET').flush({ active: false });
    fixture.detectChanges();
    (el.querySelector('[data-testid="demand-alert-button"]') as HTMLButtonElement).click();
    http.expectOne((r) => r.method === 'POST').flush({}, { status: 500, statusText: 'Error' });
    fixture.detectChanges();
    expect(text()).toContain('No pudimos guardar el aviso');
    expect(el.querySelector('[data-testid="demand-alert-button"]')).not.toBeNull();
  });
});
