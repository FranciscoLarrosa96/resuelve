import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { ProfessionalSummary } from '../../../../core/models/professional';
import { useTestLocality } from '../../../../core/state/locality.testing';
import { ProfessionalsStore } from '../../../../core/state/professionals.store';
import { ResultCard } from './result-card';

const svc = (slug: string, name: string) => ({ id: `id-${slug}`, name, slug });
const SERVICES = [
  svc('electricidad', 'Electricidad'),
  svc('redes', 'Redes'),
  svc('reparacion-de-pc', 'Reparación de PC'),
  svc('gas', 'Gas'),
  svc('pintura', 'Pintura'),
];

const professional = (overrides: Partial<ProfessionalSummary> = {}): ProfessionalSummary => ({
  id: 'p1',
  firstName: 'Ana',
  lastName: 'Pérez',
  displayName: 'Ana Pérez',
  avatarUrl: null,
  headline: 'Técnica matriculada',
  bio: null,
  yearsExperience: 5,
  availableToday: false,
  averageResponseMinutes: null,
  averageRating: null,
  reviewsCount: 0,
  completedJobsCount: 0,
  services: SERVICES,
  coversEntireCity: false,
  zones: [],
  verifications: { identity: false, phone: false, license: false, licenses: [] },
  pro: false,
  ...overrides,
});

function render(pro: ProfessionalSummary, serviceId: string | null = null) {
  useTestLocality();
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  TestBed.inject(ProfessionalsStore).setFilters({ serviceId });
  const fixture = TestBed.createComponent(ResultCard);
  fixture.componentRef.setInput('pro', pro);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return {
    el,
    names: () => [...el.querySelectorAll('[data-testid=service-chip] .service-chip-name')].map((n) => n.textContent),
  };
}

describe('chips de servicios en los resultados', () => {
  it('Free: dos chips y +3, con el título declarado aparte', () => {
    const { el, names } = render(professional());
    expect(names()).toEqual(['Electricidad', 'Redes']);
    expect(el.querySelector('[data-testid=service-chip-more]')?.textContent).toContain('+3');
    expect(el.querySelector('.result-subtitle')?.textContent).toBe('Técnica matriculada · 5 años de experiencia');
  });

  it('PRO: mismos chips y sin lista de servicios en texto', () => {
    const { el, names } = render(professional({ pro: true, bio: 'Hola' }));
    expect(names()).toEqual(['Electricidad', 'Redes']);
    expect(el.querySelector('.result-services')).toBeNull();
  });

  it('Destacado PRO: mismos chips', () => {
    const { names } = render(professional({ pro: true, isFeaturedPlacement: true }));
    expect(names()).toEqual(['Electricidad', 'Redes']);
  });

  it('el servicio buscado va primero', () => {
    const { names } = render(professional(), 'id-reparacion-de-pc');
    expect(names()).toEqual(['Reparación de PC', 'Electricidad']);
  });

  it('sin servicios no hay chips ni se inventa uno desde el título', () => {
    const { el, names } = render(professional({ services: [] }));
    expect(names()).toEqual([]);
    expect(el.querySelector('.result-subtitle')?.textContent).toContain('Técnica matriculada');
  });

  it('un título igual al servicio no se repite', () => {
    const { el } = render(professional({ headline: 'Electricidad', services: [SERVICES[0]] }));
    expect(el.querySelector('.result-subtitle')?.textContent).toBe('5 años de experiencia');
  });
});
