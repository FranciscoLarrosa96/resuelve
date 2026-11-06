import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { JobDetail, JobChecklistItem } from '../../../core/models/job';
import { JobsStore } from '../../../core/state/jobs.store';
import { ProJobDetailPage } from './pro-job-detail-page';

async function setup() {
  const task: JobChecklistItem = { id: 'task-1', text: 'Revisar instalación', done: true };
  const detail = signal({
    id: 'job-1',
    title: 'Reparación',
    status: 'COMPLETED',
    service: { name: 'Electricidad' },
    zone: { name: 'Centro' },
    client: { fullName: 'Ana' },
    acceptedQuote: { items: [], totalAmount: '100' },
    privateNotes: 'Nota original',
    checklist: [task],
    history: [],
    scheduledDate: null,
    scheduledTime: null,
    durationMinutes: null,
  } as unknown as JobDetail);
  const store = {
    detail,
    hasProfile: signal(true),
    detailError: signal(null),
    actionError: signal(null),
    action: signal(null),
    loadDetail: vi.fn(),
    updateChecklist: vi.fn(async (_id: string, checklist: JobChecklistItem[]) => {
      detail.update((d) => ({ ...d, checklist }));
      return true;
    }),
    updateNotes: vi.fn(async (_id: string, privateNotes: string) => {
      detail.update((d) => ({ ...d, privateNotes }));
      return true;
    }),
  };
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: JobsStore, useValue: store }],
  });
  const fixture = TestBed.createComponent(ProJobDetailPage);
  fixture.componentRef.setInput('id', 'job-1');
  await fixture.whenStable();
  return { fixture, store, task, el: fixture.nativeElement as HTMLElement };
}

it('conserva las notas sin guardar al actualizar una tarea', async () => {
  const { fixture, store, el } = await setup();
  const notes = el.querySelector('textarea')!;
  notes.value = 'Borrador todavía sin guardar';
  notes.dispatchEvent(new Event('input'));
  el.querySelector<HTMLInputElement>('input[type=checkbox]')!.click();
  await fixture.whenStable();
  expect(store.updateChecklist).toHaveBeenCalled();
  expect(el.querySelector('textarea')!.value).toBe('Borrador todavía sin guardar');
  expect(el.textContent).toContain('Cambios sin guardar');
});

it('deshacer restaura la tarea y su estado de completado', async () => {
  const { fixture, store, task, el } = await setup();
  el.querySelector<HTMLButtonElement>('[aria-label="Eliminar Revisar instalación"]')!.click();
  await fixture.whenStable();
  expect(store.detail().checklist).toEqual([]);
  [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Deshacer'))!.click();
  await fixture.whenStable();
  expect(store.detail().checklist).toEqual([task]);
  expect(el.textContent).not.toContain('Tarea eliminada.');
});

it('no borra el texto de una tarea cuando falla el guardado', async () => {
  const { fixture, store, el } = await setup();
  store.updateChecklist.mockResolvedValueOnce(false);
  const input = el.querySelector<HTMLInputElement>('[aria-label="Nueva tarea del checklist"]')!;
  input.value = 'Comprar repuesto';
  input.dispatchEvent(new Event('input'));
  input.closest('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
  await fixture.whenStable();
  expect(input.value).toBe('Comprar repuesto');
});

it('anuncia guardado y permite reintentar si fallan las notas', async () => {
  const { fixture, store, el } = await setup();
  store.updateNotes.mockResolvedValueOnce(false);
  const notes = el.querySelector('textarea')!;
  notes.value = 'Nueva nota';
  notes.dispatchEvent(new Event('input'));
  await fixture.whenStable();
  const save = [...el.querySelectorAll('button')].find((b) =>
    b.textContent?.includes('Guardar notas'),
  )!;
  save.click();
  await fixture.whenStable();
  expect(el.textContent).toContain('No pudimos guardarlas');
  expect(notes.value).toBe('Nueva nota');
  save.click();
  await fixture.whenStable();
  expect(el.textContent).toContain('Notas guardadas');
});

it('trabajo realizado sin reseña: "Pedile la reseña" con el enlace a la reseña de ese trabajo', async () => {
  const { fixture, store, el } = await setup();
  expect(el.querySelector('[data-testid="review-ask"]')).toBeNull(); // sin dato del backend no se pide
  store.detail.update((d) => ({
    ...d,
    requestId: 'req-1',
    client: { ...d.client, firstName: 'Ana' },
    clientReviewed: false,
  }));
  await fixture.whenStable();
  const ask = el.querySelector('[data-testid="review-ask"]')!;
  expect(ask.textContent).toContain('Pedile la reseña a Ana');
  const href = ask.querySelector<HTMLAnchorElement>('[data-testid="review-ask-whatsapp"]')!.href;
  expect(decodeURIComponent(href)).toContain('/mis-solicitudes/req-1#resena');
  expect(decodeURIComponent(href)).not.toContain('/resenar');

  store.detail.update((d) => ({ ...d, clientReviewed: true }));
  await fixture.whenStable();
  expect(el.querySelector('[data-testid="review-ask"]')).toBeNull();
});

async function setupOpen(overrides: Partial<JobDetail>, desktop = false) {
  const original = window.matchMedia;
  window.matchMedia = ((query: string) => ({
    matches: desktop,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  const ctx = await setup();
  window.matchMedia = original;
  (ctx.store as Record<string, unknown>)['complete'] = vi.fn(async () => true);
  ctx.store.detail.update((d) => ({
    ...d,
    status: 'SCHEDULED',
    scheduledDate: '2026-11-05',
    scheduledTime: null,
    canComplete: false,
    closesAt: null,
    history: [],
    ...overrides,
  }));
  await ctx.fixture.whenStable();
  return ctx;
}

it('celular: agendado sin horario muestra el paso actual y la acción abre "Día y horario"', async () => {
  const { fixture, el } = await setupOpen({});
  expect(el.textContent).toContain('Paso 3 de 4');
  expect(el.textContent).toContain('Acordá el horario con el cliente');
  const schedule = el.querySelector<HTMLDetailsElement>('details#job-schedule')!;
  expect(schedule.open).toBe(false);
  const next = el.querySelector<HTMLButtonElement>('[data-testid="next-step"]')!;
  expect(next.textContent).toContain('Elegir horario');
  next.click();
  await fixture.whenStable();
  expect(schedule.open).toBe(true);
});

it('celular: con el horario terminado, la acción fija finaliza el trabajo', async () => {
  const { fixture, store, el } = await setupOpen({ scheduledTime: '10:00', canComplete: true });
  const finish = el.querySelector<HTMLButtonElement>('[data-testid="finish-job"]')!;
  expect(finish.textContent).toContain('Finalizar trabajo');
  finish.click();
  await fixture.whenStable();
  expect((store as unknown as { complete: ReturnType<typeof vi.fn> }).complete).toHaveBeenCalledWith('job-1');
});

it('escritorio: recorrido por etapas con la actual marcada y sin acción fija', async () => {
  const { el } = await setupOpen({ scheduledTime: '10:00' }, true);
  const steps = [...el.querySelectorAll('[data-testid="job-step"]')];
  expect(steps).toHaveLength(4);
  expect(steps[2].getAttribute('aria-current')).toBe('step');
  expect(steps[1].textContent).toContain('Cambiar día u horario');
  expect(el.querySelector('[data-testid="next-step"]')).toBeNull();
  expect(el.querySelector('details#job-schedule')).toBeNull();
});

it('celular: a coordinar sin fecha, agendar es opcional y la acción fija lo marca realizado', async () => {
  const { fixture, store, el } = await setupOpen({ status: 'TO_COORDINATE', scheduledDate: null, canCompleteWithoutSchedule: true });
  expect(el.textContent).toContain('Coordiná el día con el cliente');
  expect(el.textContent).toContain('es opcional');
  const finish = el.querySelector<HTMLButtonElement>('[data-testid="finish-job"]')!;
  expect(finish.textContent).toContain('Ya hice el trabajo');
  finish.click();
  await fixture.whenStable();
  expect((store as unknown as { complete: ReturnType<typeof vi.fn> }).complete).toHaveBeenCalledWith('job-1');
});

it('escritorio: a coordinar sin fecha ofrece «Ya hice el trabajo» y el agendado como opcional', async () => {
  const { el } = await setupOpen({ status: 'TO_COORDINATE', scheduledDate: null, canCompleteWithoutSchedule: true }, true);
  const block = el.querySelector('[data-testid="complete-without-schedule"]')!;
  expect(block.textContent).toContain('Ya hice el trabajo');
  expect(el.textContent).toContain('Agendar (opcional)');
});
