import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { API_URL } from '../api/api.config';
import { authInterceptor } from '../auth/auth.interceptor';
import { AgendaItem } from '../models/agenda';
import { AuthResponse, AuthUser } from '../models/auth';
import { Appointment, ProServiceRequest, ServiceRequest } from '../models/request';
import { requestProgress } from '../models/request-status';
import {
  businessClock,
  businessDay,
  businessInstant,
  dayStartIso,
  formatDayHeading,
  formatDayLong,
  formatWhen,
  shiftDay,
  weekStart,
} from '../utils/business-time';
import { AgendaStore } from './agenda.store';
import { AuthStore } from './auth.store';
import { MyRequestsStore } from './my-requests.store';
import { RequestDetailPage } from '../../features/client/my-requests/request-detail/request-detail-page';
import { ProAgendaPage } from '../../features/pro/agenda/pro-agenda-page';
import { ProRequestDetailPage } from '../../features/pro/request-detail/pro-request-detail-page';
import { proCoordination, proPersonalState } from '../../features/pro/pro-ui';
import { ProSidebar } from '../../layout/pro-sidebar/pro-sidebar';

// HTTP mockeado: estos tests nunca llaman a Render.
const API = 'http://api.test/api/v1';
const REQ_ID = '11111111-1111-4111-8111-111111111111';
const PRO_1 = '22222222-2222-4222-8222-222222222222';
const APPT = '77777777-7777-4777-8777-777777777777';
const HOUR = 3600_000;

const USER: AuthUser = {
  id: 'u-1', firstName: 'María', lastName: 'González', email: 'maria@example.com', phone: '+54 249 400 1234',
  phoneVerified: false, avatarUrl: null, defaultZoneId: null, professionalProfileId: null,
  createdAt: '2026-09-01T12:00:00.000Z',
};
const PRO_USER: AuthUser = { ...USER, id: 'u-pro', firstName: 'Juan', professionalProfileId: PRO_1 };
const tokens: AuthResponse = { accessToken: 'a.1.s', refreshToken: 'r.1.s', expiresIn: 900, tokenType: 'Bearer' };

const iso = (msFromNow: number) => new Date(Date.now() + msFromNow).toISOString();

const appointment = (overrides: Partial<Appointment> = {}): Appointment => {
  const startsAt = overrides.startsAt ?? iso(48 * HOUR);
  return {
    id: APPT, status: 'PROPOSED', startsAt, endsAt: new Date(new Date(startsAt).getTime() + 2 * HOUR).toISOString(),
    durationMinutes: 120, note: null, cancelledBy: null,
    createdAt: '2026-09-25T13:00:00.000Z', updatedAt: '2026-09-25T13:00:00.000Z',
    ...overrides,
  };
};

const request = (overrides: Partial<ServiceRequest> = {}): ServiceRequest => ({
  id: REQ_ID, title: 'Pérdida bajo mesada', description: 'Gotea la pileta de la cocina desde ayer.', urgency: 'FLEXIBLE',
  status: 'PROFESSIONAL_SELECTED', desiredDate: null, desiredTimeRange: null,
  service: { id: 's', name: 'Plomería', slug: 'plomeria' }, zone: { id: 'z', name: 'Villa Italia', slug: 'villa-italia' },
  photos: [], createdAt: '2026-09-25T13:00:00.000Z', updatedAt: '2026-09-25T13:00:00.000Z',
  exactAddress: 'Quintana 860', selectedProfessionalId: PRO_1, acceptedQuoteId: 'q-1', completedAt: null, cancelledAt: null,
  appointment: null, review: null, canReview: false,
  invitations: [
    {
      id: 'inv-1', professionalId: PRO_1, status: 'SELECTED', sentAt: '2026-09-25T13:00:00.000Z', respondedAt: null,
      professional: { id: PRO_1, displayName: 'Juan Prueba', avatarUrl: null, averageRating: null, reviewsCount: 0 },
    },
  ],
  ...overrides,
});

const proRequest = (overrides: Partial<ProServiceRequest> = {}): ProServiceRequest => {
  const { exactAddress: _a, selectedProfessionalId: _s, acceptedQuoteId: _q, invitations: _i, cancelledAt: _c, ...base } = request();
  return {
    ...base,
    invitationStatus: 'SELECTED', otherInvitedCount: 1, selectedByClient: true,
    client: { firstName: 'María', lastInitial: 'G' },
    contact: { fullName: 'María González', phone: '+54 249 400 1234', exactAddress: 'Quintana 860' },
    ...overrides,
  };
};

@Component({ template: '' })
class Blank {}

const flush = () => new Promise((r) => setTimeout(r));

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([authInterceptor])),
      provideHttpClientTesting(),
      provideRouter([{ path: '**', component: Blank }], withComponentInputBinding()),
      { provide: API_URL, useValue: API },
    ],
  });
  return TestBed.inject(HttpTestingController);
}

async function signIn(user: AuthUser) {
  const auth = TestBed.inject(AuthStore);
  const http = TestBed.inject(HttpTestingController);
  auth.initialize();
  const done = auth.login({ email: user.email, password: 'una-clave-larga' });
  http.expectOne(`${API}/auth/login`).flush(tokens);
  await flush();
  http.expectOne(`${API}/auth/me`).flush(user);
  await done;
}

const labels = (el: HTMLElement) => Array.from(el.querySelectorAll('a, button')).map((n) => (n.textContent ?? '').trim());
const button = (el: HTMLElement, label: string) =>
  Array.from(el.querySelectorAll<HTMLButtonElement>('button')).find((b) => (b.textContent ?? '').trim() === label);
const dialog = (el: HTMLElement) => el.querySelector<HTMLDialogElement>('dialog[open]');

beforeEach(() => sessionStorage.clear());
afterEach(() => TestBed.inject(HttpTestingController).verify({ ignoreCancelled: true }));

// ---------------------------------------------------------------------------
describe('hora de Argentina (sin depender del navegador)', () => {
  it('muestra y arma horarios en America/Argentina/Buenos_Aires', () => {
    setup();
    // 01:30 UTC del 29 = 22:30 del 28 en Tandil.
    expect(businessDay('2026-09-29T01:30:00.000Z')).toBe('2026-09-28');
    expect(businessClock('2026-09-29T01:30:00.000Z')).toBe('22:30');
    expect(businessInstant('2026-09-28', '10:00')).toBe('2026-09-28T10:00:00-03:00');
    expect(dayStartIso('2026-09-28')).toBe('2026-09-28T03:00:00.000Z');
    expect(formatDayLong('2026-09-28')).toBe('Lunes 28 de septiembre');
    expect(weekStart('2026-10-04')).toBe('2026-09-28');
    expect(shiftDay('2026-09-30', 2)).toBe('2026-10-02');
  });

  it('"Hoy, 19:30" · "Mañana, 09:00" · "28 sep, 14:00"', () => {
    setup();
    const now = new Date('2026-09-26T15:00:00-03:00');
    expect(formatWhen('2026-09-26T19:30:00-03:00', now)).toBe('Hoy, 19:30');
    expect(formatWhen('2026-09-27T09:00:00-03:00', now)).toBe('Mañana, 09:00');
    expect(formatWhen('2026-09-28T14:00:00-03:00', now)).toBe('28 sep, 14:00');
    expect(formatDayHeading('2026-09-26', '2026-09-26')).toBe('Hoy · sábado 26');
  });
});

describe('progreso y estados', () => {
  const steps = (s: Parameters<typeof requestProgress>[0]) => requestProgress(s)!.map((p) => `${p.state}:${p.label}`);

  it('4 pasos: coordinar → trabajo agendado → trabajo realizado', () => {
    setup();
    expect(steps('PROFESSIONAL_SELECTED')[3]).toBe('current:Coordinar trabajo');
    expect(steps('SCHEDULED')[3]).toBe('current:Trabajo agendado');
    expect(steps('COMPLETED')).toEqual([
      'done:Solicitud enviada', 'done:Presupuestos recibidos', 'done:Profesional elegido', 'done:Trabajo realizado',
    ]);
    expect(requestProgress('CANCELLED')).toBeNull();
  });

  it('profesional: acciones según el estado real (y nunca para el perdedor)', () => {
    setup();
    const today = businessDay();
    expect(proCoordination(proRequest())?.propose?.label).toBe('Coordinar trabajo');
    const proposed = proRequest({ appointment: appointment() });
    expect(proPersonalState(proposed).title).toBe('Esperando confirmación');
    expect(proCoordination(proposed)?.replace?.label).toBe('Cambiar propuesta');
    const declined = proRequest({ appointment: appointment({ status: 'DECLINED' }) });
    expect(proPersonalState(declined).title).toBe('El cliente necesita otro horario');
    expect(proCoordination(declined)?.propose?.label).toBe('Proponer otra fecha');
    const scheduled = proRequest({ status: 'SCHEDULED', appointment: appointment({ status: 'CONFIRMED' }) });
    expect(proPersonalState(scheduled).title).toBe('Trabajo agendado');
    expect(proCoordination(scheduled)).toMatchObject({ replace: { label: 'Reprogramar' }, complete: { enabled: false } });
    expect(proCoordination(scheduled, shiftDay(today, 5))?.complete?.enabled).toBe(true);
    const done = proRequest({ status: 'COMPLETED', completedAt: '2026-09-28T15:14:00.000Z', appointment: appointment({ status: 'COMPLETED' }) });
    expect(proPersonalState(done)).toMatchObject({ title: 'Trabajo realizado', detail: '28 sep · 12:14' });
    expect(proCoordination(done)).toBeNull();
    const loser = proRequest({ invitationStatus: 'NOT_SELECTED', selectedByClient: false, contact: null });
    expect(proCoordination(loser)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe('profesional elegido: coordinar el trabajo', () => {
  async function open(r: ProServiceRequest) {
    const http = setup();
    await signIn(PRO_USER);
    const fixture = TestBed.createComponent(ProRequestDetailPage);
    fixture.componentRef.setInput('id', REQ_ID);
    fixture.detectChanges();
    await fixture.whenStable();
    http.expectOne(`${API}/pro/requests/${REQ_ID}`).flush(r);
    fixture.detectChanges();
    return { http, fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('"Coordinar trabajo" → formulario (fecha, hora, duración, nota) → un POST con hora de Argentina', async () => {
    const { http, fixture, el } = await open(proRequest());
    expect(el.textContent).toContain('Te eligieron');
    button(el, 'Coordinar trabajo')!.click();
    fixture.detectChanges();
    const d = dialog(el)!;
    expect(d.getAttribute('aria-labelledby')).toBe('propose-title');
    expect(d.textContent).toContain('Proponer fecha y horario');
    expect(d.querySelector('label[for="appt-date"]')).not.toBeNull();
    expect(d.querySelector('label[for="appt-time"]')).not.toBeNull();
    expect(Array.from(d.querySelectorAll('input[type="radio"]'))).toHaveLength(8);
    // No vuelve a pedir cliente, servicio ni dirección.
    expect(d.textContent).not.toMatch(/Dirección|Cliente|Servicio/);

    const day = shiftDay(businessDay(), 3);
    const set = (sel: string, value: string) => {
      const input = d.querySelector<HTMLInputElement | HTMLTextAreaElement>(sel)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    };
    set('#appt-date', day);
    set('#appt-time', '10:00');
    set('#appt-note', '  Llevo los materiales. ');
    d.querySelector<HTMLInputElement>('input[type="radio"][value="120"]')!.click();
    fixture.detectChanges();
    button(el, 'Enviar propuesta')!.click();
    fixture.detectChanges();
    expect(button(el, 'Volver')!.disabled).toBe(true); // no se cierra mientras guarda

    const post = http.expectOne({ method: 'POST', url: `${API}/pro/requests/${REQ_ID}/appointments` });
    expect(post.request.body).toEqual({ startsAt: `${day}T10:00:00-03:00`, durationMinutes: 120, note: 'Llevo los materiales.' });
    const startsAt = new Date(`${day}T10:00:00-03:00`).toISOString();
    post.flush(proRequest({ appointment: appointment({ startsAt, endsAt: new Date(new Date(startsAt).getTime() + 2 * HOUR).toISOString() }) }));
    await flush();
    fixture.detectChanges();
    expect(dialog(el)).toBeNull();
    expect(el.textContent).toContain('Esperando confirmación');
    expect(el.textContent).toContain('Horario propuesto');
    expect(el.textContent).toContain('10:00 a 12:00');
    expect(labels(el)).toContain('Cambiar propuesta');
    expect(labels(el)).not.toContain('Coordinar trabajo');
  });

  it('un horario pasado no se envía', async () => {
    const { http, fixture, el } = await open(proRequest());
    button(el, 'Coordinar trabajo')!.click();
    fixture.detectChanges();
    const date = dialog(el)!.querySelector<HTMLInputElement>('#appt-date')!;
    date.value = shiftDay(businessDay(), -1);
    date.dispatchEvent(new Event('input'));
    button(el, 'Enviar propuesta')!.click();
    fixture.detectChanges();
    expect(dialog(el)!.querySelector('[role="alert"]')?.textContent).toContain('Elegí una fecha y hora futuras.');
    http.expectNone(`${API}/pro/requests/${REQ_ID}/appointments`);
  });

  it('"Cambiar propuesta" reemplaza la activa (replacesAppointmentId) y 409 de superposición se explica sin datos ajenos', async () => {
    const { http, fixture, el } = await open(proRequest({ appointment: appointment() }));
    button(el, 'Cambiar propuesta')!.click();
    fixture.detectChanges();
    button(el, 'Enviar propuesta')!.click();
    const post = http.expectOne({ method: 'POST', url: `${API}/pro/requests/${REQ_ID}/appointments` });
    expect(post.request.body.replacesAppointmentId).toBe(APPT);
    post.flush({ statusCode: 409, code: 'APPOINTMENT_OVERLAP' }, { status: 409, statusText: 'Conflict' });
    await flush();
    fixture.detectChanges();
    expect(dialog(el)!.textContent).toContain('Ya tenés otro trabajo agendado en ese horario.');
  });

  it('trabajo agendado: Ver en agenda + Reprogramar; el día del trabajo, "Marcar trabajo como realizado"', async () => {
    const { http, fixture, el } = await open(
      proRequest({ status: 'SCHEDULED', appointment: appointment({ status: 'CONFIRMED', startsAt: iso(-HOUR), endsAt: iso(HOUR) }) }),
    );
    expect(el.textContent).toContain('Trabajo agendado');
    expect(labels(el)).toEqual(expect.arrayContaining(['Ver en agenda', 'Reprogramar', 'Marcar trabajo como realizado']));
    button(el, 'Marcar trabajo como realizado')!.click();
    fixture.detectChanges();
    expect(dialog(el)!.textContent).toContain('ya no se podrá reprogramar este trabajo');
    button(el, 'Marcar como realizado')!.click();
    http
      .expectOne({ method: 'POST', url: `${API}/pro/requests/${REQ_ID}/complete` })
      .flush(proRequest({ status: 'COMPLETED', completedAt: new Date().toISOString(), contact: null, appointment: appointment({ status: 'COMPLETED' }) }));
    await flush();
    fixture.detectChanges();
    expect(el.textContent).toContain('Trabajo realizado');
    expect(labels(el).some((t) => /Reprogramar|Cancelar|Enviar presupuesto|Marcar trabajo/.test(t))).toBe(false);
  });

  it('antes del día del trabajo no ofrece completarlo', async () => {
    const { el } = await open(proRequest({ status: 'SCHEDULED', appointment: appointment({ status: 'CONFIRMED', startsAt: iso(72 * HOUR) }) }));
    expect(labels(el)).not.toContain('Marcar trabajo como realizado');
    expect(el.textContent).toContain('Vas a poder marcarlo como realizado desde el día del trabajo.');
  });

  it('el perdedor nunca ve acciones de la cita', async () => {
    const { el } = await open(proRequest({ invitationStatus: 'NOT_SELECTED', selectedByClient: false, contact: null }));
    expect(labels(el).some((t) => /Coordinar|Reprogramar|Cambiar propuesta|Marcar trabajo|Ver en agenda/.test(t))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe('cliente: confirmar, pedir otro horario y cancelar horario', () => {
  async function open(r: ServiceRequest) {
    const http = setup();
    await signIn(USER);
    const fixture = TestBed.createComponent(RequestDetailPage);
    fixture.componentRef.setInput('id', REQ_ID);
    fixture.detectChanges();
    await fixture.whenStable();
    for (const x of http.match((q) => q.url.endsWith('/categories') || q.url.endsWith('/services'))) x.flush([]);
    http.expectOne({ method: 'GET', url: `${API}/requests/${REQ_ID}` }).flush(r);
    http.expectOne(`${API}/requests/${REQ_ID}/quotes`).flush([]);
    fixture.detectChanges();
    return { http, fixture, el: fixture.nativeElement as HTMLElement, store: TestBed.inject(MyRequestsStore) };
  }

  it('sin propuesta: "Esperando coordinación" y ninguna acción de cita', async () => {
    const { el } = await open(request());
    expect(el.textContent).toContain('Profesional elegido');
    expect(el.textContent).toContain('Esperando coordinación.');
    expect(labels(el).some((t) => /Confirmar horario|No puedo|Cancelar horario/.test(t))).toBe(false);
  });

  it('propuesta: "El profesional propuso" → Confirmar horario (un solo POST) → Trabajo agendado', async () => {
    const startsAt = new Date(`${shiftDay(businessDay(), 2)}T10:00:00-03:00`).toISOString();
    const a = appointment({ startsAt, endsAt: new Date(new Date(startsAt).getTime() + 2 * HOUR).toISOString() });
    const { http, fixture, el, store } = await open(request({ appointment: a }));
    expect(el.textContent).toContain('Horario propuesto');
    expect(el.textContent).toContain('El profesional propuso:');
    expect(el.textContent).toContain('10:00 a 12:00');
    expect(labels(el)).not.toContain('Aceptar presupuesto');
    button(el, 'Confirmar horario')!.click();
    fixture.detectChanges();
    expect(dialog(el)!.textContent).toContain(formatDayLong(businessDay(startsAt)));
    button(el, 'Confirmar')!.click();
    expect(await store.appointment('confirm', APPT)).toBe(false); // doble click: ignorado
    fixture.detectChanges();
    expect(button(el, 'Volver')!.disabled).toBe(true);
    http
      .expectOne({ method: 'POST', url: `${API}/appointments/${APPT}/confirm` })
      .flush(request({ status: 'SCHEDULED', appointment: { ...a, status: 'CONFIRMED' } }));
    await flush();
    fixture.detectChanges();
    expect(dialog(el)).toBeNull();
    expect(el.textContent).toContain('Trabajo agendado');
    expect(el.textContent).toContain('Quintana 860');
    expect(labels(el)).toContain('Cancelar horario');
    expect(labels(el).some((t) => /Confirmar horario|Elegir a|No puedo/.test(t))).toBe(false);
  });

  it('"No puedo en ese horario" → Pedir otro horario → espera una nueva propuesta', async () => {
    const { http, fixture, el } = await open(request({ appointment: appointment() }));
    button(el, 'No puedo en ese horario')!.click();
    fixture.detectChanges();
    expect(dialog(el)!.textContent).toContain('¿No podés en ese horario?');
    expect(dialog(el)!.textContent).toContain('El profesional podrá proponerte otro.');
    button(el, 'Pedir otro horario')!.click();
    http
      .expectOne({ method: 'POST', url: `${API}/appointments/${APPT}/decline` })
      .flush(request({ appointment: appointment({ status: 'DECLINED' }) }));
    await flush();
    fixture.detectChanges();
    expect(el.textContent).toContain('Pediste otro horario.');
    expect(el.textContent).toContain('Profesional elegido'); // no rechaza al profesional
  });

  it('dos pestañas: 409 → se explica y se relee la solicitud', async () => {
    const { http, fixture, el } = await open(request({ appointment: appointment() }));
    button(el, 'Confirmar horario')!.click();
    fixture.detectChanges();
    button(el, 'Confirmar')!.click();
    http
      .expectOne({ method: 'POST', url: `${API}/appointments/${APPT}/confirm` })
      .flush({ statusCode: 409, code: 'APPOINTMENT_STATE_CHANGED' }, { status: 409, statusText: 'Conflict' });
    await flush();
    http.expectOne({ method: 'GET', url: `${API}/requests/${REQ_ID}` }).flush(request({ appointment: appointment({ status: 'DECLINED' }) }));
    await flush();
    http.expectOne(`${API}/requests/${REQ_ID}/quotes`).flush([]);
    fixture.detectChanges();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('El horario cambió mientras tanto.');
    expect(labels(el)).not.toContain('Confirmar horario');
  });

  it('cancelar horario: diálogo propio (no cancela la solicitud)', async () => {
    const { http, fixture, el } = await open(request({ status: 'SCHEDULED', appointment: appointment({ status: 'CONFIRMED' }) }));
    button(el, 'Cancelar horario')!.click();
    fixture.detectChanges();
    expect(dialog(el)!.textContent).toContain('tu solicitud sigue con él');
    Array.from(dialog(el)!.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Cancelar horario')!.click();
    http
      .expectOne({ method: 'POST', url: `${API}/appointments/${APPT}/cancel` })
      .flush(request({ appointment: appointment({ status: 'CANCELLED', cancelledBy: 'CLIENT' }) }));
    await flush();
    fixture.detectChanges();
    expect(el.textContent).toContain('Cancelaste el horario.');
    http.expectNone(`${API}/requests/${REQ_ID}/cancel`);
  });

  it('trabajo realizado: sin acciones de cita ni reseña ficticia', async () => {
    const { el } = await open(
      request({ status: 'COMPLETED', completedAt: new Date().toISOString(), appointment: appointment({ status: 'COMPLETED' }) }),
    );
    expect(el.textContent).toContain('Trabajo realizado');
    expect(el.textContent).toContain('El profesional marcó este trabajo como completado.');
    expect(labels(el).some((t) => /Dejar reseña|Cancelar horario|Cancelar solicitud|Confirmar horario/.test(t))).toBe(false);
    expect(labels(el)).toContain('Crear solicitud similar');
  });
});

// ---------------------------------------------------------------------------
describe('Agenda real', () => {
  const item = (overrides: Partial<AgendaItem> = {}): AgendaItem => {
    const startsAt = overrides.startsAt ?? new Date(`${businessDay()}T10:00:00-03:00`).toISOString();
    return {
      id: APPT, requestId: REQ_ID, status: 'CONFIRMED', startsAt,
      endsAt: new Date(new Date(startsAt).getTime() + HOUR).toISOString(), durationMinutes: 60,
      title: 'Pérdida bajo mesada', service: { id: 's', name: 'Plomería' }, zone: { id: 'z', name: 'Villa Italia' },
      client: { firstName: 'Francisco', lastInitial: 'L' },
      ...overrides,
    };
  };

  async function open() {
    const http = setup();
    await signIn(PRO_USER);
    const fixture = TestBed.createComponent(ProAgendaPage);
    fixture.detectChanges();
    await fixture.whenStable();
    const monday = weekStart(businessDay());
    const req = http.expectOne((r) => r.url === `${API}/pro/appointments`);
    expect(req.request.params.get('from')).toBe(dayStartIso(monday));
    expect(req.request.params.get('to')).toBe(dayStartIso(shiftDay(monday, 7)));
    return { http, fixture, req, el: fixture.nativeElement as HTMLElement };
  }

  it('pide la semana al backend y muestra los trabajos reales (grilla y lista del día)', async () => {
    const { fixture, req, el } = await open();
    req.flush([item(), item({ id: 'a-2', status: 'PROPOSED', startsAt: new Date(`${businessDay()}T15:30:00-03:00`).toISOString() })]);
    fixture.detectChanges();
    expect(el.textContent).toContain('Plomería');
    expect(el.textContent).toContain('Francisco L.');
    expect(el.textContent).toContain('Villa Italia');
    expect(el.textContent).toContain('sin confirmar');
    expect(el.textContent).toMatch(/Hoy · \w+/);
    // Móvil: cada trabajo lleva a la solicitud; sin teléfono ni dirección.
    expect(el.querySelectorAll(`a[href="/pro/solicitudes/${REQ_ID}"]`).length).toBeGreaterThan(0);
    expect(el.textContent).not.toMatch(/Quintana|400 1234|Rosa|Kiosco|Avisar que voy|Cómo llegar/);
    expect(el.textContent).not.toContain('demostración');
  });

  it('semana siguiente: nuevo rango al backend', async () => {
    const { http, fixture, req, el } = await open();
    req.flush([]);
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('button[aria-label="Semana siguiente"]')!.click();
    const next = http.expectOne((r) => r.url === `${API}/pro/appointments`);
    expect(next.request.params.get('from')).toBe(dayStartIso(shiftDay(weekStart(businessDay()), 7)));
    next.flush([]);
  });

  it('vacío real, sin ejemplos', async () => {
    const { fixture, req, el } = await open();
    req.flush([]);
    fixture.detectChanges();
    expect(el.textContent).toContain('Todavía no tenés trabajos agendados.');
    expect(el.textContent).toContain('Cuando un cliente confirme un horario, va a aparecer acá.');
    expect(el.querySelector('a[href="/pro/solicitudes"]')?.textContent).toContain('Ver solicitudes');
  });

  it('error → "No pudimos cargar tu agenda." + Reintentar (nunca un mock)', async () => {
    const { http, fixture, req, el } = await open();
    req.flush({}, { status: 500, statusText: 'x' });
    fixture.detectChanges();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('No pudimos cargar tu agenda.');
    button(el, 'Reintentar')!.click();
    http.expectOne((r) => r.url === `${API}/pro/appointments`).flush([item()]);
    fixture.detectChanges();
    expect(el.textContent).toContain('Francisco L.');
    expect(TestBed.inject(AgendaStore).error()).toBeNull();
  });
});

describe('navegación profesional', () => {
  it('"Tu mes" y Plan no aparecen: siguen siendo demo', async () => {
    const http = setup();
    await signIn(PRO_USER);
    const fixture = TestBed.createComponent(ProSidebar);
    fixture.detectChanges();
    for (const r of http.match(() => true)) r.flush({});
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Agenda');
    expect(text).not.toContain('Tu mes');
    expect(text).not.toMatch(/\bPlan\b/);
  });
});
