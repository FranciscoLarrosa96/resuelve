import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { API_URL } from '../../../core/api/api.config';
import { authInterceptor } from '../../../core/auth/auth.interceptor';
import { AuthResponse, AuthUser } from '../../../core/models/auth';
import { OwnProfessional, OwnVerification } from '../../../core/models/pro-profile';
import { AuthStore } from '../../../core/state/auth.store';
import { LICENSE_MESSAGES, ProStore, documentProblem } from '../../../core/state/pro.store';
import { ProfessionalsStore } from '../../../core/state/professionals.store';
import { ProProfilePage } from './pro-profile-page';

// HTTP mockeado: nunca se llama a Render ni a Cloudinary.
const API = 'http://api.test/api/v1';
const PROFILE_ID = '22222222-2222-4222-8222-222222222222';
const GAS = '66666666-6666-4666-8666-666666666666';
const PLOMERIA = '77777777-7777-4777-8777-777777777777';
const CENTRO = '44444444-4444-4444-8444-444444444444';
const UNCAS = '55555555-5555-4555-8555-555555555555';
const PUBLIC_ID = `resuelve/verifications/${PROFILE_ID}/abc123`;

const USER: AuthUser = {
  id: 'u-pro', firstName: 'Profesional', lastName: 'de prueba 1', email: 'pro@example.com', phone: null,
  phoneVerified: false, avatarUrl: null, defaultZoneId: null, professionalProfileId: PROFILE_ID,
  createdAt: '2026-09-01T12:00:00.000Z',
};
const tokens: AuthResponse = { accessToken: 'a.1.s', refreshToken: 'r.1.s', expiresIn: 900, tokenType: 'Bearer' };

const verification = (overrides: Partial<OwnVerification>): OwnVerification => ({
  id: 'v-1', type: 'LICENSE', status: 'PENDING', serviceId: GAS, reference: 'Mat. 777',
  submittedAt: '2026-09-26T12:00:00.000Z', reviewedAt: null, expiresAt: null, rejectionReason: null, hasDocument: true,
  ...overrides,
});

function own(overrides: Partial<OwnProfessional> = {}): OwnProfessional {
  return {
    id: PROFILE_ID, firstName: 'Profesional', lastName: 'de prueba 1', displayName: 'Profesional de prueba 1',
    avatarUrl: null, headline: 'Plomero en Tandil', bio: 'Trabajo prolijo.', yearsExperience: 5, availableToday: false,
    averageResponseMinutes: null, averageRating: null, reviewsCount: 0, completedJobsCount: 0,
    services: [{ id: PLOMERIA, name: 'Plomería', slug: 'plomeria' }],
    coversEntireCity: true, zones: [],
    verifications: { identity: false, phone: false, license: false, licenses: [] },
    status: 'ACTIVE',
    offeredServices: [
      { id: PLOMERIA, name: 'Plomería', slug: 'plomeria', requiresLicense: false, licenseStatus: 'NOT_REQUIRED', public: true },
      { id: GAS, name: 'Gas', slug: 'gas', requiresLicense: true, licenseStatus: 'NOT_SUBMITTED', public: false },
    ],
    savedZones: [{ id: UNCAS, name: 'Uncas', slug: 'uncas' }],
    planTier: 'FREE', monthlyRequestUsage: 0, monthlyRequestLimit: 10,
    verificationRequests: [],
    ...overrides,
  };
}

@Component({ template: '' })
class Blank {}

const flush = () => new Promise((r) => setTimeout(r));

async function open(profile = own()) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([authInterceptor])),
      provideHttpClientTesting(),
      provideRouter([{ path: '**', component: Blank }]),
      { provide: API_URL, useValue: API },
    ],
  });
  const http = TestBed.inject(HttpTestingController);
  const auth = TestBed.inject(AuthStore);
  auth.initialize();
  const done = auth.login({ email: USER.email, password: 'una-clave-larga' });
  http.expectOne(`${API}/auth/login`).flush(tokens);
  await flush();
  http.expectOne(`${API}/auth/me`).flush(USER);
  await done;

  const fixture = TestBed.createComponent(ProProfilePage);
  fixture.detectChanges();
  http.expectOne(`${API}/pro/me`).flush(profile);
  http.expectOne(`${API}/categories`).flush([
    { id: 'cat', name: 'Hogar', slug: 'hogar', services: [] },
  ]);
  http.expectOne((r) => r.url === `${API}/services`).flush([
    { id: PLOMERIA, name: 'Plomería', slug: 'plomeria', categoryId: 'cat', requiresLicense: false },
    { id: GAS, name: 'Gas', slug: 'gas', categoryId: 'cat', requiresLicense: true },
  ]);
  http.expectOne((r) => r.url === `${API}/zones`).flush([
    { id: CENTRO, name: 'Centro', slug: 'centro', cityId: 'c' },
    { id: UNCAS, name: 'Uncas', slug: 'uncas', cityId: 'c' },
  ]);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const click = (label: string | RegExp, root: ParentNode = el) => {
    const b = [...root.querySelectorAll<HTMLButtonElement>('button')].find((x) =>
      typeof label === 'string' ? x.textContent?.trim() === label || x.getAttribute('aria-label') === label : label.test(x.textContent ?? ''),
    );
    if (!b) throw new Error(`No está el botón ${label}`);
    b.click();
    fixture.detectChanges();
  };
  return { http, fixture, el, click, store: TestBed.inject(ProStore) };
}

beforeEach(() => sessionStorage.clear());
afterEach(() => TestBed.inject(HttpTestingController).verify({ ignoreCancelled: true }));

describe('/pro/perfil (real)', () => {
  it('carga el perfil real por secciones, sin datos demo', async () => {
    const { el } = await open();
    const text = el.textContent ?? '';
    expect(text).toContain('Mi perfil profesional');
    expect(text).toContain('Profesional de prueba 1');
    expect(text).toContain('Plomero en Tandil');
    for (const title of ['Presentación', 'Servicios', 'Cobertura', 'Disponibilidad', 'Verificaciones']) expect(text).toContain(title);
    expect(text).toContain('Todo Tandil');
    expect(text).toContain('Matrícula pendiente');
    expect(text).toContain('No aparecés en búsquedas de Gas hasta que verifiquemos la matrícula.');
    expect(el.querySelector(`a[href="/profesional/${PROFILE_ID}"]`)?.textContent).toContain('Ver mi perfil público');
    expect(text).not.toMatch(/Juan Martín|85%|Electricista matriculado|N\.º 4\.218|Portfolio/);
  });

  it('edita la presentación y guarda solo esa sección', async () => {
    const { http, fixture, el, click } = await open();
    click('Editar presentación');
    const headline = el.querySelector<HTMLInputElement>('#pp-headline')!;
    headline.value = 'Plomero y gasista en Tandil';
    headline.dispatchEvent(new Event('input'));
    click('Guardar');
    const req = http.expectOne({ method: 'PATCH', url: `${API}/pro/profile` });
    expect(req.request.body).toEqual({ headline: 'Plomero y gasista en Tandil', bio: 'Trabajo prolijo.', yearsExperience: 5 });
    req.flush(own({ headline: 'Plomero y gasista en Tandil' }));
    await flush();
    fixture.detectChanges();
    expect(el.querySelector('#pp-headline')).toBeNull();
    expect(el.textContent).toContain('Plomero y gasista en Tandil');
  });

  it('error al guardar: mensaje recuperable y el formulario sigue abierto', async () => {
    const { http, fixture, el, click } = await open();
    click('Editar presentación');
    click('Guardar');
    http.expectOne(`${API}/pro/profile`).flush({ code: 'INTERNAL_ERROR' }, { status: 500, statusText: 'x' });
    await flush();
    fixture.detectChanges();
    expect(el.querySelector('#pp-headline')).not.toBeNull();
    expect(el.textContent).toContain('No pudimos guardar los cambios.');
  });

  it('servicios: quitar uno avisa que deja de aparecer y manda serviceIds reales', async () => {
    const { http, el, click } = await open();
    click('Editar servicios');
    const gas = [...el.querySelectorAll('label')].find((l) => l.textContent?.includes('Gas'))!.querySelector('input')!;
    gas.click();
    TestBed.inject(ProStore); // noop: fuerza el ciclo
    click('Guardar');
    expect(el.textContent).toContain('Vas a dejar de aparecer en búsquedas de Gas');
    const req = http.expectOne({ method: 'PATCH', url: `${API}/pro/profile` });
    expect(req.request.body).toEqual({ serviceIds: [PLOMERIA] });
    req.flush(own());
  });

  it('cobertura: "Solo algunos barrios" restaura los barrios guardados (UUID) y "Todo Tandil" no los borra', async () => {
    const { http, fixture, el, click } = await open();
    click('Editar cobertura');
    const radio = (name: string) => [...el.querySelectorAll('label')].find((l) => l.textContent?.trim() === name)!.querySelector('input')!;
    radio('Solo algunos barrios').click();
    fixture.detectChanges();
    expect(radio('Uncas').checked).toBe(true);
    radio('Centro').click();
    fixture.detectChanges();
    click('Guardar');
    const req = http.expectOne({ method: 'PATCH', url: `${API}/pro/profile` });
    expect(req.request.body).toEqual({ coversEntireCity: false, zoneIds: [UNCAS, CENTRO] });
    req.flush(own({ coversEntireCity: false, zones: [{ id: CENTRO, name: 'Centro', slug: 'centro' }, { id: UNCAS, name: 'Uncas', slug: 'uncas' }], savedZones: [] }));
    await flush();
    fixture.detectChanges();
    expect(el.textContent).toContain('Centro, Uncas');

    click('Editar cobertura');
    radio('Todo Tandil').click();
    fixture.detectChanges();
    expect(el.textContent).toContain('Vas a aparecer en búsquedas de cualquier barrio de Tandil.');
    click('Guardar');
    expect(http.expectOne(`${API}/pro/profile`).request.body).toEqual({ coversEntireCity: true });
  });

  it('pausar pide confirmación y distingue perfil visible de "Disponible hoy"', async () => {
    const { http, fixture, el, click } = await open(own({ availableToday: true }));
    click('Pausar perfil');
    const dialog = el.querySelector('dialog[open]')!;
    expect(dialog.textContent).toContain('No vas a aparecer en búsquedas nuevas');
    click('Pausar perfil', dialog);
    const req = http.expectOne({ method: 'PATCH', url: `${API}/pro/status` });
    expect(req.request.body).toEqual({ status: 'PAUSED' });
    req.flush(own({ status: 'PAUSED', availableToday: true }));
    await flush();
    fixture.detectChanges();
    expect(el.textContent).toContain('Perfil pausado');
    expect(el.querySelector(`a[href="/profesional/${PROFILE_ID}"]`)).toBeNull();
    expect(el.querySelector('[role="switch"]')?.getAttribute('aria-checked')).toBe('true');
    expect(el.textContent).toContain('Reactivar perfil');
  });

  it('disponibilidad: el switch de la sección usa la misma fuente (PATCH /pro/availability)', async () => {
    const { http, fixture, el, store } = await open();
    el.querySelector<HTMLButtonElement>('[role="switch"]')!.click();
    fixture.detectChanges();
    http.expectOne({ method: 'PATCH', url: `${API}/pro/availability` }).flush(own({ availableToday: true }));
    await flush();
    expect(store.available()).toBe(true);
    expect(store.ownProfile()?.availableToday).toBe(true);
  });

  it('los cambios se ven en el perfil público sin F5 (se invalida la caché)', async () => {
    const { http, click } = await open();
    const pros = TestBed.inject(ProfessionalsStore);
    pros.loadDetail(PROFILE_ID);
    http.expectOne(`${API}/professionals/${PROFILE_ID}`).flush({ ...own(), portfolio: [], reviews: [], ratingDistribution: [] });
    pros.loadDetail(PROFILE_ID);
    http.expectNone(`${API}/professionals/${PROFILE_ID}`); // cacheado
    click('Editar presentación');
    click('Guardar');
    http.expectOne(`${API}/pro/profile`).flush(own());
    await flush();
    pros.loadDetail(PROFILE_ID);
    http.expectOne(`${API}/professionals/${PROFILE_ID}`).flush({ ...own(), portfolio: [], reviews: [], ratingDistribution: [] });
  });
});

describe('verificaciones (UI)', () => {
  const states: [string, Partial<OwnProfessional>, string[], string | null][] = [
    ['sin enviar', {}, ['Sin enviar', 'Todavía no verificamos esta matrícula.'], 'Enviar matrícula'],
    [
      'en revisión',
      { offeredServices: [{ id: GAS, name: 'Gas', slug: 'gas', requiresLicense: true, licenseStatus: 'PENDING', public: false }], verificationRequests: [verification({})] },
      ['En revisión', 'Mat. 777', 'Hoy'],
      null,
    ],
    [
      'verificada',
      { offeredServices: [{ id: GAS, name: 'Gas', slug: 'gas', requiresLicense: true, licenseStatus: 'VERIFIED', public: true }], verificationRequests: [verification({ status: 'VERIFIED', expiresAt: '2027-12-31T23:59:59.000Z' })] },
      ['Matrícula verificada', 'Esta matrícula fue revisada por Resuelve.', '31 dic 2027'],
      null,
    ],
    [
      'rechazada',
      { offeredServices: [{ id: GAS, name: 'Gas', slug: 'gas', requiresLicense: true, licenseStatus: 'REJECTED', public: false }], verificationRequests: [verification({ status: 'REJECTED', rejectionReason: 'La imagen no permite leer el número.' })] },
      ['No pudimos verificar la matrícula', 'Motivo:', 'La imagen no permite leer el número.'],
      'Volver a enviar',
    ],
    [
      'vencida',
      { offeredServices: [{ id: GAS, name: 'Gas', slug: 'gas', requiresLicense: true, licenseStatus: 'EXPIRED', public: false }], verificationRequests: [verification({ status: 'EXPIRED' })] },
      ['La matrícula venció'],
      'Enviar de nuevo',
    ],
  ];

  for (const [name, patch, texts, action] of states) {
    it(`estado ${name}`, async () => {
      const { el } = await open(own(patch));
      const card = el.querySelector('app-license-card')!;
      for (const t of texts) expect(card.textContent).toContain(t);
      const buttons = [...card.querySelectorAll('button')].map((b) => b.textContent?.trim());
      if (action) expect(buttons).toContain(action);
      else expect(buttons).toEqual([]);
      expect(card.textContent).not.toContain('resuelve/verifications');
    });
  }

  it('archivo inválido: aviso local y no sube nada', async () => {
    const { http, fixture, el, click } = await open();
    click('Enviar matrícula');
    const input = el.querySelector<HTMLInputElement>('input[type="file"]')!;
    expect(input.labels?.[0]?.textContent).toContain('Foto o PDF de la matrícula');
    expect(documentProblem(new File(['x'], 'a.exe', { type: 'application/x-msdownload' }))).toBe(LICENSE_MESSAGES.type);
    expect(documentProblem(new File([new Uint8Array(11 * 1024 * 1024)], 'a.pdf', { type: 'application/pdf' }))).toBe(LICENSE_MESSAGES.size);
    click('Enviar a revisión');
    await flush();
    fixture.detectChanges();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Ingresá el número');
    http.expectNone(`${API}/pro/verifications/upload`);
  });

  it('envío: firma → sube directo al almacenamiento → confirma con publicId; reenvío tras rechazo', async () => {
    const rejected = own({
      offeredServices: [{ id: GAS, name: 'Gas', slug: 'gas', requiresLicense: true, licenseStatus: 'REJECTED', public: false }],
      verificationRequests: [verification({ status: 'REJECTED', rejectionReason: 'Ilegible.' })],
    });
    const { http, fixture, el, click, store } = await open(rejected);
    click('Volver a enviar');
    const ref = el.querySelector<HTMLInputElement>(`#ref-${GAS}`)!;
    expect(ref.value).toBe('Mat. 777'); // precarga la referencia anterior
    ref.value = 'Mat. N.º 4218';
    ref.dispatchEvent(new Event('input'));
    const file = new File(['%PDF-1.4'], 'matricula.pdf', { type: 'application/pdf' });
    const input = el.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, 'files', { value: [file] });
    input.dispatchEvent(new Event('change'));
    click('Enviar a revisión');

    http.expectOne({ method: 'POST', url: `${API}/pro/verifications/upload` }).flush({
      uploadUrl: 'https://upload.test/v1_1/demo/image/upload', fields: { public_id: PUBLIC_ID, type: 'private', signature: 'sig' },
      publicId: PUBLIC_ID, allowedFormats: ['pdf'], maxBytes: 10485760, expiresAt: '2026-09-26T13:00:00.000Z',
    });
    await flush();
    const upload = http.expectOne('https://upload.test/v1_1/demo/image/upload');
    const form = upload.request.body as FormData;
    expect(form.get('public_id')).toBe(PUBLIC_ID);
    expect(form.get('type')).toBe('private');
    expect(form.get('file')).toBe(file);
    expect(upload.request.headers.has('Authorization')).toBe(false); // el token nunca sale de nuestra API
    fixture.detectChanges();
    expect(el.querySelector('[role="progressbar"]')).not.toBeNull();
    upload.flush({ public_id: PUBLIC_ID });
    await flush();

    const submit = http.expectOne({ method: 'POST', url: `${API}/pro/verifications` });
    expect(submit.request.body).toEqual({ type: 'LICENSE', serviceId: GAS, reference: 'Mat. N.º 4218', documentPublicId: PUBLIC_ID });
    submit.flush(
      own({
        offeredServices: [{ id: GAS, name: 'Gas', slug: 'gas', requiresLicense: true, licenseStatus: 'PENDING', public: false }],
        verificationRequests: [verification({ id: 'v-2', reference: 'Mat. N.º 4218' }), verification({ status: 'REJECTED' })],
      }),
    );
    await flush();
    fixture.detectChanges();
    expect(store.licenseUpload()).toBeNull();
    const card = el.querySelector('app-license-card')!;
    expect(card.textContent).toContain('En revisión');
    expect(card.textContent).not.toContain(PUBLIC_ID);
  });

  it('solo con el número: sin firma ni subida, queda en revisión', async () => {
    const { http, fixture, el, click } = await open();
    click('Enviar matrícula');
    expect(el.querySelector<HTMLInputElement>('input[type="file"]')?.labels?.[0]?.textContent).toContain('(opcional)');
    const ref = el.querySelector<HTMLInputElement>(`#ref-${GAS}`)!;
    ref.value = 'Mat. N.º 4218';
    ref.dispatchEvent(new Event('input'));
    click('Enviar a revisión');
    http.expectNone(`${API}/pro/verifications/upload`);
    const submit = http.expectOne({ method: 'POST', url: `${API}/pro/verifications` });
    expect(submit.request.body).toEqual({ type: 'LICENSE', serviceId: GAS, reference: 'Mat. N.º 4218' });
    submit.flush(
      own({
        offeredServices: [{ id: GAS, name: 'Gas', slug: 'gas', requiresLicense: true, licenseStatus: 'PENDING', public: false }],
        verificationRequests: [verification({ reference: 'Mat. N.º 4218', hasDocument: false })],
      }),
    );
    await flush();
    fixture.detectChanges();
    const card = el.querySelector('app-license-card')!;
    expect(card.textContent).toContain('En revisión');
    expect(card.textContent).toContain('Estamos verificando el número en el registro oficial.');
  });

  it('almacenamiento sin configurar: mensaje claro, sin subir', async () => {
    const { http, fixture, el, click } = await open();
    click('Enviar matrícula');
    const ref = el.querySelector<HTMLInputElement>(`#ref-${GAS}`)!;
    ref.value = 'Mat. 1';
    ref.dispatchEvent(new Event('input'));
    const input = el.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, 'files', { value: [new File(['x'], 'm.png', { type: 'image/png' })] });
    input.dispatchEvent(new Event('change'));
    click('Enviar a revisión');
    http.expectOne(`${API}/pro/verifications/upload`).flush({ code: 'UPLOADS_NOT_CONFIGURED' }, { status: 503, statusText: 'x' });
    await flush();
    fixture.detectChanges();
    expect(el.textContent).toContain(LICENSE_MESSAGES.unavailable);
  });
});
