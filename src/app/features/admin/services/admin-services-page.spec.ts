import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_URL } from '../../../core/api/api.config';
import { ServiceSuggestion } from '../../../core/api/service-suggestions-api.service';
import { AdminServicesPage } from './admin-services-page';

const API = 'http://api.test/api/v1';
const row: ServiceSuggestion = { id: 'suggestion-1', name: 'Corta pastos', status: 'PENDING', reason: null, serviceId: null, serviceName: null, serviceActive: false, createdAt: '2026-10-15T12:00:00Z', reviewedAt: null };
const service = { id: 'service-1', categoryId: 'category-1', name: 'Jardinería', slug: 'jardineria', requiresLicense: false };
const categories = [{ id: 'category-1', name: 'Exterior', slug: 'exterior', services: [service] }];
async function setup() {
  TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), { provide: API_URL, useValue: API }] });
  const http = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(AdminServicesPage);
  fixture.detectChanges();
  http.expectOne(`${API}/categories`).flush(categories); http.expectOne(`${API}/services`).flush([service]);
  http.expectOne((r) => r.url === `${API}/admin/service-suggestions` && r.params.get('status') === 'PENDING').flush({ items: [row], total: 1, page: 1, pageSize: 25 });
  const el = fixture.nativeElement as HTMLElement;
  const render = async () => { await fixture.whenStable(); fixture.detectChanges(); };
  await render();
  const click = (text: string) => { [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === text)!.click(); fixture.detectChanges(); };
  const select = async (index: number, value: string) => { const input = el.querySelectorAll<HTMLSelectElement>('dialog select')[index]; input.value = value; input.dispatchEvent(new Event('change')); await render(); };
  return { fixture, http, el, render, click, select };
}

it('crea con nombre corregido y categoría, evita doble envío y actualiza catálogo y pendientes', async () => {
  const { fixture, http, el, render, click, select } = await setup();
  click('Revisar'); await render();
  const input = el.querySelector<HTMLInputElement>('dialog input:not([type=checkbox])')!;
  input.value = 'Corte de pasto'; input.dispatchEvent(new Event('input')); await render();
  await select(1, 'category-1'); click('Aprobar oficio');
  const request = http.expectOne(`${API}/admin/service-suggestions/suggestion-1/approve`);
  expect(request.request.body).toEqual({ name: 'Corte de pasto', categoryId: 'category-1', requiresLicense: false });
  expect([...el.querySelectorAll<HTMLButtonElement>('dialog button')].every((b) => b.disabled)).toBe(true);
  request.flush({ ...row, status: 'APPROVED', serviceId: 'created' }); await render();
  http.expectOne(`${API}/categories`).flush(categories); http.expectOne(`${API}/services`).flush([service]);
  http.expectOne((r) => r.url === `${API}/admin/service-suggestions`).flush({ items: [], total: 0, page: 1, pageSize: 25 }); await render();
  expect(el.textContent).toContain('Oficio aprobado'); expect(el.textContent).toContain('No hay sugerencias');
  http.verify(); fixture.destroy();
});

it('vincula un oficio existente sin crear otro y permite reintentar una revisión fallida', async () => {
  const { fixture, http, el, render, click, select } = await setup();
  click('Revisar'); await render(); await select(0, 'LINK'); await select(1, 'service-1'); click('Aprobar oficio');
  const request = http.expectOne(`${API}/admin/service-suggestions/suggestion-1/approve`);
  expect(request.request.body).toEqual({ serviceId: 'service-1' });
  request.flush({}, { status: 409, statusText: 'Conflict' }); await render();
  expect(el.textContent).toContain('ya fue revisada o el oficio ya existe');
  expect(el.querySelectorAll<HTMLSelectElement>('dialog select')[1].value).toBe('service-1');
  click('Aprobar oficio'); http.expectOne(`${API}/admin/service-suggestions/suggestion-1/approve`).flush({ ...row, status: 'APPROVED' }); await render();
  http.expectOne((r) => r.url === `${API}/admin/service-suggestions`).flush({ items: [], total: 0, page: 1, pageSize: 25 }); await render();
  http.expectNone(`${API}/services`); http.verify(); fixture.destroy();
});

it('requiere un motivo para rechazar y lo envía sin publicar el oficio', async () => {
  const { fixture, http, el, render, click, select } = await setup();
  click('Revisar'); await render(); await select(0, 'REJECT'); click('Rechazar sugerencia');
  expect(el.textContent).toContain('Completá los datos'); http.expectNone(`${API}/admin/service-suggestions/suggestion-1/reject`);
  const input = el.querySelector('textarea')!; input.value = 'No describe un oficio'; input.dispatchEvent(new Event('input')); await render();
  click('Rechazar sugerencia');
  const request = http.expectOne(`${API}/admin/service-suggestions/suggestion-1/reject`);
  expect(request.request.body).toEqual({ reason: 'No describe un oficio' }); request.flush({ ...row, status: 'REJECTED' }); await render();
  http.expectOne((r) => r.url === `${API}/admin/service-suggestions`).flush({ items: [], total: 0, page: 1, pageSize: 25 }); await render();
  expect(el.textContent).toContain('Sugerencia rechazada'); http.verify(); fixture.destroy();
});
