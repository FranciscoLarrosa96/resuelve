import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_URL } from '../../../core/api/api.config';
import { ServiceSuggestion } from '../../../core/api/service-suggestions-api.service';
import { ServiceSuggestions } from './service-suggestions';

const API = 'http://api.test/api/v1';
const row = (extra: Partial<ServiceSuggestion> = {}): ServiceSuggestion => ({ id: 'suggestion-1', name: 'Corta pastos', status: 'PENDING', reason: null, serviceId: null, serviceName: null, serviceActive: false, createdAt: '2026-10-15T12:00:00Z', reviewedAt: null, ...extra });
function setup() {
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), { provide: API_URL, useValue: API }] });
  const http = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(ServiceSuggestions);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const render = async () => { await fixture.whenStable(); fixture.detectChanges(); };
  const click = (text: string) => { [...el.querySelectorAll('button')].find((b) => b.textContent?.includes(text))!.click(); fixture.detectChanges(); };
  const type = (value: string) => { const input = el.querySelector('input')!; input.value = value; input.dispatchEvent(new Event('input')); fixture.detectChanges(); };
  return { fixture, http, el, render, click, type };
}

it('envía sin elegir otro rubro, conserva el texto si falla y no publica el oficio por su cuenta', async () => {
  const { fixture, http, el, render, click, type } = setup();
  http.expectNone(`${API}/service-suggestions`);
  click('¿Tu oficio');
  http.expectOne(`${API}/service-suggestions`).flush([]); await render();
  type('  Corta   pastos  ');
  const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
  el.querySelector('input')!.dispatchEvent(enter); fixture.detectChanges();
  expect(enter.defaultPrevented).toBe(true); // No envía el formulario de Mi perfil que lo contiene.
  const request = http.expectOne(`${API}/service-suggestions`);
  expect(request.request.body).toEqual({ name: 'Corta pastos' });
  request.flush({}, { status: 503, statusText: 'Unavailable' }); await render();
  expect(el.querySelector('input')?.value).toBe('  Corta   pastos  ');
  expect(el.querySelector('[role=alert]')?.textContent).toContain('reintentá');
  click('Enviar sugerencia'); http.expectOne(`${API}/service-suggestions`).flush(row()); await render();
  expect(el.textContent).toContain('Pendiente de revisión');
  expect(el.querySelector('input')?.value).toBe('');
  expect([...el.querySelectorAll('button')].some((b) => b.textContent?.startsWith('Elegir'))).toBe(false);
  http.verify(); fixture.destroy();
});

it('actualiza el estado y solo permite elegir el oficio aprobado y activo', async () => {
  const { fixture, http, el, render, click } = setup();
  const selected: string[] = []; fixture.componentInstance.selected.subscribe((id) => selected.push(id));
  click('¿Tu oficio'); http.expectOne(`${API}/service-suggestions`).flush([row()]); await render();
  click('Actualizar estado');
  http.expectOne(`${API}/service-suggestions`).flush([
    row({ status: 'APPROVED', serviceId: 'service-1', serviceName: 'Corte de pasto', serviceActive: true }),
    row({ id: 'rejected', status: 'REJECTED', reason: 'El nombre no describe un oficio.' }),
    row({ id: 'inactive', status: 'APPROVED', serviceId: 'inactive', serviceName: 'Oficio antiguo', serviceActive: false }),
  ]); await render();
  expect(el.textContent).toContain('El nombre no describe un oficio');
  expect([...el.querySelectorAll('button')].filter((b) => b.textContent?.startsWith('Elegir'))).toHaveLength(1);
  click('Elegir Corte de pasto'); expect(selected).toEqual(['service-1']);
  http.verify(); fixture.destroy();
});

it('bloquea datos de contacto antes de enviar y explica el cupo sin perder el nombre', async () => {
  const { fixture, http, el, render, click, type } = setup();
  click('¿Tu oficio'); http.expectOne(`${API}/service-suggestions`).flush([]); await render();
  type('Llamame a hola@example.com'); click('Enviar sugerencia');
  http.expectNone(`${API}/service-suggestions`);
  expect(el.querySelector('[role=alert]')?.textContent).toContain('sin teléfonos');
  type('Corte de pasto'); click('Enviar sugerencia');
  http.expectOne(`${API}/service-suggestions`).flush({ code: 'CONFLICT' }, { status: 409, statusText: 'Conflict' }); await render();
  expect(el.textContent).toContain('hasta 5 pendientes');
  expect(el.querySelector('input')?.value).toBe('Corte de pasto');
  http.verify(); fixture.destroy();
});
