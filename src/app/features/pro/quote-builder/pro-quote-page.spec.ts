import { signal, WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { AgendaStore } from '../../../core/state/agenda.store';
import { NotificationsStore } from '../../../core/state/notifications.store';
import { BackNavigation } from '../../../core/services/back-navigation.service';
import { ProRequestsStore } from '../../../core/state/pro-requests.store';
import { ProStore } from '../../../core/state/pro.store';
import { SpeechInput } from '../../../core/services/speech-input.service';
import { ToastService } from '../../../core/services/toast.service';
import { ProServiceRequest } from '../../../core/models/request';
import { CreateQuotePayload, QUOTE_LIMITS, Quote } from '../../../core/models/quote';
import { ProQuotePage } from './pro-quote-page';
import { ProRequestDetailPage } from '../request-detail/pro-request-detail-page';

const QUOTE_ID = 'quote-1';
const REQUEST_ID = 'request-1';

function quote(status: Quote['status'] = 'PENDING'): Quote {
  return {
    id: QUOTE_ID,
    requestId: REQUEST_ID,
    professionalId: 'pro-1',
    description: 'Reparación de la instalación',
    note: 'Incluye limpieza',
    estimatedDuration: '1 día',
    laborAmount: '12500.00',
    materialsAmount: '3400.00',
    totalAmount: '15900.00',
    currency: 'ARS',
    availableFrom: null,
    validUntil: '2030-12-31T23:59:59.000Z',
    status,
    items: [{ id: 'item-1', description: 'Cable reforzado', quantity: '2.00', unitPrice: '1700.00', subtotal: '3400.00', sortOrder: 0 }],
    createdAt: '2026-09-01T12:00:00.000Z',
    updatedAt: '2026-09-01T12:00:00.000Z',
  };
}

function request(ownQuote: Quote | null): ProServiceRequest {
  return {
    id: REQUEST_ID,
    title: 'Revisar instalación',
    description: 'Necesito revisar un cable.',
    urgency: 'FLEXIBLE',
    status: ownQuote?.status === 'ACCEPTED' ? 'PROFESSIONAL_SELECTED' : 'WAITING_QUOTES',
    desiredDate: null,
    desiredTimeRange: null,
    service: { id: 'service-1', name: 'Electricidad' },
    zone: { id: 'zone-1', name: 'Centro' },
    photos: [],
    createdAt: '2026-09-01T12:00:00.000Z',
    updatedAt: '2026-09-01T12:00:00.000Z',
    client: { firstName: 'Lucía', lastInitial: 'G.' },
    invitationStatus: ownQuote ? 'QUOTED' : 'PENDING',
    opportunity: { blocked: false, targeted: false },
    ownQuote,
    otherInvitedCount: 0,
    selectedByClient: ownQuote?.status === 'ACCEPTED',
    completedAt: null,
    completedBy: null,
    completionDue: false,
    canComplete: false,
    contact: null,
    appointment: null,
  };
}

/** Dictado falso: `toggle` empieza a "escuchar" y guarda el callback para emitir texto. */
function fakeSpeech(supported = true) {
  const listening = signal(false);
  let emit: (text: string) => void = () => undefined;
  return {
    supported: signal(supported),
    listening,
    toggle: vi.fn((_prefix: string, cb: (text: string) => void) => {
      if (listening()) listening.set(false);
      else {
        listening.set(true);
        emit = cb;
      }
    }),
    stop: vi.fn(() => listening.set(false)),
    say: (text: string) => emit(text),
  };
}

function setup(options: { editing?: boolean; status?: Quote['status']; sent?: boolean; speech?: ReturnType<typeof fakeSpeech>; usage?: { used: number; limit: number | null; remaining: number | null } } = {}) {
  const quoteValue = quote(options.status ?? 'PENDING');
  const ownQuote = options.editing || options.sent ? quoteValue : null;
  const detail = signal<ProServiceRequest | null>(request(ownQuote));
  const sentQuote = signal<Quote | null>(options.sent ? quoteValue : null);
  const store = {
    hasProfile: () => true,
    detail,
    detailLoading: signal(false),
    detailError: signal(null),
    sentQuote,
    quoteSending: signal(false),
    quoteError: signal(null),
    quoteLimitHit: signal(false),
    quoteLimitOffer: signal(null),
    resetQuote: vi.fn(),
    loadDetail: vi.fn(),
    sendQuote: vi.fn(),
    updateQuote: vi.fn(),
  };
  const pro = {
    ownProfile: signal(options.usage ? { quoteUsage: options.usage } : null),
    refreshProfile: vi.fn(),
    introOffer: signal(null),
    trackOffer: vi.fn(),
  };

  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: ProRequestsStore, useValue: store },
      { provide: ProStore, useValue: pro },
      { provide: BackNavigation, useValue: { back: vi.fn() } },
      { provide: SpeechInput, useValue: options.speech ?? fakeSpeech(false) },
    ],
  });
  const fixture = TestBed.createComponent(ProQuotePage);
  fixture.componentRef.setInput('id', REQUEST_ID);
  if (options.editing) fixture.componentRef.setInput('quoteId', QUOTE_ID);
  fixture.detectChanges();
  fixture.detectChanges();
  return { fixture, host: fixture.nativeElement as HTMLElement, store };
}

function setupRequestDetail(status: Quote['status'], pro?: unknown) {
  const store = {
    hasProfile: () => true,
    detail: signal<ProServiceRequest | null>(request(quote(status))),
    detailLoading: signal(false),
    detailError: signal(null),
    declining: signal(false),
    actionError: signal(null),
    appointmentAction: signal(null),
    proposeError: signal(null),
    loadDetail: vi.fn(),
  };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: ProRequestsStore, useValue: store },
      { provide: AgendaStore, useValue: { showDay: vi.fn() } },
      { provide: NotificationsStore, useValue: { proByRequest: () => new Map(), lastArrival: signal(null), markRead: vi.fn() } },
      { provide: ToastService, useValue: { show: vi.fn() } },
      ...(pro ? [{ provide: ProStore, useValue: pro }] : []),
    ],
  });
  const fixture = TestBed.createComponent(ProRequestDetailPage);
  fixture.componentRef.setInput('id', REQUEST_ID);
  fixture.detectChanges();
  return { fixture, host: fixture.nativeElement as HTMLElement };
}

describe('edición del mismo presupuesto', () => {
  it('abre el formulario con los valores actuales y ofrece Guardar cambios', () => {
    const { host } = setup({ editing: true });

    expect(host.textContent).toContain('Estás editando el mismo presupuesto. Guardar cambios no consume otra oportunidad.');
    expect(host.querySelector('textarea')?.value).toBe('Reparación de la instalación');
    expect([...host.querySelectorAll<HTMLTextAreaElement>('textarea')].map((input) => input.value)).toContain('Incluye limpieza');
    const values = [...host.querySelectorAll<HTMLInputElement>('form input')].map((input) => input.value);
    expect(values).toContain('12.500');
    expect(values).toContain('Cable reforzado');
    expect(values).toContain('2.00');
    expect(values).toContain('1.700');
    expect(values).toContain('1 día');
    expect(host.textContent).toContain('Guardar cambios');
    expect(host.textContent).not.toContain('Enviar presupuesto ·');
  });

  it('mantiene el envío simple y deja agregar o quitar detalle con el total actualizado', () => {
    const { fixture, host } = setup();
    for (const section of ['1 · Trabajo', '2 · Precio', '3 · Disponibilidad', '4 · Vigencia']) expect(host.textContent).toContain(section);
    expect(host.textContent).toContain('Materiales (monto total)');
    expect(host.querySelector('fieldset input')).toBeNull();
    expect(host.querySelector('aside')?.textContent).toContain('Tu propuesta');
    expect(host.querySelector('aside')?.textContent).toContain('7 días');

    const description = host.querySelector<HTMLTextAreaElement>('form textarea')!;
    description.value = 'Revisión de cableado';
    description.dispatchEvent(new Event('input', { bubbles: true }));
    [...host.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.includes('Agregar material'))!
      .click();
    fixture.detectChanges();

    const [concept, quantity, unitPrice] = host.querySelectorAll<HTMLInputElement>('fieldset input');
    concept.value = 'Cable reforzado';
    concept.dispatchEvent(new Event('input', { bubbles: true }));
    quantity.value = '2';
    quantity.dispatchEvent(new Event('input', { bubbles: true }));
    unitPrice.value = '2500';
    unitPrice.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();

    expect(host.querySelector('aside')?.textContent).toContain('5.000');
    const ctas = [...host.querySelectorAll<HTMLButtonElement>('button')].filter((button) => button.textContent?.includes('Enviar presupuesto'));
    expect(ctas.length).toBe(2);
    expect(ctas.every((button) => !button.disabled)).toBe(true);

    host.querySelector<HTMLButtonElement>('[aria-label="Quitar material 1"]')!.click();
    fixture.detectChanges();
    expect(host.querySelector('fieldset input')).toBeNull();
    expect(host.querySelector('aside')?.textContent).toContain('Total estimado');
    const ctasAfterRemove = [...host.querySelectorAll<HTMLButtonElement>('button')].filter((button) => button.textContent?.includes('Enviar presupuesto'));
    expect(ctasAfterRemove.every((button) => button.disabled)).toBe(true);
  });

  it('muestra Editar presupuesto en el resultado enviado mientras sigue editable', () => {
    const { host } = setup({ sent: true });

    expect(host.textContent).toContain('Presupuesto enviado');
    expect(host.querySelector('a')?.textContent).toContain('Editar presupuesto');
  });

  it('muestra Editar presupuesto en el detalle de solicitud solo mientras está pendiente', () => {
    const editable = setupRequestDetail('PENDING');
    expect(editable.host.textContent).toContain('Editar presupuesto');

    TestBed.resetTestingModule();
    const accepted = setupRequestDetail('ACCEPTED');
    expect(accepted.host.textContent).not.toContain('Editar presupuesto');
  });

  it('oculta Editar presupuesto después de aceptar y bloquea la ruta de edición', () => {
    const sent = setup({ sent: true, status: 'ACCEPTED' });
    expect(sent.host.textContent).toContain('Presupuesto enviado');
    expect(sent.host.textContent).not.toContain('Editar presupuesto');

    TestBed.resetTestingModule();
    const editing = setup({ editing: true, status: 'ACCEPTED' });
    expect(editing.host.textContent).toContain('El cliente ya aceptó este presupuesto. No se puede editar.');
    expect(editing.host.querySelector('textarea')).toBeNull();
    expect(editing.host.textContent).not.toContain('Guardar cambios');
  });
});

describe('dictado por voz', () => {
  const click = (host: HTMLElement, id: string) =>
    (host.querySelector(`[data-testid="${id}"]`) as HTMLButtonElement).click();
  const field = (host: HTMLElement, index: number) => host.querySelectorAll('textarea')[index] as HTMLTextAreaElement;

  it('no ofrece dictar si el navegador no lo soporta', () => {
    const { host } = setup({ speech: fakeSpeech(false) });
    expect(host.querySelector('[data-testid="dictate-description"]')).toBeNull();
    expect(host.querySelector('[data-testid="dictate-note"]')).toBeNull();
  });

  it('dicta "Qué vas a hacer" a continuación de lo escrito', () => {
    const speech = fakeSpeech();
    const { fixture, host } = setup({ speech });
    field(host, 0).value = 'Cambio de sifón';
    field(host, 0).dispatchEvent(new Event('input'));
    click(host, 'dictate-description');
    expect(speech.toggle).toHaveBeenCalledWith('Cambio de sifón', expect.any(Function));
    speech.say('Cambio de sifón y flexibles');
    fixture.detectChanges();
    expect(field(host, 0).value).toBe('Cambio de sifón y flexibles');
    expect(host.querySelector('[data-testid="dictate-description"]')?.textContent).toContain('Escuchando');
  });

  it('mientras escucha un campo, el micrófono del otro queda deshabilitado', () => {
    const speech = fakeSpeech();
    const { fixture, host } = setup({ speech });
    click(host, 'dictate-note');
    fixture.detectChanges();
    expect((host.querySelector('[data-testid="dictate-description"]') as HTMLButtonElement).disabled).toBe(true);
    expect((host.querySelector('[data-testid="dictate-note"]') as HTMLButtonElement).disabled).toBe(false);
  });

  it('respeta el máximo del campo', () => {
    const speech = fakeSpeech();
    const { fixture, host } = setup({ speech });
    click(host, 'dictate-note');
    speech.say('a'.repeat(QUOTE_LIMITS.noteMax + 50));
    fixture.detectChanges();
    expect(field(host, 1).value.length).toBe(QUOTE_LIMITS.noteMax);
  });

  it('corta el micrófono al salir de la pantalla', () => {
    const speech = fakeSpeech();
    const { fixture } = setup({ speech });
    fixture.destroy();
    expect(speech.stop).toHaveBeenCalled();
  });
});

describe('Fase 4: lo que cuesta y lo que se perdió', () => {
  const cost = (host: HTMLElement) => host.querySelector('[data-testid="quota-cost"]')?.textContent?.trim() ?? null;

  it('Free: antes de enviar dice que usa 1 de sus oportunidades (y la última, con todas las letras)', () => {
    expect(cost(setup({ usage: { used: 1, limit: 3, remaining: 2 } }).host)).toBe(
      'Este presupuesto usa 1 de las 2 oportunidades Free que te quedan.',
    );
    TestBed.resetTestingModule();
    expect(cost(setup({ usage: { used: 2, limit: 3, remaining: 1 } }).host)).toBe(
      'Este presupuesto usa tu última oportunidad Free.',
    );
  });

  it('no cuesta nada: PRO, editar, ya presupuestada o una solicitud dirigida', () => {
    expect(cost(setup({ usage: { used: 1, limit: null, remaining: null } }).host)).toBeNull();
    TestBed.resetTestingModule();
    expect(cost(setup({ editing: true, usage: { used: 1, limit: 3, remaining: 2 } }).host)).toBeNull();
    TestBed.resetTestingModule();
    const targeted = setup({ usage: { used: 1, limit: 3, remaining: 2 } });
    targeted.store.detail.update((r) => ({ ...r!, opportunity: { blocked: false, targeted: true } }));
    targeted.fixture.detectChanges();
    expect(cost(targeted.host)).toBeNull();
  });

  it('solicitud que le llegó tarde: cuánto y cuántos presupuestos ya había, con la prueba de PRO ahí mismo', () => {
    const pro = {
      hasPro: signal(false),
        plan: signal(null),
      proTrial: signal({ state: 'AVAILABLE', days: 14 }),
      startingTrial: signal(false),
      startProTrial: vi.fn(async () => true),
    };
    const { fixture, host } = setupRequestDetail('PENDING', pro);
    const store = TestBed.inject(ProRequestsStore) as unknown as { detail: ReturnType<typeof signal<ProServiceRequest | null>> };
    store.detail.update((r) => ({
      ...r!,
      opportunity: { blocked: false, targeted: false, lateByMinutes: 30, quotesBeforeYou: 2 },
    }));
    fixture.detectChanges();
    const note = host.querySelector('[data-testid="late-note"]')!;
    expect(note.textContent).toContain(
      'Te llegó 30 min después que a un perfil PRO que también la recibió. Cuando se te habilitó, ya había 2 presupuestos de otros profesionales.',
    );
    expect(note.querySelector('[data-testid="pro-trial-offer"]')).not.toBeNull();
    pro.proTrial.set({ state: 'UNAVAILABLE', reason: 'ALREADY_HAD_TRIAL' } as never);
    fixture.detectChanges();
    expect(note.querySelector('[data-testid="pro-trial-offer"]')).toBeNull();
    expect(note.querySelector('a[href="/pro/plan"]')!.textContent).toContain('Conocer PRO');
    pro.hasPro.set(true);
    fixture.detectChanges();
    expect(host.querySelector('[data-testid="late-note"]')).toBeNull();
  });
});


describe('envío y vigencia de presupuestos', () => {
  type Form = {
    description: WritableSignal<string>;
    labor: WritableSignal<number>;
    fromOffset: WritableSignal<number | null>;
    validityDays: WritableSignal<number | null>;
    send(): Promise<void>;
    buildPayload(): CreateQuotePayload;
  };

  it('permite responder un pedido dirigido aunque el cupo discovery esté agotado', async () => {
    const { fixture, store, host } = setup({ usage: { used: 3, limit: 3, remaining: 0 } });
    store.detail.update((r) => ({ ...r!, opportunity: { blocked: false, targeted: true } }));
    const form = fixture.componentInstance as unknown as Form;
    form.description.set('Cambio del flexible de la cocina');
    form.labor.set(15000);
    fixture.detectChanges();
    await form.send();
    expect(store.sendQuote).toHaveBeenCalledWith(REQUEST_ID, expect.objectContaining({ laborAmount: 15000 }));
    expect(host.querySelector('[data-testid="quota-cost"]')).toBeNull();
  });

  it('mantiene el bloqueo de cupo para una oportunidad discovery nueva', async () => {
    const { fixture, store } = setup({ usage: { used: 3, limit: 3, remaining: 0 } });
    const form = fixture.componentInstance as unknown as Form;
    form.description.set('Cambio del flexible de la cocina');
    form.labor.set(15000);
    fixture.detectChanges();
    await form.send();
    expect(store.sendQuote).not.toHaveBeenCalled();
  });

  it('calcula hoy y el fin de vigencia en Argentina aunque el navegador use UTC', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-10-18T02:30:00.000Z')); // todavía 17/10 en Argentina
      const { fixture } = setup();
      const form = fixture.componentInstance as unknown as Form;
      form.fromOffset.set(0);
      form.validityDays.set(1);
      expect(form.buildPayload()).toMatchObject({
        availableFrom: '2026-10-17T03:00:00.000Z',
        validUntil: '2026-10-19T02:59:59.000Z',
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('relee una edición vencida y deja de permitir guardar cuando el servidor la marca EXPIRED', async () => {
    const { fixture, store, host } = setup({ editing: true });
    store.loadDetail.mockClear();
    store.detail.update((r) => ({ ...r!, ownQuote: { ...r!.ownQuote!, validUntil: '2020-01-01T00:00:00Z' } }));
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(store.loadDetail).toHaveBeenCalledWith(REQUEST_ID, true);
    store.detail.update((r) => ({ ...r!, ownQuote: { ...r!.ownQuote!, status: 'EXPIRED' } }));
    fixture.detectChanges();
    expect(host.textContent).not.toContain('Guardar cambios');
    await (fixture.componentInstance as unknown as Form).send();
    expect(store.updateQuote).not.toHaveBeenCalled();
  });

  it('relee el detalle profesional al vencer y retira la edición de una propuesta vencida', async () => {
    const { fixture, host } = setupRequestDetail('PENDING');
    const store = TestBed.inject(ProRequestsStore) as unknown as {
      detail: WritableSignal<ProServiceRequest | null>;
      loadDetail: ReturnType<typeof vi.fn>;
    };
    store.loadDetail.mockClear();
    store.detail.update((r) => ({ ...r!, ownQuote: { ...r!.ownQuote!, validUntil: '2020-01-01T00:00:00Z' } }));
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(store.loadDetail).toHaveBeenCalledWith(REQUEST_ID, true);
    store.detail.update((r) => ({ ...r!, ownQuote: { ...r!.ownQuote!, status: 'EXPIRED' } }));
    fixture.detectChanges();
    expect(host.textContent).not.toContain('Editar presupuesto');
  });
});
