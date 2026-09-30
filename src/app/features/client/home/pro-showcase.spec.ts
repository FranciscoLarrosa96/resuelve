import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { avatarOf } from '../../../core/models/avatar';
import { ProfessionalSummary } from '../../../core/models/professional';
import { ProShowcase, ShowcaseItem, visibleCardsForWidth } from './pro-showcase';

const professional = (id: string, overrides: Partial<ProfessionalSummary> = {}): ProfessionalSummary => ({
  id,
  firstName: 'Ana',
  lastName: 'Pérez',
  displayName: `Ana Pérez ${id}`,
  avatarUrl: null,
  headline: null,
  bio: null,
  yearsExperience: 0,
  availableToday: false,
  averageResponseMinutes: null,
  averageRating: null,
  reviewsCount: 0,
  completedJobsCount: 0,
  services: [],
  coversEntireCity: false,
  zones: [],
  verifications: { identity: false, phone: false, license: false, licenses: [] },
  pro: true,
  ...overrides,
});

const showcaseItem = (id: string, overrides: Partial<ProfessionalSummary> = {}): ShowcaseItem => {
  const pro = professional(id, overrides);
  return { pro, avatar: avatarOf(pro) };
};

@Component({
  imports: [ProShowcase],
  template: `<div [style.width.px]="width"><app-pro-showcase style="display:block;width:100%" [items]="items" [loading]="loading" /></div>`,
})
class ShowcaseHost {
  width = 700;
  items: ShowcaseItem[] = [];
  loading = false;
}

async function render(items: ShowcaseItem[], width = 700) {
  TestBed.configureTestingModule({ imports: [ShowcaseHost], providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(ShowcaseHost);
  fixture.componentInstance.items = items;
  fixture.componentInstance.width = width;
  fixture.detectChanges();
  await new Promise((resolve) => setTimeout(resolve, 20));
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

function desktopCards(el: HTMLElement): HTMLLIElement[] {
  return Array.from(el.querySelectorAll<HTMLLIElement>('[aria-live="off"] > li'));
}

describe('ProShowcase', () => {
  it('con 1 destacado no muestra flechas y limita el ancho de la tarjeta desktop', async () => {
    const { el } = await render([showcaseItem('p1')]);
    expect(desktopCards(el).length).toBe(1);
    expect(el.querySelectorAll('button[aria-label$="profesional destacado"]').length).toBe(0);
    expect(el.querySelector('[aria-live="off"]')?.getAttribute('style')).toContain('max-width: 560px');
    expect(el.querySelector('[aria-live="off"] a')?.getAttribute('aria-label')).toBe('Ver perfil de Ana Pérez p1');
  });

  it('con 2 destacados muestra ambos sin navegación innecesaria', async () => {
    const { el } = await render([showcaseItem('p1'), showcaseItem('p2')]);
    expect(desktopCards(el).length).toBe(2);
    expect(el.querySelectorAll('button[aria-label$="profesional destacado"]').length).toBe(0);
  });

  it('con 3+ destacados pagina por grupos y deshabilita los límites reales', async () => {
    const { fixture, el } = await render([showcaseItem('p1'), showcaseItem('p2'), showcaseItem('p3'), showcaseItem('p4')]);
    const previous = el.querySelector<HTMLButtonElement>('[aria-label="Anterior profesional destacado"]')!;
    const next = el.querySelector<HTMLButtonElement>('[aria-label="Siguiente profesional destacado"]')!;
    expect(desktopCards(el).map((card) => card.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('p1'), expect.stringContaining('p2')]));
    expect(previous.disabled).toBe(true);
    expect(next.disabled).toBe(false);

    next.click();
    fixture.detectChanges();
    expect(desktopCards(el).map((card) => card.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('p3'), expect.stringContaining('p4')]));
    expect(previous.disabled).toBe(false);
    expect(next.disabled).toBe(true);

    previous.click();
    fixture.detectChanges();
    expect(desktopCards(el).map((card) => card.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('p1'), expect.stringContaining('p2')]));
  });

  it('adapta la cantidad de tarjetas al ancho disponible', () => {
    expect(visibleCardsForWidth(899)).toBe(2);
    expect(visibleCardsForWidth(900)).toBe(3);
    expect(visibleCardsForWidth(1440)).toBe(3);
  });

  it('conserva la página visible hasta que el usuario navega', async () => {
    const { fixture, el } = await render([showcaseItem('p1'), showcaseItem('p2'), showcaseItem('p3'), showcaseItem('p4')]);
    const firstPage = desktopCards(el).map((card) => card.textContent);
    vi.useFakeTimers();
    try {
      vi.advanceTimersByTime(30_000);
      fixture.detectChanges();
      expect(desktopCards(el).map((card) => card.textContent)).toEqual(firstPage);
    } finally {
      vi.useRealTimers();
    }
  });

  it('el carrusel mobile conserva todas las tarjetas, snap y preview táctil', async () => {
    const { el } = await render([showcaseItem('p1'), showcaseItem('p2'), showcaseItem('p3')]);
    const mobile = el.querySelector<HTMLUListElement>('ul[tabindex="0"]')!;
    expect(mobile.children.length).toBe(3);
    expect(mobile.className).toContain('snap-x');
    expect(mobile.className).toContain('overflow-x-auto');
    expect(mobile.querySelector('li')?.className).toContain('82vw');
    expect(el.textContent).toContain('Deslizá para ver otro perfil destacado');
    expect(el.querySelector('[aria-live="off"] app-featured-label')?.textContent).toContain('Espacio promocionado (pago)');
  });

  it('degrada datos opcionales: sin reviews, sin trabajos, sin experiencia y fallback de avatar', async () => {
    const { el } = await render([
      showcaseItem('p1', {
        displayName: 'Ana Pérez',
        headline: 'Plomería',
        services: [
          { id: 's1', name: 'Plomería', slug: 'plomeria' },
          { id: 's2', name: 'Gas', slug: 'gas' },
        ],
      }),
    ]);
    const card = el.querySelector('[aria-live="off"] a')!;
    expect(card.textContent).toContain('Plomería');
    expect(card.textContent).toContain('+1 servicio');
    expect(card.textContent).toContain('Sin reseñas todavía');
    expect(card.textContent).not.toContain('trabajos por Resuelve');
    expect(card.textContent).not.toContain('0 años');
    expect(card.querySelector('app-avatar img')).toBeNull();
    expect(card.querySelector('app-avatar')?.textContent).toContain('AP');
  });

  it('muestra reseñas, disponibilidad, trabajos, experiencia y resumen de zonas reales', async () => {
    const { el } = await render([
      showcaseItem('p1', {
        availableToday: true,
        averageRating: 4.8,
        reviewsCount: 12,
        completedJobsCount: 4,
        yearsExperience: 10,
        services: [{ id: 's1', name: 'Electricidad', slug: 'electricidad' }],
        zones: [
          { id: 'z1', name: 'Centro', slug: 'centro' },
          { id: 'z2', name: 'Villa Italia', slug: 'villa-italia' },
          { id: 'z3', name: 'Uncas', slug: 'uncas' },
        ],
      }),
    ]);
    const card = el.querySelector('[aria-live="off"] a')!;
    expect(card.textContent).toContain('4,8');
    expect(card.textContent).toContain('12 reseñas');
    expect(card.textContent).toContain('Disponible hoy');
    expect(card.textContent).toContain('4 trabajos por Resuelve');
    expect(card.textContent).toContain('10 años de experiencia');
    expect(card.textContent).toContain('Centro, Villa Italia +1');
    expect(card.textContent).toContain('Ver perfil');
  });

  it('resume cobertura total como Todo Tandil', async () => {
    const { el } = await render([showcaseItem('p1', { coversEntireCity: true })]);
    expect(el.querySelector('[aria-live="off"] a')?.textContent).toContain('Todo Tandil');
  });

  it('no crea un estado vacío con 0 perfiles', async () => {
    const empty = await render([]);
    expect(desktopCards(empty.el).length).toBe(0);
    expect(empty.el.querySelectorAll('button').length).toBe(0);
  });

  it('presenta un skeleton accesible mientras los destacados cargan', async () => {
    TestBed.configureTestingModule({ imports: [ShowcaseHost], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(ShowcaseHost);
    fixture.componentInstance.loading = true;
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="status"]')?.textContent).toContain('Cargando profesionales destacados');
    expect(fixture.nativeElement.querySelector('[aria-live="off"]')).toBeNull();
  });
});
