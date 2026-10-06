import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { API_URL } from '../../../core/api/api.config';
import { AuthStore } from '../../../core/state/auth.store';
import { ProfessionalDetail } from '../../../core/models/professional';
import { ProfileReviews } from './profile-reviews';

const review = (id: string, rating: number, invited: boolean) => ({
  id,
  rating,
  comment: `Comentario ${id}`,
  reviewerDisplayName: 'Ana',
  invited,
  createdAt: '2026-10-01T12:00:00.000Z',
});

function render(extra: Partial<ProfessionalDetail>, signedIn = false) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: API_URL, useValue: '/api' },
      { provide: AuthStore, useValue: { authenticated: signal(signedIn) } },
    ],
  });
  const fixture = TestBed.createComponent(ProfileReviews);
  fixture.componentRef.setInput('pro', {
    id: 'pro-1',
    slug: 'juan-plomero',
    firstName: 'Juan',
    averageRating: null,
    reviewsCount: 0,
    ratingDistribution: [],
    reviews: [],
    ...extra,
  } as unknown as ProfessionalDetail);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('ProfileReviews · clientes invitados', () => {
  it('sin reseñas verificadas, las invitadas aparecen aparte y el puntaje sigue vacío', () => {
    const el = render({ invitedReviewsCount: 2, invitedAverageRating: 4.5, invitedReviews: [review('a', 5, true), review('b', 4, true)] });
    expect(el.textContent).toContain('Todavía no tiene reseñas.');
    const invited = el.querySelector('[data-testid="invited-reviews"]');
    expect(invited?.textContent).toContain('Clientes invitados');
    expect(invited?.textContent).toContain('4,5 ★ · 2 reseñas');
    expect(invited?.textContent).toContain('no cuentan en su puntaje');
    expect(invited?.querySelectorAll('li')).toHaveLength(2);
  });

  it('sin invitadas no muestra la sección, pero sí el botón para dejar una reseña', () => {
    const el = render({});
    expect(el.querySelector('[data-testid="invited-reviews"]')).toBeNull();
    const cta = el.querySelector('[data-testid="leave-review"]') as HTMLAnchorElement;
    expect(cta.getAttribute('href')).toBe('/p/juan-plomero/resenar');
  });

  it('sin slug el botón usa el id', () => {
    const el = render({ slug: undefined });
    expect((el.querySelector('[data-testid="leave-review"]') as HTMLAnchorElement).getAttribute('href')).toBe(
      '/profesional/pro-1/resenar',
    );
  });

  it('Reportar solo aparece con sesión, en las dos listas, y abre el diálogo de esa reseña', () => {
    const detail = {
      averageRating: 5,
      reviewsCount: 1,
      ratingDistribution: [{ stars: 5, count: 1 }],
      reviews: [review('v1', 5, false)],
      invitedReviewsCount: 1,
      invitedAverageRating: 4,
      invitedReviews: [review('i1', 4, true)],
    } as Partial<ProfessionalDetail>;
    expect(render(detail).querySelectorAll('button[aria-label^="Reportar"]')).toHaveLength(0);
    TestBed.resetTestingModule();
    const el = render(detail, true);
    const buttons = el.querySelectorAll<HTMLButtonElement>('button[aria-label^="Reportar"]');
    expect(buttons).toHaveLength(2);
  });
});
