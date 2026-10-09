import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { avatarOf } from '../../../core/models/avatar';
import { ProfessionalSummary } from '../../../core/models/professional';
import { ProShowcase, ShowcaseItem } from './pro-showcase';

const professional = (
  id: string,
  overrides: Partial<ProfessionalSummary> = {},
): ProfessionalSummary => ({
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
  template: `<div [style.width.px]="width">
    <app-pro-showcase style="display:block;width:100%" [items]="items" [loading]="loading" />
  </div>`,
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

const cards = (el: HTMLElement) => Array.from(el.querySelectorAll<HTMLElement>('li.card'));
const lead = (el: HTMLElement) => cards(el)[0] ?? null;
const links = (el: HTMLElement) =>
  cards(el).map((card) => card.querySelector('a')?.getAttribute('aria-label'));

describe('ProShowcase', () => {
  it('con 1 destacado muestra una sola ficha que enlaza al perfil', async () => {
    const { el } = await render([showcaseItem('p1')]);
    expect(links(el)).toEqual(['Ver perfil de Ana Pérez p1']);
    expect(lead(el)?.querySelector('a')?.getAttribute('href')).toBe('/profesional/p1');
    expect(el.querySelector('ul.showcase')?.classList).toContain('n1');
    expect(el.querySelectorAll('button')).toHaveLength(0);
  });

  it('con 2 destacados muestra dos fichas iguales', async () => {
    const { el } = await render([showcaseItem('p1'), showcaseItem('p2')]);
    expect(cards(el)).toHaveLength(2);
    expect(cards(el)[1].textContent).toContain('Ana Pérez p2');
    expect(el.querySelector('ul.showcase')?.classList).toContain('n2');
  });

  it('muestra como máximo tres perfiles en orden, sin carrusel ni paginación', async () => {
    const { el } = await render(['p1', 'p2', 'p3', 'p4'].map((id) => showcaseItem(id)));
    expect(links(el)).toEqual([
      'Ver perfil de Ana Pérez p1',
      'Ver perfil de Ana Pérez p2',
      'Ver perfil de Ana Pérez p3',
    ]);
    expect(el.querySelectorAll('button')).toHaveLength(0);
    expect(el.querySelector('[aria-roledescription="carrusel"]')).toBeNull();
    expect(el.textContent).not.toContain('Deslizá');
  });

  it('no muestra "No toma urgencias": solo la disponibilidad cuando es cierta', async () => {
    const { el } = await render([showcaseItem('p1'), showcaseItem('p2', { availableToday: true })]);
    expect(el.textContent).not.toContain('No toma urgencias');
    expect(cards(el)[0].textContent).not.toContain('Toma urgencias');
    expect(cards(el)[1].textContent).toContain('Toma urgencias');
  });

  it('cuenta los servicios extra junto al principal', async () => {
    const { el } = await render([
      showcaseItem('p1', {
        headline: 'Técnico soporte PC',
        services: [
          { id: 's1', name: 'Soporte PC', slug: 'soporte-pc' },
          { id: 's2', name: 'Redes', slug: 'redes' },
        ],
      }),
    ]);
    expect(lead(el)!.textContent!.replace(/\s+/g, ' ')).toContain(
      'Técnico soporte PC · +1 servicio',
    );
  });

  it('conserva los perfiles visibles sin rotación automática', async () => {
    const { fixture, el } = await render(['p1', 'p2', 'p3'].map((id) => showcaseItem(id)));
    const before = el.textContent;
    vi.useFakeTimers();
    try {
      vi.advanceTimersByTime(30_000);
      fixture.detectChanges();
      expect(el.textContent).toBe(before);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rotula el espacio promocionado una sola vez y enlaza a todos los profesionales', async () => {
    const { el } = await render([showcaseItem('p1')]);
    expect(el.textContent?.match(/Espacio promocionado/g)).toHaveLength(1);
    expect(el.textContent).toContain('Destacado PRO');
    expect(el.querySelector('a[href="/profesionales"]')?.textContent).toContain(
      'Ver todos los profesionales',
    );
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
    const card = lead(el)!;
    expect(card.textContent).toContain('Plomería');
    expect(card.textContent).toContain('+1 servicio');
    expect(card.textContent).toContain('Sin reseñas todavía');
    expect(card.textContent).not.toContain('Por Resuelve');
    expect(card.textContent).not.toContain('Experiencia');
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
    const text = lead(el)!.textContent!.replace(/\s+/g, ' ');
    expect(text).toContain('4,8');
    expect(text).toContain('12 reseñas');
    expect(text).toContain('Toma urgencias');
    expect(text).toContain('4 trabajos');
    expect(text).toContain('10 años');
    expect(text).toContain('Centro, Villa Italia +1');
    expect(text).toContain('Ver perfil');
  });

  it('resume cobertura total como Todo Tandil', async () => {
    const { el } = await render([showcaseItem('p1', { coversEntireCity: true })]);
    expect(lead(el)?.textContent).toContain('Todo Tandil');
  });

  it('no crea un estado vacío con 0 perfiles', async () => {
    const empty = await render([]);
    expect(lead(empty.el)).toBeNull();
    expect(empty.el.querySelectorAll('button').length).toBe(0);
  });

  it('presenta un skeleton accesible mientras los destacados cargan', async () => {
    TestBed.configureTestingModule({ imports: [ShowcaseHost], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(ShowcaseHost);
    fixture.componentInstance.loading = true;
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="status"]')?.textContent).toContain(
      'Cargando profesionales destacados',
    );
    expect(fixture.nativeElement.querySelector('li.card')).toBeNull();
  });
});
