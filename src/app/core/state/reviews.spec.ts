import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { API_URL } from '../api/api.config';
import { authInterceptor } from '../auth/auth.interceptor';
import { AuthResponse, AuthUser } from '../models/auth';
import { ProfessionalDetail, ProfessionalSummary } from '../models/professional';
import { Quote } from '../models/quote';
import { OwnReview, ServiceRequest } from '../models/request';
import { NO_REVIEWS_TEXT, reputationLabel, reputationText, reviewMonth, reviewsLabel } from '../utils/reputation';
import { AuthStore } from './auth.store';
import { ProfessionalsStore } from './professionals.store';
import { RequestDetailPage } from '../../features/client/my-requests/request-detail/request-detail-page';
import { ProfileReviews } from '../../features/client/professional-profile/profile-reviews';
import { ResultCard } from '../../features/client/results/result-card/result-card';
import { Logo } from '../../shared/components/logo/logo';
import { ProSidebar } from '../../layout/pro-sidebar/pro-sidebar';

// HTTP mockeado: estos tests nunca llaman a Render.
const API = 'http://api.test/api/v1';
const REQ_ID = '11111111-1111-4111-8111-111111111111';
const PRO_1 = '22222222-2222-4222-8222-222222222222';

const USER: AuthUser = {
  id: 'u-1', firstName: 'María', lastName: 'González', email: 'maria@example.com', phone: '+54 249 400 1234',
  phoneVerified: false, avatarUrl: null, defaultZoneId: null, professionalProfileId: null,
  createdAt: '2026-09-01T12:00:00.000Z',
};
const tokens: AuthResponse = { accessToken: 'a.1.s', refreshToken: 'r.1.s', expiresIn: 900, tokenType: 'Bearer' };

const request = (overrides: Partial<ServiceRequest> = {}): ServiceRequest => ({
  id: REQ_ID, title: 'Pérdida bajo mesada', description: 'Gotea la pileta de la cocina desde ayer.', urgency: 'FLEXIBLE',
  status: 'COMPLETED', desiredDate: null, desiredTimeRange: null,
  service: { id: 's', name: 'Plomería', slug: 'plomeria' }, zone: { id: 'z', name: 'Villa Italia', slug: 'villa-italia' },
  photos: [], createdAt: '2026-09-25T13:00:00.000Z', updatedAt: '2026-09-25T13:00:00.000Z',
  exactAddress: 'Quintana 860', selectedProfessionalId: PRO_1, acceptedQuoteId: 'q-1',
  completedAt: '2026-09-26T15:00:00.000Z', completedBy: 'PROFESSIONAL', cancelledAt: null, appointment: null,
  completionDue: false, review: null, canReview: true,
  invitations: [
    {
      id: 'inv-1', professionalId: PRO_1, status: 'SELECTED', sentAt: '2026-09-25T13:00:00.000Z', respondedAt: null,
      professional: { id: PRO_1, displayName: 'Francisco Pérez', avatarUrl: null, averageRating: null, reviewsCount: 0 },
    },
  ],
  ...overrides,
});

const pro = (overrides: Partial<ProfessionalSummary> = {}): ProfessionalSummary => ({
  id: PRO_1, firstName: 'Francisco', lastName: 'Pérez', displayName: 'Francisco Pérez', avatarUrl: null, headline: null,
  bio: null, yearsExperience: 4, availableToday: false, averageResponseMinutes: null, averageRating: null,
  reviewsCount: 0, completedJobsCount: 0, services: [], coversEntireCity: true, zones: [],
  verifications: { identity: false, phone: false, license: false, licenses: [] }, pro: false,
  ...overrides,
});

const detail = (overrides: Partial<ProfessionalDetail> = {}): ProfessionalDetail => ({
  ...pro(),
  portfolio: [],
  ratingDistribution: [5, 4, 3, 2, 1].map((stars) => ({ stars, count: 0 })),
  reviews: [],
  ...overrides,
});

@Component({ template: '' })
class Blank {}

const flush = () => new Promise((r) => setTimeout(r));

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([authInterceptor])),
      provideHttpClientTesting(),
      provideRouter([{ path: '**', component: Blank }], withComponentInputBinding()),
      { provide: API_URL, useValue: API },
    ],
  });
  return TestBed.inject(HttpTestingController);
}

async function signIn(user: AuthUser) {
  const auth = TestBed.inject(AuthStore);
  const http = TestBed.inject(HttpTestingController);
  auth.initialize();
  const done = auth.login({ email: user.email, password: 'una-clave-larga' });
  http.expectOne(`${API}/auth/login`).flush(tokens);
  await flush();
  http.expectOne(`${API}/auth/me`).flush(user);
  await done;
}

const button = (el: HTMLElement, label: string) =>
  Array.from(el.querySelectorAll<HTMLButtonElement>('button')).find((b) => (b.textContent ?? '').trim() === label);
const text = (el: HTMLElement) => (el.textContent ?? '').replace(/\s+/g, ' ');

beforeEach(() => sessionStorage.clear());
afterEach(() => TestBed.inject(HttpTestingController).verify({ ignoreCancelled: true }));

// ---------------------------------------------------------------------------
describe('reputación: textos', () => {
  it('singular/plural, sin reseñas y mes de la reseña', () => {
    setup();
    expect(reviewsLabel(1)).toBe('1 reseña');
    expect(reviewsLabel(23)).toBe('23 reseñas');
    expect(reputationText({ averageRating: 4.8, reviewsCount: 23 })).toBe('4,8 · 23 reseñas');
    expect(reputationText({ averageRating: 5, reviewsCount: 1 })).toBe('5,0 · 1 reseña');
    expect(reputationText({ averageRating: null, reviewsCount: 0 })).toBe(NO_REVIEWS_TEXT);
    expect(reputationLabel({ averageRating: 4, reviewsCount: 2 })).toBe('4,0 de 5 estrellas, 2 reseñas');
    // 02:00 UTC del 1/10 = 23:00 del 30/9 en Tandil.
    expect(reviewMonth('2026-10-01T02:00:00.000Z')).toBe('septiembre 2026');
  });
});

// ---------------------------------------------------------------------------
describe('cliente: reseña después del trabajo realizado', () => {
  async function open(r: ServiceRequest) {
    const http = setup();
    await signIn(USER);
    const fixture = TestBed.createComponent(RequestDetailPage);
    fixture.componentRef.setInput('id', REQ_ID);
    fixture.detectChanges();
    await fixture.whenStable();
    for (const x of http.match((q) => q.url.endsWith('/categories') || q.url.endsWith('/services'))) x.flush([]);
    http.expectOne({ method: 'GET', url: `${API}/requests/${REQ_ID}` }).flush(r);
    http.expectOne(`${API}/requests/${REQ_ID}/quotes`).flush([]);
    for (const x of http.match((q) => q.url.startsWith(`${API}/professionals/`))) x.flush(detail());
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const render = async () => {
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    };
    return { http, fixture, el, render };
  }

  /** Respuesta del backend a la relectura después del POST. */
  const afterPost = async (http: HttpTestingController, review: OwnReview | null) => {
    http.expectOne({ method: 'GET', url: `${API}/requests/${REQ_ID}` }).flush(request({ review, canReview: !review }));
    await flush();
    http.expectOne(`${API}/requests/${REQ_ID}/quotes`).flush([]);
    await flush();
  };

  const choose = (el: HTMLElement, stars: number) => {
    const radio = el.querySelector<HTMLInputElement>(`input[type=radio][value="${stars}"]`)!;
    radio.checked = true;
    radio.dispatchEvent(new Event('change'));
  };
  const typeComment = (el: HTMLElement, value: string) => {
    const area = el.querySelector<HTMLTextAreaElement>('#review-comment')!;
    area.value = value;
    area.dispatchEvent(new Event('input'));
  };
  const submit = (el: HTMLElement) =>
    el.querySelector<HTMLFormElement>('app-review-panel form')!.dispatchEvent(new Event('submit'));

  it('el CTA solo aparece cuando el backend dice canReview (no en SCHEDULED ni si ya reseñó)', async () => {
    const { el } = await open(request({ status: 'SCHEDULED', canReview: false, completedAt: null }));
    expect(text(el)).not.toContain('¿Cómo fue tu experiencia');
    expect(button(el, 'Dejar reseña')).toBeUndefined();
  });

  it('COMPLETED sin reseña: CTA con el nombre de pila → formulario accesible', async () => {
    const { el, render } = await open(request());
    expect(text(el)).toContain('Trabajo realizado');
    expect(text(el)).toContain('¿Cómo fue tu experiencia con Francisco?');
    button(el, 'Dejar reseña')!.click();
    await render();
    const fieldset = el.querySelector('app-review-panel fieldset')!;
    expect(fieldset.querySelector('legend')?.textContent).toContain('¿Cómo fue tu experiencia?');
    const radios = Array.from(fieldset.querySelectorAll<HTMLInputElement>('input[type=radio]'));
    // Radios nativos: el teclado (Tab al grupo, flechas para elegir) lo resuelve el navegador.
    expect(radios.map((r) => r.getAttribute('aria-label'))).toEqual(['1 estrella', '2 estrellas', '3 estrellas', '4 estrellas', '5 estrellas']);
    expect(new Set(radios.map((r) => r.name)).size).toBe(1);
    expect(el.querySelector('label[for="review-comment"]')?.textContent).toContain('Comentario');
    expect(el.querySelector('#review-comment')?.getAttribute('placeholder')).toBe('Contanos cómo salió el trabajo.');
    expect(text(el)).toContain('Tu reseña y tu nombre de pila podrán verse en el perfil del profesional.');
    expect(document.activeElement?.id).toBe('review-title');
  });

  it('sin puntaje no publica: avisa y no llama al backend', async () => {
    const { el, render } = await open(request());
    button(el, 'Dejar reseña')!.click();
    await render();
    submit(el);
    await render();
    expect(text(el)).toContain('Elegí un puntaje de 1 a 5 estrellas.');
    expect(el.querySelector('fieldset')?.getAttribute('aria-describedby')).toBe('review-rating-error');
  });

  it('puntaje + comentario → UN POST (sin profesional en el body) → agradecimiento', async () => {
    const { http, el, render } = await open(request());
    button(el, 'Dejar reseña')!.click();
    await render();
    choose(el, 5);
    typeComment(el, '  Llegó puntual y resolvió el problema.  ');
    await render();
    expect(text(el)).toContain('5 de 5');
    submit(el);
    submit(el); // doble envío: se ignora
    await render();
    const post = http.expectOne({ method: 'POST', url: `${API}/requests/${REQ_ID}/review` });
    expect(post.request.body).toEqual({ rating: 5, comment: 'Llegó puntual y resolvió el problema.' });
    expect(button(el, 'Publicando…')?.disabled).toBe(true);
    const review: OwnReview = { id: 'rv-1', rating: 5, comment: 'Llegó puntual y resolvió el problema.', createdAt: '2026-09-26T16:00:00.000Z' };
    post.flush(review);
    await flush();
    await afterPost(http, review);
    await render();
    expect(text(el)).toContain('Gracias por compartir tu experiencia.');
    expect(text(el)).toContain('“Llegó puntual y resolvió el problema.”');
    expect(el.querySelector('app-review-panel app-stars')?.getAttribute('aria-label')).toBe('5 de 5 estrellas');
    expect(button(el, 'Dejar reseña')).toBeUndefined();
    expect(text(el)).toContain('Trabajo realizado');
  });

  it('solo estrellas (comentario vacío): el body no lleva comentario', async () => {
    const { http, el, render } = await open(request());
    button(el, 'Dejar reseña')!.click();
    await render();
    choose(el, 3);
    typeComment(el, '   ');
    submit(el);
    await render();
    const post = http.expectOne({ method: 'POST', url: `${API}/requests/${REQ_ID}/review` });
    expect(post.request.body).toEqual({ rating: 3 });
    post.flush({ id: 'rv-1', rating: 3, comment: null, createdAt: '2026-09-26T16:00:00.000Z' });
    await flush();
    await afterPost(http, { id: 'rv-1', rating: 3, comment: null, createdAt: '2026-09-26T16:00:00.000Z' });
    await render();
    expect(el.querySelector('app-review-panel app-stars')?.getAttribute('aria-label')).toBe('3 de 5 estrellas');
  });

  it('HTML en el comentario: se avisa sin llamar al backend', async () => {
    const { el, render } = await open(request());
    button(el, 'Dejar reseña')!.click();
    await render();
    choose(el, 4);
    typeComment(el, 'Bien <b>hecho</b>');
    await render();
    submit(el);
    await render();
    expect(text(el)).toContain('Escribí solo texto, sin etiquetas HTML.');
    expect(el.querySelector('#review-comment')?.getAttribute('aria-invalid')).toBe('true');
  });

  it('error del servidor: mensaje recuperable y se puede reintentar', async () => {
    const { http, el, render } = await open(request());
    button(el, 'Dejar reseña')!.click();
    await render();
    choose(el, 4);
    submit(el);
    await render();
    http.expectOne({ method: 'POST', url: `${API}/requests/${REQ_ID}/review` }).flush({}, { status: 500, statusText: 'x' });
    await flush();
    await render();
    expect(el.querySelector('app-review-panel [role="alert"]')?.textContent).toContain('No pudimos publicar tu reseña. Probá de nuevo.');
    expect(button(el, 'Publicar reseña')?.disabled).toBe(false);
  });

  it('ya reseñado (otra pestaña): 409 → relee y muestra "Tu reseña"', async () => {
    const { http, el, render } = await open(request());
    button(el, 'Dejar reseña')!.click();
    await render();
    choose(el, 2);
    submit(el);
    await render();
    http
      .expectOne({ method: 'POST', url: `${API}/requests/${REQ_ID}/review` })
      .flush({ code: 'REVIEW_ALREADY_EXISTS' }, { status: 409, statusText: 'x' });
    await flush();
    await afterPost(http, { id: 'rv-1', rating: 4, comment: null, createdAt: '2026-09-26T16:00:00.000Z' });
    await render();
    expect(text(el)).toContain('Tu reseña');
    expect(el.querySelector('app-review-panel app-stars')?.getAttribute('aria-label')).toBe('4 de 5 estrellas');
  });

  it('ya reseñado: "Tu reseña" sin CTA nuevo', async () => {
    const { el } = await open(
      request({ canReview: false, review: { id: 'rv-1', rating: 4, comment: 'Muy prolijo', createdAt: '2026-09-26T16:00:00.000Z' } }),
    );
    expect(text(el)).toContain('Tu reseña');
    expect(text(el)).toContain('“Muy prolijo”');
    expect(button(el, 'Dejar reseña')).toBeUndefined();
    expect(el.querySelector('app-review-panel form')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe('presupuestos: reputación real al comparar', () => {
  const quote = (id: string, averageRating: number | null, reviewsCount: number): Quote => ({
    id, requestId: REQ_ID, professionalId: `pro-${id}`,
    professional: { id: `pro-${id}`, displayName: `Pro ${id}`, avatarUrl: null, averageRating, reviewsCount },
    description: 'Cambio de sifón', laborAmount: '300000.00', materialsAmount: '0.00', totalAmount: '300000.00', currency: 'ARS',
    availableFrom: null, validUntil: null, status: 'PENDING', items: [],
    createdAt: '2026-09-25T14:00:00.000Z', updatedAt: '2026-09-25T14:00:00.000Z',
  });

  it('"★ 4,8 · 23 reseñas", "1 reseña" o "Sin reseñas todavía"; nunca "Recomendado"', async () => {
    const http = setup();
    await signIn(USER);
    const fixture = TestBed.createComponent(RequestDetailPage);
    fixture.componentRef.setInput('id', REQ_ID);
    fixture.detectChanges();
    await fixture.whenStable();
    for (const x of http.match((q) => q.url.endsWith('/categories') || q.url.endsWith('/services'))) x.flush([]);
    http
      .expectOne({ method: 'GET', url: `${API}/requests/${REQ_ID}` })
      .flush(request({ status: 'QUOTES_RECEIVED', selectedProfessionalId: null, acceptedQuoteId: null, completedAt: null, canReview: false }));
    http.expectOne(`${API}/requests/${REQ_ID}/quotes`).flush([quote('a', 4.8, 23), quote('b', 5, 1), quote('c', null, 0)]);
    await flush();
    for (const x of http.match((q) => q.url.startsWith(`${API}/professionals/`))) x.flush(detail());
    fixture.detectChanges();
    await fixture.whenStable();
    const cards = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('article')).map(text);
    expect(cards[0]).toContain('4,8 · 23 reseñas');
    expect(cards[1]).toContain('5,0 · 1 reseña');
    expect(cards[1]).not.toContain('1 reseñas');
    expect(cards[2]).toContain('Sin reseñas todavía');
    expect(text(fixture.nativeElement)).not.toContain('Recomendado');
  });
});

// ---------------------------------------------------------------------------
describe('perfil público: opiniones', () => {
  function renderReviews(p: ProfessionalDetail) {
    const http = setup();
    const store = TestBed.inject(ProfessionalsStore);
    store.selected.set(p);
    const fixture = TestBed.createComponent(ProfileReviews);
    fixture.componentRef.setInput('pro', store.selected()!);
    fixture.detectChanges();
    return { http, fixture, store, el: fixture.nativeElement as HTMLElement };
  }

  it('sin reseñas: texto honesto, sin promedio ni estrellas', () => {
    const { el } = renderReviews(detail());
    expect(text(el)).toContain('Todavía no tiene reseñas.');
    expect(text(el)).toContain('Cuando complete trabajos en Resuelve, sus clientes podrán compartir su experiencia.');
    expect(el.querySelector('app-stars')).toBeNull();
    expect(text(el)).not.toMatch(/\d,\d/);
  });

  it('con reseñas: promedio a 1 decimal, cantidad, solo nombre de pila y mes', () => {
    const { el } = renderReviews(
      detail({
        averageRating: 4,
        reviewsCount: 2,
        ratingDistribution: [{ stars: 5, count: 1 }, { stars: 4, count: 0 }, { stars: 3, count: 1 }, { stars: 2, count: 0 }, { stars: 1, count: 0 }],
        reviews: [
          { id: 'r2', rating: 3, comment: null, reviewerDisplayName: 'Beto', createdAt: '2026-09-20T12:00:00Z' },
          { id: 'r1', rating: 5, comment: 'Llegó puntual y dejó todo funcionando.', reviewerDisplayName: 'María', createdAt: '2026-09-01T12:00:00Z' },
        ],
      }),
    );
    expect(el.querySelector('h2')?.textContent).toBe('Opiniones');
    expect(el.querySelector('[role="img"][aria-label="4,0 de 5 estrellas, 2 reseñas"]')).not.toBeNull();
    expect(text(el)).toContain('4,0');
    expect(text(el)).toContain('2 reseñas');
    expect(text(el)).toContain('“Llegó puntual y dejó todo funcionando.”');
    expect(text(el)).toContain('María · septiembre 2026');
    const stars = Array.from(el.querySelectorAll('li app-stars')).map((s) => s.getAttribute('aria-label'));
    expect(stars).toEqual(['3 de 5 estrellas', '5 de 5 estrellas']); // más recientes primero, sin ocultar críticas
    expect(button(el, 'Ver más reseñas')).toBeUndefined();
  });

  it('una sola reseña: singular', () => {
    const { el } = renderReviews(
      detail({ averageRating: 5, reviewsCount: 1, reviews: [{ id: 'r1', rating: 5, comment: null, reviewerDisplayName: 'Ana', createdAt: '2026-09-01T12:00:00Z' }] }),
    );
    expect(text(el)).toContain('1 reseña');
    expect(text(el)).not.toContain('1 reseñas');
  });

  it('"Ver más reseñas" pide la página siguiente y las agrega', async () => {
    const first = Array.from({ length: 10 }, (_, i) => ({
      id: `r${i}`, rating: 5, comment: null, reviewerDisplayName: 'Ana', createdAt: '2026-09-01T12:00:00Z',
    }));
    const { http, fixture, store, el } = renderReviews(detail({ averageRating: 4.9, reviewsCount: 11, reviews: first }));
    button(el, 'Ver más reseñas')!.click();
    const req = http.expectOne((r) => r.url === `${API}/professionals/${PRO_1}/reviews`);
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('pageSize')).toBe('10');
    req.flush({ items: [{ id: 'r10', rating: 1, comment: 'No vino', reviewerDisplayName: 'Leo', createdAt: '2026-08-01T12:00:00Z' }], page: 2, pageSize: 10, total: 11 });
    fixture.componentRef.setInput('pro', store.selected()!);
    fixture.detectChanges();
    expect(el.querySelectorAll('li app-stars').length).toBe(11);
    expect(text(el)).toContain('“No vino”');
    expect(button(el, 'Ver más reseñas')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
describe('reputación en resultados y marca', () => {
  it('card de resultado: "Sin reseñas todavía" o rating real con singular/plural', () => {
    setup();
    const fixture = TestBed.createComponent(ResultCard);
    fixture.componentRef.setInput('pro', pro());
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(text(el)).toContain('Sin reseñas todavía');
    fixture.componentRef.setInput('pro', pro({ averageRating: 4.8, reviewsCount: 23 }));
    fixture.detectChanges();
    expect(text(el)).toContain('4,8');
    expect(text(el)).toContain('23 reseñas');
    fixture.componentRef.setInput('pro', pro({ averageRating: 5, reviewsCount: 1 }));
    fixture.detectChanges();
    expect(text(el)).toContain('(1 reseña)');
  });

  it('el logo y el sidebar profesional no muestran un "Pro" comercial', async () => {
    setup();
    const logo = TestBed.createComponent(Logo);
    logo.detectChanges();
    expect(text(logo.nativeElement).trim()).toBe('Resuelve');
    const sidebar = TestBed.createComponent(ProSidebar);
    sidebar.detectChanges();
    await sidebar.whenStable();
    const el = sidebar.nativeElement as HTMLElement;
    expect(el.querySelector('app-logo')?.textContent?.trim()).toBe('Resuelve');
    expect(el.querySelector('a[href="/pro/dashboard"]')?.getAttribute('aria-label')).toBe('Resuelve, panel profesional');
    expect(text(el)).not.toMatch(/\bPro\b|Resuelve PRO/);
  });
});
