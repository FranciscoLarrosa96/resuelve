import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { JobListItem } from '../../../core/models/job';
import { JobsStore } from '../../../core/state/jobs.store';
import { businessDay } from '../../../core/utils/business-time';
import { ProJobsAgendaPage } from './pro-jobs-agenda-page';

const job = (id: string, date: string | null, time: string | null = null): JobListItem => ({
  id, requestId: id, title: id, status: 'SCHEDULED', scheduledDate: date, scheduledTime: time,
  durationMinutes: null, startedAt: null, completedAt: null, cancelledAt: null,
  service: { name: 'Plomería' }, zone: { name: 'Centro' },
  client: { firstName: 'Cliente de prueba', lastInitial: 'P' },
});

it('Todos conserva trabajos vencidos o sin fecha y ordena próximos por día y hora', async () => {
  const items = [job('sin-fecha', null), job('vencido', '2000-01-01'),
    job('hoy', businessDay()), job('tarde', '2099-01-02', '18:00'),
    job('otro-día', '2099-01-03'), job('mañana', '2099-01-02', '08:00')];
  TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: JobsStore, useValue: {
    items: signal(items), counts: signal({ toCoordinate: 0, today: 1, inProgress: 0, completed: 0 }),
    hasProfile: signal(true), loaded: signal(true), loading: signal(false), error: signal(false), load: vi.fn(),
  } }] });
  const fixture = TestBed.createComponent(ProJobsAgendaPage);
  fixture.detectChanges();
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  expect([...el.querySelectorAll('li a')].map(a => a.getAttribute('href')).sort())
    .toEqual(items.map(item => '/pro/trabajos/' + encodeURIComponent(item.id)).sort());
  expect(el.querySelector('[aria-labelledby="review-title"]')?.textContent).toContain('vencido');
  expect(el.querySelector('[aria-labelledby="review-title"]')?.textContent).toContain('sin-fecha');
  expect([...el.querySelectorAll('.agenda-day a')].map(a => a.getAttribute('href')))
    .toEqual(['/pro/trabajos/ma%C3%B1ana', '/pro/trabajos/tarde', '/pro/trabajos/otro-d%C3%ADa']);
  expect(el.querySelectorAll('.agenda-day')).toHaveLength(2);
});
