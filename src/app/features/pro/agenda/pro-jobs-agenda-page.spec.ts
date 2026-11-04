import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { JobListItem } from '../../../core/models/job';
import { JobsStore } from '../../../core/state/jobs.store';
import { businessDay, businessMinutes, shiftDay, weekStart } from '../../../core/utils/business-time';
import { ProJobsAgendaPage } from './pro-jobs-agenda-page';

const job = (id: string, date: string | null, time: string | null = null): JobListItem => ({
  id,
  requestId: id,
  title: id,
  status: 'SCHEDULED',
  scheduledDate: date,
  scheduledTime: time,
  durationMinutes: null,
  startedAt: null,
  completedAt: null,
  cancelledAt: null,
  service: { name: 'Plomería' },
  zone: { name: 'Centro' },
  client: { firstName: 'Cliente de prueba', lastInitial: 'P' },
});

async function render(items: JobListItem[]) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: JobsStore,
        useValue: {
          items: signal(items),
          counts: signal({ toCoordinate: 0, today: 1, inProgress: 0, completed: 0 }),
          hasProfile: signal(true),
          loaded: signal(true),
          loading: signal(false),
          error: signal(false),
          load: vi.fn(),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(ProJobsAgendaPage);
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}
const clock = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

describe('Agenda y trabajos', () => {
  it('Todos conserva trabajos vencidos o sin fecha y ordena próximos por día y hora', async () => {
    const items = [
      job('sin-fecha', null),
      job('vencido', '2000-01-01'),
      { ...job('coordinar', null), status: 'TO_COORDINATE' as const },
      job('hoy', businessDay() + 'T00:00:00.000Z'),
      job('tarde', '2099-01-02', '18:00'),
      job('otro-día', '2099-01-03'),
      job('mañana', '2099-01-02T00:00:00.000Z', '08:00'),
    ];
    const { el } = await render(items);
    const hrefs = new Set([...el.querySelectorAll('a[href^="/pro/trabajos/"]')].map((a) => a.getAttribute('href')));
    expect([...hrefs].sort()).toEqual(items.map((item) => '/pro/trabajos/' + encodeURIComponent(item.id)).sort());
    expect(el.querySelector('[aria-labelledby="review-title"]')?.textContent).toContain('vencido');
    expect(el.querySelector('[aria-labelledby="review-title"]')?.textContent).toContain('sin-fecha');
    expect([...el.querySelectorAll('.agenda-day a')].map((a) => a.getAttribute('href'))).toEqual([
      '/pro/trabajos/ma%C3%B1ana',
      '/pro/trabajos/tarde',
      '/pro/trabajos/otro-d%C3%ADa',
    ]);
    expect(el.querySelectorAll('.agenda-day')).toHaveLength(2);
    expect(el.querySelector('.agenda-today')?.textContent).toContain('hoy');
    expect(el.querySelector('.agenda-coordinate')?.textContent).toContain('Proponer horario');
  });

  it('la semana marca los días con trabajos y elegir uno muestra ese día', async () => {
    const today = businessDay();
    const monday = weekStart(today);
    const other = shiftDay(monday, today === monday ? 1 : 0);
    const { fixture, el } = await render([job('del-día', other, '10:00'), { ...job('hecho', other, '15:00'), status: 'COMPLETED' as const }]);
    const days = [...el.querySelectorAll<HTMLButtonElement>('.agenda-week-day')];
    expect(days).toHaveLength(7);
    const target = days.find((b) => b.querySelector('.agenda-week-dot.is-on'))!;
    expect(target.getAttribute('aria-label')).toContain('con trabajos');
    expect(el.querySelector('.agenda-today')?.textContent).toContain('No tenés trabajos agendados para hoy');
    target.click();
    fixture.detectChanges();
    expect(target.getAttribute('aria-pressed')).toBe('true');
    const today$ = el.querySelector('.agenda-today')!;
    expect([...today$.querySelectorAll('.agenda-slot')].map((a) => a.getAttribute('data-status'))).toEqual(['SCHEDULED', 'COMPLETED']);
    expect(today$.querySelector('.agenda-now')).toBeNull();
  });

  it('hoy marca «ahora» entre lo que pasó y lo que viene, y el celular muestra el próximo', async () => {
    const now = businessMinutes(new Date());
    if (now < 5 || now > 23 * 60 + 50) return; // borde de medianoche: nada que ordenar
    const today = businessDay();
    const { el } = await render([
      job('antes', today, clock(now - 5)),
      { ...job('después', today, clock(now + 8)), durationMinutes: 60 },
    ]);
    const entries = [...el.querySelectorAll('.agenda-timeline > li')].map((li) =>
      li.classList.contains('agenda-now') ? 'ahora' : li.textContent!.includes('después') ? 'después' : 'antes',
    );
    expect(entries).toEqual(['antes', 'ahora', 'después']);
    const next = el.querySelector('[data-testid="agenda-next"]')!;
    expect(next.textContent).toContain('después');
    expect(next.textContent).toContain('en 8 min');
    expect(next.textContent).toContain(clock(now + 68));
  });
});
