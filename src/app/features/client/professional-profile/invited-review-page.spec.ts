import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { API_URL } from '../../../core/api/api.config';
import { AuthStore } from '../../../core/state/auth.store';
import { InvitedReviewPage } from './invited-review-page';

const PRO = {
  id: 'pro-1',
  slug: 'juan-plomero',
  firstName: 'Juan',
  lastName: 'Pérez',
  displayName: 'Juan P.',
  avatarUrl: null,
  headline: 'Plomero matriculado',
  services: [{ id: 's1', name: 'Plomería', slug: 'plomeria' }],
  reviews: [],
  reviewsCount: 0,
  averageRating: null,
};
const OPEN = { canReview: true, blocker: null, requestId: null, review: null };

function setup(status: object = OPEN) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: API_URL, useValue: '/api' },
      { provide: AuthStore, useValue: { authenticated: signal(true), user: signal({ firstName: 'Laura' }) } },
    ],
  });
  const http = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(InvitedReviewPage);
  fixture.componentRef.setInput('slug', 'juan-plomero');
  fixture.detectChanges();
  http.expectOne('/api/professionals/public/juan-plomero').flush(PRO);
  fixture.detectChanges();
  http.expectOne('/api/professionals/pro-1/invited-review').flush(status);
  fixture.detectChanges();
  return { http, fixture, el: fixture.nativeElement as HTMLElement };
}

const stars = (el: HTMLElement) => Array.from(el.querySelectorAll<HTMLInputElement>('input[type="radio"]'));

describe('InvitedReviewPage', () => {
  it('muestra al profesional y estrellas grandes; el comentario y el botón aparecen al puntuar', () => {
    const { fixture, el } = setup();
    expect(el.querySelector('h1')?.textContent).toContain('¿Cómo te fue con Juan?');
    expect(stars(el)).toHaveLength(5);
    expect(el.querySelector('textarea')).toBeNull();
    stars(el)[3].click();
    fixture.detectChanges();
    expect(el.querySelector('textarea')).not.toBeNull();
    expect(el.textContent).toContain('4 de 5');
    expect(el.textContent).toContain('Cliente invitado por el profesional');
  });

  it('envía puntaje y comentario, y agradece con el nombre', async () => {
    const { http, fixture, el } = setup();
    stars(el)[4].click();
    fixture.detectChanges();
    await fixture.whenStable(); // ngModel registra el control en un microtask
    const textarea = el.querySelector('textarea') as HTMLTextAreaElement;
    textarea.value = '  Llegó puntual.  ';
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    (el.querySelector('[data-testid="invited-submit"]') as HTMLButtonElement).click();
    const req = http.expectOne('/api/professionals/pro-1/invited-review');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ rating: 5, comment: 'Llegó puntual.' });
    req.flush({ id: 'r1', rating: 5, comment: 'Llegó puntual.', createdAt: '2026-10-06T10:00:00Z' });
    fixture.detectChanges();
    expect(el.querySelector('h1')?.textContent).toContain('¡Gracias, Laura!');
    expect(el.textContent).toContain('Tu reseña ya está en el perfil de Juan');
    expect(el.querySelector('a[href="/p/juan-plomero"]')).not.toBeNull();
  });

  it('sin comentario no manda el campo', () => {
    const { http, fixture, el } = setup();
    stars(el)[2].click();
    fixture.detectChanges();
    (el.querySelector('[data-testid="invited-submit"]') as HTMLButtonElement).click();
    expect(http.expectOne('/api/professionals/pro-1/invited-review').request.body).toEqual({ rating: 3 });
  });

  it('ya reseñó: muestra su reseña y no el formulario', () => {
    const { el } = setup({
      canReview: false,
      blocker: 'ALREADY_REVIEWED',
      requestId: null,
      review: { id: 'r1', rating: 4, comment: 'Todo bien', createdAt: '2026-10-01T00:00:00Z' },
    });
    expect(el.textContent).toContain('Ya dejaste tu reseña');
    expect(el.textContent).toContain('Todo bien');
    expect(el.querySelector('form')).toBeNull();
  });

  it('lo contrató por Resuelve: lo manda a reseñar desde su trabajo', () => {
    const { el } = setup({ canReview: false, blocker: 'USE_JOB_REVIEW', requestId: 'req-9', review: null });
    expect(el.textContent).toContain('Contrataste a Juan por Resuelve');
    expect(el.querySelector('a[href="/mis-solicitudes/req-9#resena"]')).not.toBeNull();
  });

  it('es su propio perfil: no puede reseñarse', () => {
    const { el } = setup({ canReview: false, blocker: 'OWN_PROFILE', requestId: null, review: null });
    expect(el.textContent).toContain('Este es tu perfil');
    expect(el.querySelector('form')).toBeNull();
  });

  it('un 409 al enviar vuelve a leer el estado real en vez de mostrar un error', () => {
    const { http, fixture, el } = setup();
    stars(el)[0].click();
    fixture.detectChanges();
    (el.querySelector('[data-testid="invited-submit"]') as HTMLButtonElement).click();
    http.expectOne({ method: 'POST', url: '/api/professionals/pro-1/invited-review' }).flush(
      { code: 'REVIEW_ALREADY_EXISTS' },
      { status: 409, statusText: 'Conflict' },
    );
    http.expectOne({ method: 'GET', url: '/api/professionals/pro-1/invited-review' }).flush({
      canReview: false,
      blocker: 'ALREADY_REVIEWED',
      requestId: null,
      review: { id: 'r1', rating: 1, comment: null, createdAt: '2026-10-06T00:00:00Z' },
    });
    fixture.detectChanges();
    expect(el.textContent).toContain('Ya dejaste tu reseña');
    expect(el.querySelector('[role="alert"]')).toBeNull();
  });

  it('perfil inexistente: lo dice y ofrece volver al inicio', () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: API_URL, useValue: '/api' },
        { provide: AuthStore, useValue: { authenticated: signal(true), user: signal({ firstName: 'Laura' }) } },
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(InvitedReviewPage);
    fixture.componentRef.setInput('slug', 'nadie');
    fixture.detectChanges();
    http.expectOne('/api/professionals/public/nadie').flush({}, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No encontramos este perfil');
  });
});
