import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { AgendaStore } from '../../../core/state/agenda.store';
import { NotificationsStore } from '../../../core/state/notifications.store';
import { BackNavigation } from '../../../core/services/back-navigation.service';
import { ProRequestsStore } from '../../../core/state/pro-requests.store';
import { ProStore } from '../../../core/state/pro.store';
import { ToastService } from '../../../core/services/toast.service';
import { ProServiceRequest } from '../../../core/models/request';
import { Quote } from '../../../core/models/quote';
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
    laborAmount: '12500.00',
    materialsAmount: '3400.00',
    totalAmount: '15900.00',
    currency: 'ARS',
    availableFrom: null,
    validUntil: '2030-12-31T23:59:59.000Z',
    status,
    items: [{ id: 'item-1', description: 'Cable reforzado', quantity: '2.00', unitPrice: '1700.00', subtotal: '3400.00' }],
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
    invitationStatus: 'QUOTED',
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

function setup(options: { editing?: boolean; status?: Quote['status']; sent?: boolean } = {}) {
  const quoteValue = quote(options.status ?? 'PENDING');
  const detail = signal<ProServiceRequest | null>(request(quoteValue));
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
  const pro = { ownProfile: signal(null), refreshProfile: vi.fn() };

  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: ProRequestsStore, useValue: store },
      { provide: ProStore, useValue: pro },
      { provide: BackNavigation, useValue: { back: vi.fn() } },
    ],
  });
  const fixture = TestBed.createComponent(ProQuotePage);
  fixture.componentRef.setInput('id', REQUEST_ID);
  if (options.editing) fixture.componentRef.setInput('quoteId', QUOTE_ID);
  fixture.detectChanges();
  fixture.detectChanges();
  return { fixture, host: fixture.nativeElement as HTMLElement, store };
}

function setupRequestDetail(status: Quote['status']) {
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
    const values = [...host.querySelectorAll<HTMLInputElement>('form input')].map((input) => input.value);
    expect(values).toContain('12.500');
    expect(values).toContain('Cable reforzado');
    expect(values).toContain('2.00');
    expect(values).toContain('1.700');
    expect(host.textContent).toContain('Guardar cambios');
    expect(host.textContent).not.toContain('Enviar presupuesto ·');
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
