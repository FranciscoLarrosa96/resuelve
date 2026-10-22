import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { API_URL } from '../../core/api/api.config';
import { ProfessionalReview } from '../../core/models/professional';
import { contactInText } from '../../core/utils/contact-in-text';
import { ClientQuestionsPanel } from '../client/my-requests/request-detail/client-questions';
import { JoinPage } from '../client/join/join-page';
import { ProQuestionsPanel } from './request-detail/pro-questions';
import { ReviewReplies } from './profile/review-replies';
import { greetingFor, slotsText } from './pro-ui';

const API = 'http://api.test/api/v1';
const REQ = '11111111-1111-4111-8111-111111111111';
const flush = () => new Promise((r) => setTimeout(r));
const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ');

let configured = false;
function configure() {
  configured = true;
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_URL, useValue: API },
      { provide: PLATFORM_ID, useValue: 'browser' },
    ],
  });
  return TestBed.inject(HttpTestingController);
}

afterEach(() => {
  if (configured) TestBed.inject(HttpTestingController).verify();
  configured = false;
});

describe('textos del área profesional', () => {
  it('saludo según la hora de Argentina', () => {
    expect(greetingFor(new Date('2026-10-13T11:00:00Z'))).toBe('Buen día'); // 8 h
    expect(greetingFor(new Date('2026-10-13T18:00:00Z'))).toBe('Buenas tardes'); // 15 h
    expect(greetingFor(new Date('2026-10-14T00:30:00Z'))).toBe('Buenas noches'); // 21:30 h
    expect(greetingFor(new Date('2026-10-14T06:00:00Z'))).toBe('Buenas noches'); // 3 h
  });

  it('competencia en positivo, sin "0 de 5 lugares ocupados"', () => {
    expect(slotsText({ activeQuoteCount: 0, maxActiveQuotes: 5 })).toBe('Todavía no hay presupuestos.');
    expect(slotsText({ activeQuoteCount: 1, maxActiveQuotes: 5 })).toBe('Ya hay 1 presupuesto (máximo 5).');
    expect(slotsText({ activeQuoteCount: 3, maxActiveQuotes: 5 })).toBe('Ya hay 3 presupuestos (máximo 5).');
    expect(slotsText(null)).toBeNull();
  });

  it('contacto en el texto: mismo criterio que el backend', () => {
    expect(contactInText('escribime a yo@correo.com')).toBe('EMAIL');
    expect(contactInText('llamame al 249 412-3456')).toBe('PHONE');
    expect(contactInText('son 2 caños de 1/2 pulgada')).toBeNull();
  });
});

describe('consultas antes de presupuestar', () => {
  @Component({ selector: 'pro-host', imports: [ProQuestionsPanel], template: `<app-pro-questions [requestId]="id" />` })
  class ProHost {
    id = REQ;
  }
  @Component({ selector: 'client-host', imports: [ClientQuestionsPanel], template: `<app-client-questions [requestId]="id" />` })
  class ClientHost {
    id = REQ;
  }

  it('profesional: pregunta, ve "Esperando respuesta" y no manda teléfonos', async () => {
    const http = configure();
    const fixture = TestBed.createComponent(ProHost);
    fixture.detectChanges();
    http.expectOne(`${API}/pro/requests/${REQ}/questions`).flush({ items: [], canAsk: true, max: 3 });
    await flush();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(text(el)).toContain('¿Te falta un dato para presupuestar bien?');
    [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Hacer una consulta'))!.click();
    fixture.detectChanges();
    const area = el.querySelector('textarea')!;
    area.value = 'Pasame tu cel 249 412 3456';
    area.dispatchEvent(new Event('input'));
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    expect(text(el.querySelector('[role="alert"]'))).toContain('No incluyas teléfonos');

    area.value = '¿De qué material es la cañería?';
    area.dispatchEvent(new Event('input'));
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    const req = http.expectOne(`${API}/pro/requests/${REQ}/questions`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ text: '¿De qué material es la cañería?' });
    req.flush({
      items: [{ id: 'q1', question: '¿De qué material es la cañería?', answer: null, askedAt: '2026-10-12T20:00:00Z', answeredAt: null }],
      canAsk: false,
      max: 3,
    });
    await flush();
    fixture.detectChanges();
    expect(text(el)).toContain('Esperando respuesta');
    expect([...el.querySelectorAll('button')].some((b) => b.textContent?.includes('consulta'))).toBe(false);
  });

  it('cliente: sin consultas no muestra nada; con una, responde', async () => {
    const http = configure();
    const fixture = TestBed.createComponent(ClientHost);
    fixture.detectChanges();
    http.expectOne(`${API}/requests/${REQ}/questions`).flush({
      groups: [
        {
          professional: { id: 'p1', displayName: 'Sergio Gómez' },
          items: [{ id: 'q1', question: '¿Tenés foto?', answer: null, askedAt: '2026-10-12T20:00:00Z', answeredAt: null }],
        },
      ],
      canAnswer: true,
    });
    await flush();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(text(el)).toContain('Sergio Gómez pregunta:');
    expect(text(el)).toContain('1 sin responder');
    const area = el.querySelector('textarea')!;
    area.value = 'Sí, te la dejo en la solicitud.';
    area.dispatchEvent(new Event('input'));
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    const req = http.expectOne(`${API}/requests/${REQ}/questions/q1/answer`);
    expect(req.request.body).toEqual({ text: 'Sí, te la dejo en la solicitud.' });
    req.flush({
      groups: [
        {
          professional: { id: 'p1', displayName: 'Sergio Gómez' },
          items: [{ id: 'q1', question: '¿Tenés foto?', answer: 'Sí, te la dejo en la solicitud.', askedAt: '2026-10-12T20:00:00Z', answeredAt: '2026-10-12T21:00:00Z' }],
        },
      ],
      canAnswer: true,
    });
    await flush();
    fixture.detectChanges();
    expect(text(el)).toContain('Tu respuesta');
    expect(el.querySelector('textarea')).toBeNull();

    TestBed.resetTestingModule();
    const http2 = configure();
    const empty = TestBed.createComponent(ClientHost);
    empty.detectChanges();
    http2.expectOne(`${API}/requests/${REQ}/questions`).flush({ groups: [], canAnswer: true });
    await flush();
    empty.detectChanges();
    expect((empty.nativeElement as HTMLElement).querySelector('[data-testid="client-questions"]')).toBeNull();
  });
});

describe('respuesta pública a reseñas', () => {
  const review = (extra: Partial<ProfessionalReview> = {}): ProfessionalReview => ({
    id: 'r1',
    rating: 5,
    comment: 'Muy prolijo.',
    reviewerDisplayName: 'Laura',
    invited: false,
    createdAt: '2026-10-01T12:00:00Z',
    reply: null,
    ...extra,
  });

  it('responde, se ve como "Tu respuesta" y se puede borrar', async () => {
    const http = configure();
    const fixture = TestBed.createComponent(ReviewReplies);
    fixture.detectChanges();
    http.expectOne(`${API}/pro/reviews?page=1`).flush({ items: [review()], page: 1, pageSize: 20, total: 1 });
    await flush();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    el.querySelector<HTMLButtonElement>('[aria-label="Responder la reseña de Laura"]')!.click();
    fixture.detectChanges();
    const area = el.querySelector('textarea')!;
    area.value = '¡Gracias, Laura!';
    area.dispatchEvent(new Event('input'));
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    const put = http.expectOne(`${API}/pro/reviews/r1/reply`);
    expect(put.request.method).toBe('PUT');
    put.flush(review({ reply: { text: '¡Gracias, Laura!', repliedAt: '2026-10-12T20:00:00Z' } }));
    await flush();
    fixture.detectChanges();
    expect(text(el)).toContain('Tu respuesta');
    expect(text(el)).toContain('¡Gracias, Laura!');

    [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Borrar')!.click();
    const del = http.expectOne(`${API}/pro/reviews/r1/reply`);
    expect(del.request.method).toBe('DELETE');
    del.flush(review());
    await flush();
    fixture.detectChanges();
    expect(text(el)).not.toContain('¡Gracias, Laura!');
    expect(text(el)).toContain('Responder');
  });
});

describe('Trabajá con Resuelve', () => {
  it('precio y cupo reales de /plans; sin sesión, el CTA va al registro de profesionales', async () => {
    const http = configure();
    const fixture = TestBed.createComponent(JoinPage);
    fixture.detectChanges();
    http.expectOne(`${API}/plans`).flush({
      free: { quoteLimit: 3 },
      pro: { monthlyPriceArs: 15000, selfServe: true, features: { quoteTemplates: true } },
      introOffer: null,
    });
    await flush();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const plans = text(el.querySelector('[data-testid="join-plans"]'));
    expect(plans).toContain('15.000');
    expect(plans).toContain('3 oportunidades de búsqueda en total, desde el primer presupuesto');
    expect(plans).not.toMatch(/solicitudes sin límite/i);
    expect(el.querySelector('[data-testid="join-cta"]')?.getAttribute('href')).toBe('/registro/profesional');
    // El cupo Free se dice antes del alta, no al agotarlo.
    const cost = [...el.querySelectorAll('details')].find((d) => text(d).includes('¿Cuánto cuesta?'));
    expect(text(cost)).toContain('Con presupuesto podés responder 3 pedidos de búsqueda en total: no se renueva cada mes');
    expect(text(cost)).toMatch(/PRO es opcional: \$\s?15\.000 por mes/);
    expect(text(cost)).not.toMatch(/solicitudes sin límite/i);
  });
});

