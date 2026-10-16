import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { API_URL } from '../../../../core/api/api.config';
import { InvitationOptions } from '../../../../core/models/invitation-options';
import { ProfessionalSummary } from '../../../../core/models/professional';
import { ADD_PROFESSIONALS_STATUSES, AddProfessionals } from './add-professionals';

const API = 'http://api.test/api/v1';
const REQ = '11111111-1111-4111-8111-111111111111';
const flush = () => new Promise((r) => setTimeout(r));
const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ');

const pro = (id: string, extra: Partial<ProfessionalSummary> = {}): ProfessionalSummary =>
  ({
    id,
    firstName: `Pro${id}`,
    lastName: 'Apellido',
    displayName: `Pro${id} A.`,
    avatarUrl: null,
    headline: null,
    bio: null,
    yearsExperience: 3,
    availableToday: true,
    averageResponseMinutes: null,
    averageRating: null,
    reviewsCount: 0,
    completedJobsCount: 0,
    services: [],
    contactChannels: { whatsapp: false, phone: false, requests: true },
    ...extra,
  }) as ProfessionalSummary;

const options = (extra: Partial<InvitationOptions> = {}): InvitationOptions => ({
  requestId: REQ,
  state: 'AVAILABLE',
  emphasis: 'NONE',
  urgent: false,
  invited: 1,
  maxInvitations: 6,
  remainingInvitations: 2,
  activeQuotes: 0,
  maxActiveQuotes: 5,
  waitingMinutes: 5,
  suggestAfterMinutes: 60,
  suggestFrom: null,
  candidates: [pro('a'), pro('b'), pro('c')],
  directContacts: [],
  ...extra,
});

@Component({ selector: 'host-cmp', imports: [AddProfessionals], template: `<app-add-professionals [requestId]="id" (added)="added = added + 1" />` })
class Host {
  id = REQ;
  added = 0;
}

let configured = false;
function setup() {
  configured = true;
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_URL, useValue: API },
      { provide: PLATFORM_ID, useValue: 'browser' },
    ],
  });
  const http = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  return { http, fixture, el: fixture.nativeElement as HTMLElement };
}
async function load(http: HttpTestingController, fixture: { detectChanges(): void }, body: InvitationOptions) {
  http.expectOne(`${API}/requests/${REQ}/invitation-options`).flush(body);
  await flush();
  fixture.detectChanges();
}
afterEach(() => {
  if (configured) TestBed.inject(HttpTestingController).verify();
  configured = false;
});

describe('Sumar profesionales (detalle del pedido)', () => {
  it('se consulta en espera y también en presupuestos recibidos (por si vencieron), nunca con elegido', () => {
    expect(ADD_PROFESSIONALS_STATUSES).toEqual(['WAITING_QUOTES', 'QUOTES_RECEIVED']);
  });

  it('con presupuestos anteriores vencidos (sin activos) ofrece sumar', async () => {
    const { http, fixture, el } = setup();
    await load(http, fixture, options({ activeQuotes: 0, invited: 3, remainingInvitations: 3 }));
    expect(el.querySelector('[data-testid="add-professionals"]')).not.toBeNull();
    expect(el.querySelectorAll('[data-testid="add-pros-candidate"]').length).toBe(3);
  });

  it('no muestra nada cuando no corresponde', async () => {
    const { http, fixture, el } = setup();
    await load(http, fixture, options({ state: 'NOT_APPLICABLE', candidates: [] }));
    expect(el.querySelector('[data-testid="add-professionals"]')).toBeNull();
  });

  it('sin esperar 24 h: ofrece recomendados y se puede sumar solo hasta el cupo restante', async () => {
    const { http, fixture, el } = setup();
    await load(http, fixture, options());
    expect(text(el)).toContain('Sumar profesionales');
    expect(text(el)).toContain('Podés sumar hasta 2 profesionales más');
    expect(el.querySelectorAll('[data-testid="add-pros-candidate"]').length).toBe(3);
    const boxes = [...el.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
    boxes[0].click();
    boxes[1].click();
    fixture.detectChanges();
    // Con el cupo completo el tercero queda deshabilitado.
    expect(boxes[2].disabled).toBe(true);
    expect(text(el.querySelector('[data-testid="add-pros-submit"]'))).toContain('Sumar 2 profesionales');
  });

  it('suma con el mismo endpoint de invitaciones, marca la medición y relee', async () => {
    const { http, fixture, el } = setup();
    await load(http, fixture, options());
    el.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[0].click();
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('[data-testid="add-pros-submit"]')!.click();
    const req = http.expectOne(`${API}/requests/${REQ}/invitations`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toMatchObject({ professionalIds: ['a'], targeted: false, addedVia: 'ADD_PROFESSIONALS' });
    req.flush({});
    await flush();
    http.expectOne(`${API}/requests/${REQ}/invitation-options`).flush(options({ invited: 2, remainingInvitations: 1, candidates: [pro('b'), pro('c')] }));
    await flush();
    fixture.detectChanges();
    expect((fixture.componentInstance as Host).added).toBe(1);
    expect(el.querySelectorAll('[data-testid="add-pros-candidate"]').length).toBe(2);
    expect(text(el)).toContain('Podés sumar hasta 1 profesional más');
  });

  it('si al enviar alguien ya no puede responder, actualiza la lista y lo explica', async () => {
    const { http, fixture, el } = setup();
    await load(http, fixture, options());
    el.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[0].click();
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('[data-testid="add-pros-submit"]')!.click();
    http
      .expectOne(`${API}/requests/${REQ}/invitations`)
      .flush({ code: 'PROFESSIONAL_NOT_ELIGIBLE', message: 'x' }, { status: 422, statusText: 'Unprocessable Entity' });
    await flush();
    http.expectOne(`${API}/requests/${REQ}/invitation-options`).flush(options({ candidates: [pro('b'), pro('c')] }));
    await flush();
    fixture.detectChanges();
    expect(text(el.querySelector('[role="alert"]'))).toContain('ya no puede responder');
    expect(el.querySelectorAll('[data-testid="add-pros-candidate"]').length).toBe(2);
  });

  it('hoy/urgente: orientación desde el inicio; sugerencia destacada pasada la hora', async () => {
    const urgent = setup();
    await load(urgent.http, urgent.fixture, options({ emphasis: 'URGENT_GUIDE', urgent: true }));
    expect(text(urgent.el.querySelector('[data-testid="add-pros-intro"]'))).toContain('para hoy o urgente');
    expect(urgent.el.querySelector('section')!.getAttribute('data-emphasis')).toBe('URGENT_GUIDE');
  });

  it('pasada la hora sin presupuestos se destaca la sugerencia', async () => {
    const { http, fixture, el } = setup();
    await load(http, fixture, options({ emphasis: 'SUGGEST', waitingMinutes: 75 }));
    expect(text(el.querySelector('[data-testid="add-pros-intro"]'))).toContain('Pasó más de una hora');
    expect(el.querySelector('section')!.getAttribute('data-emphasis')).toBe('SUGGEST');
  });

  it('con el máximo de invitados: explica y, sin contacto directo, no hay ningún botón', async () => {
    const { http, fixture, el } = setup();
    await load(http, fixture, options({ state: 'LIMIT_REACHED', invited: 6, remainingInvitations: 0, candidates: [] }));
    expect(text(el)).toContain('máximo por solicitud');
    expect(el.querySelector('button')).toBeNull();
    expect(el.querySelector('input')).toBeNull();
  });

  it('sin candidatos pero con contacto directo: lo ofrece, sin botón de sumar y sin crear invitaciones', async () => {
    const { http, fixture, el } = setup();
    await load(
      http,
      fixture,
      options({
        state: 'NO_CANDIDATES',
        candidates: [],
        directContacts: [pro('d', { contactChannels: { whatsapp: true, phone: false, requests: false } })],
      }),
    );
    expect(text(el)).toContain('no hay otros profesionales que puedan responder');
    expect(text(el)).toContain('no los suma a tu solicitud ni cuenta como presupuesto');
    expect(el.querySelector('[data-testid="contact-whatsapp"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="add-pros-submit"]')).toBeNull();
  });
});
