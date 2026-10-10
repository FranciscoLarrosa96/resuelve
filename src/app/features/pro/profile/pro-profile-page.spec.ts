import { Component } from '@angular/core';
import { vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { API_URL } from '../../../core/api/api.config';
import { authInterceptor } from '../../../core/auth/auth.interceptor';
import { WorkPhoto } from '../../../core/models/professional';
import { AuthResponse, AuthUser } from '../../../core/models/auth';
import { OwnProfessional, OwnVerification } from '../../../core/models/pro-profile';
import { AuthStore } from '../../../core/state/auth.store';
import { LICENSE_MESSAGES, ProStore, documentProblem } from '../../../core/state/pro.store';
import { ProfessionalsStore } from '../../../core/state/professionals.store';
import { ProProfilePage } from './pro-profile-page';
import { TEST_LOCALITY, testNeighborhoodsUrl } from '../../../core/state/locality.testing';

// HTTP mockeado: nunca se llama a Render ni a Cloudinary.
const API = 'http://api.test/api/v1';
const PROFILE_ID = '22222222-2222-4222-8222-222222222222';
const GAS = '66666666-6666-4666-8666-666666666666';
const PLOMERIA = '77777777-7777-4777-8777-777777777777';
const CENTRO = '44444444-4444-4444-8444-444444444444';
const UNCAS = '55555555-5555-4555-8555-555555555555';
const PUBLIC_ID = `resuelve/verifications/${PROFILE_ID}/abc123`;

const USER: AuthUser = {
  id: 'u-pro',
  firstName: 'Profesional',
  lastName: 'de prueba 1',
  email: 'pro@example.com',
  phone: null,
  phoneVerified: false,
  emailVerifiedAt: '2026-01-01T00:00:00.000Z',
  emailVerified: true,
  avatarUrl: null,
  defaultZoneId: null,
  professionalProfileId: PROFILE_ID,
  createdAt: '2026-09-01T12:00:00.000Z',
};
const tokens: AuthResponse = {
  accessToken: 'a.1.s',
  refreshToken: 'r.1.s',
  expiresIn: 900,
  tokenType: 'Bearer',
};

const verification = (overrides: Partial<OwnVerification>): OwnVerification => ({
  id: 'v-1',
  type: 'LICENSE',
  status: 'PENDING',
  serviceId: GAS,
  reference: 'Mat. 777',
  submittedAt: new Date().toISOString(),
  reviewedAt: null,
  expiresAt: null,
  rejectionReason: null,
  hasDocument: true,
  ...overrides,
});

const TANDIL_REF = {
  id: TEST_LOCALITY.id,
  name: 'Tandil',
  slug: 'tandil',
  province: { name: 'Buenos Aires', slug: 'buenos-aires' },
};
const RAUCH = { id: '99999999-9999-4999-8999-000000000002' };
const ZONES = [
  { id: CENTRO, name: 'Centro', slug: 'centro', cityId: TEST_LOCALITY.id },
  { id: UNCAS, name: 'Uncas', slug: 'uncas', cityId: TEST_LOCALITY.id },
];

function own(overrides: Partial<OwnProfessional> = {}): OwnProfessional {
  return {
    id: PROFILE_ID,
    firstName: 'Profesional',
    lastName: 'de prueba 1',
    displayName: 'Profesional de prueba 1',
    avatarUrl: null,
    headline: 'Plomero en Tandil',
    bio: 'Trabajo prolijo.',
    yearsExperience: 5,
    availableToday: false,
    averageResponseMinutes: null,
    averageRating: null,
    reviewsCount: 0,
    completedJobsCount: 0,
    services: [{ id: PLOMERIA, name: 'Plomería', slug: 'plomeria' }],
    coversEntireCity: true,
    zones: [],
    primaryLocality: TANDIL_REF,
    coverage: [{ locality: TANDIL_REF, coversEntireCity: true, zones: [] }],
    verifications: { identity: false, phone: false, license: false, licenses: [] },
    pro: false,
    status: 'ACTIVE',
    offeredServices: [
      {
        id: PLOMERIA,
        name: 'Plomería',
        slug: 'plomeria',
        requiresLicense: false,
        licenseStatus: 'NOT_REQUIRED',
        public: true,
      },
      {
        id: GAS,
        name: 'Gas',
        slug: 'gas',
        requiresLicense: true,
        licenseStatus: 'NOT_SUBMITTED',
        public: true,
      },
    ],
    savedZones: [{ id: UNCAS, name: 'Uncas', slug: 'uncas' }],
    planTier: 'FREE',
    quoteUsage: { used: 0, limit: 5, remaining: 5 },
    plan: {
      tier: 'FREE',
      expiresAt: null,
      entitlements: {
        canSendUnlimitedQuotes: false,
        canBeFeatured: false,
        canUseAdvancedAnalytics: false,
        canSeeExposureAnalytics: false,
        canUseQuoteTemplates: false,
        portfolioPhotoLimit: 5,
      },
    },
    verificationRequests: [],
    featured: { eligible: false, reason: 'NOT_PRO' },
    proInterestAt: null,
    ...overrides,
  };
}

@Component({ template: '' })
class Blank {}

const flush = () => new Promise((r) => setTimeout(r));

async function open(profile = own(), workPhotos: WorkPhoto[] = []) {
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
  http
    .expectOne(`${API}/categories`)
    .flush([{ id: 'cat', name: 'Hogar', slug: 'hogar', services: [] }]);
  http
    .expectOne((r) => r.url === `${API}/services`)
    .flush([
      {
        id: PLOMERIA,
        name: 'Plomería',
        slug: 'plomeria',
        categoryId: 'cat',
        requiresLicense: false,
      },
      { id: GAS, name: 'Gas', slug: 'gas', categoryId: 'cat', requiresLicense: true },
    ]);
  fixture.detectChanges();
  // "Trabajos realizados" carga sus fotos al mostrarse.
  const photoLimit = profile.planTier === 'PRO' ? 20 : 5;
  http.expectOne(`${API}/pro/profile/work-photos`).flush({
    items: workPhotos,
    max: photoLimit,
    activeCount: workPhotos.filter((p) => !p.archivedByPlan).length,
    maxStored: 20,
    maxBytes: 8 * 1024 * 1024,
  });
  await flush();
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const click = (label: string | RegExp, root: ParentNode = el) => {
    const b = [...root.querySelectorAll<HTMLButtonElement>('button')].find((x) =>
      typeof label === 'string'
        ? x.textContent?.trim() === label || x.getAttribute('aria-label') === label
        : label.test(x.textContent ?? ''),
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
  it('el CTA de referidos abre la edición correcta sin reabrirla al cancelar', async () => {
    const { el, fixture, click } = await open();
    await TestBed.inject(Router).navigateByUrl('/pro/perfil?editar=services');
    await flush();
    fixture.detectChanges();
    expect(el.querySelector('[aria-labelledby="sec-services"] form')).not.toBeNull();
    expect(el.querySelector('[aria-labelledby="sec-coverage"] form')).toBeNull();
    click('Cancelar', el.querySelector('[aria-labelledby="sec-services"]')!);
    await flush();
    fixture.detectChanges();
    expect(el.querySelector('[aria-labelledby="sec-services"] form')).toBeNull();
  });
  it('carga el perfil real por secciones, sin datos demo', async () => {
    const { el } = await open();
    const text = el.textContent ?? '';
    expect(text).toContain('Mi perfil profesional');
    expect(text).toContain('Profesional de prueba 1');
    expect(text).toContain('Plomero en Tandil');
    for (const title of ['Presentación', 'Servicios', 'Cobertura', 'Matrículas', 'Tu cuenta'])
      expect(text).toContain(title);
    expect(text).toContain('Todo Tandil');
    expect(text).toContain('Matrícula pendiente');
    // La matrícula es opcional: Gas sin verificar sigue activo en búsquedas.
    expect(text).not.toContain('No aparecés en búsquedas de Gas');
    expect(el.querySelector(`a[href="/profesional/${PROFILE_ID}"]`)?.textContent).toContain(
      'Ver mi perfil público',
    );
    expect(el.querySelector('[data-testid="own-avatar"]')?.className).toContain('size-20');
    expect(el.querySelector('[data-testid="presence-state"]')?.textContent).toContain(
      'Visible en búsquedas',
    );
    const shown = el.querySelector('[data-testid="profile-share-url"]')?.textContent ?? '';
    expect(shown.endsWith(`/profesional/${PROFILE_ID}`)).toBe(true);
    expect(shown).not.toMatch(/^https?:|\?src=/);
    expect(el.querySelector('header')?.className).not.toContain('border-l');
    expect(el.querySelector('header .font-sans')?.textContent).toContain('Profesional de prueba 1');
    expect(el.querySelector('header')?.textContent).toContain('5 años');
    expect(text).not.toMatch(/Juan Martín|85%|Electricista matriculado|N\.º 4\.218|Portfolio/);
  });

  it('la barra de compartir separa Copiar, Compartir y Ver QR sin botón relleno, y confirma la copia en el botón', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const { el, fixture, click } = await open();
    const bar = el.querySelector('header')!;
    const labels = [...bar.querySelectorAll('app-profile-share button')].map((b) =>
      b.textContent?.trim(),
    );
    expect(labels).toEqual(['Copiar enlace', 'Compartir', 'Ver QR']);
    const copy = [...bar.querySelectorAll('button')].find((b) =>
      /Copiar enlace/.test(b.textContent ?? ''),
    )!;
    expect(copy.className).toContain('button-secondary');
    expect(bar.querySelector('.button-primary')).toBeNull();
    click('Copiar enlace', bar);
    await flush();
    fixture.detectChanges();
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('?src=share'));
    expect(copy.textContent?.trim()).toBe('Copiado');
    expect(bar.querySelector('[role="status"]')?.textContent).toContain('Enlace copiado.');
  });

  it('estado completo: un solo título, sin checklist, y sugiere fotos si no hay trabajos', async () => {
    const { el, fixture } = await open();
    const status = el.querySelector('[data-testid="profile-status"]')!;
    expect(status.querySelector('h2')?.textContent?.trim()).toBe('Perfil visible y completo');
    expect(el.querySelector('[data-testid="profile-missing"]')).toBeNull();
    expect(el.textContent).not.toContain('Disponibilidad');
    const tip = el.querySelector('[data-testid="profile-suggestion"]')!;
    expect(tip.textContent).toContain('Todavía no mostrás trabajos realizados.');
    const target = el.querySelector<HTMLElement>('#profile-portfolio')!;
    target.scrollIntoView = vi.fn();
    tip.querySelector('button')!.click();
    fixture.detectChanges();
    expect(target.scrollIntoView).toHaveBeenCalled();
  });

  it('con fotos de trabajos no sugiere nada', async () => {
    const photo: WorkPhoto = {
      id: 'w1',
      url: 'https://res.cloudinary.com/demo/image/upload/w1.jpg',
      caption: null,
      sortOrder: 0,
      archivedByPlan: false,
    };
    const { el } = await open(own(), [photo]);
    expect(el.querySelector('[data-testid="profile-suggestion"]')).toBeNull();
  });

  it('si falta algo, lo lista en el estado y cada ítem abre su sección', async () => {
    const { el, click, http } = await open(
      own({ bio: '', coversEntireCity: false, zones: [], primaryLocality: null, coverage: [], savedCoverage: [] }),
    );
    const status = el.querySelector('[data-testid="profile-status"]')!;
    expect(status.querySelector('h2')?.textContent?.trim()).toBe('Perfil visible');
    const missing = el.querySelector('[data-testid="profile-missing"]')!;
    const items = [...missing.querySelectorAll('button')].map((b) => b.textContent?.trim());
    expect(items).toEqual(['Presentación', 'Dónde trabajás']);
    expect(el.querySelector('[data-testid="profile-suggestion"]')).toBeNull();
    click('Dónde trabajás', missing);
    expect(el.querySelector('[aria-labelledby="sec-coverage"] form')).not.toBeNull();
    // Sin localidades todavía: se elige la ciudad principal (nunca se asume una).
    expect(el.querySelector('[aria-labelledby="sec-coverage"]')?.textContent).toContain('Empezá por tu ciudad principal');
    http.verify();
  });

  it('reseñas de invitados van al costado, en versión compacta y destacada', async () => {
    const { el } = await open();
    const aside = el.querySelector('aside')!;
    expect(aside.querySelector('app-review-invite')).not.toBeNull();
    expect(aside.querySelector('[data-testid="review-invite-whatsapp"]')?.className).toContain(
      'button-primary',
    );
    expect(el.querySelectorAll('app-review-invite').length).toBe(1);
  });

  it('las matrículas se muestran dentro de Servicios', async () => {
    const { el } = await open();
    const services = el.querySelector('#profile-services')!;
    expect(services.querySelector('[data-testid="profile-licenses"]')?.textContent).toContain(
      'Matrículas',
    );
  });

  it('sin servicios con matrícula, una sola línea en Servicios', async () => {
    const base = own();
    const { el } = await open(own({ offeredServices: [base.offeredServices[0]] }));
    expect(
      el.querySelector('#profile-services [data-testid="profile-no-license"]')?.textContent,
    ).toContain('Ninguno de tus servicios tiene matrícula para verificar.');
  });

  it('los atajos llevan a cada sección', async () => {
    const { el, fixture } = await open();
    const nav = el.querySelector('nav[aria-label="Secciones del perfil"]')!;
    expect([...nav.querySelectorAll('button')].map((b) => b.textContent?.trim())).toEqual([
      'Presentación',
      'Trabajos',
      'Servicios',
      'Cobertura',
    ]);
    const target = el.querySelector<HTMLElement>('#profile-services')!;
    target.scrollIntoView = vi.fn();
    nav.querySelectorAll('button')[2].click();
    fixture.detectChanges();
    expect(target.scrollIntoView).toHaveBeenCalled();
  });

  it('edita la presentación y guarda solo esa sección', async () => {
    const { http, fixture, el, click } = await open();
    click('Editar presentación');
    const headline = el.querySelector<HTMLInputElement>('#pp-headline')!;
    headline.value = 'Plomero y gasista en Tandil';
    headline.dispatchEvent(new Event('input'));
    click('Guardar');
    const req = http.expectOne({ method: 'PATCH', url: `${API}/pro/profile` });
    expect(req.request.body).toEqual({
      headline: 'Plomero y gasista en Tandil',
      bio: 'Trabajo prolijo.',
      yearsExperience: 5,
    });
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
    http
      .expectOne(`${API}/pro/profile`)
      .flush({ code: 'INTERNAL_ERROR' }, { status: 500, statusText: 'x' });
    await flush();
    fixture.detectChanges();
    expect(el.querySelector('#pp-headline')).not.toBeNull();
    expect(el.textContent).toContain('No pudimos guardar los cambios.');
  });

  it('servicios: quitar uno avisa que deja de aparecer y manda serviceIds reales', async () => {
    const { http, el, click } = await open();
    click('Editar servicios');
    const gas = [...el.querySelectorAll('label')]
      .find((l) => l.textContent?.includes('Gas'))!
      .querySelector('input')!;
    gas.click();
    TestBed.inject(ProStore); // noop: fuerza el ciclo
    click('Guardar');
    expect(el.textContent).toContain('Vas a dejar de aparecer en búsquedas de Gas');
    const req = http.expectOne({ method: 'PATCH', url: `${API}/pro/profile` });
    expect(req.request.body).toEqual({ serviceIds: [PLOMERIA] });
    req.flush(own());
  });

  it('cobertura: "Solo algunos barrios" restaura los barrios guardados (UUID) y "Todo Tandil" no los borra', async () => {
    const { http, fixture, el, click } = await open(
      own({ savedCoverage: [{ locality: TANDIL_REF, coversEntireCity: true, zones: [{ id: UNCAS, name: 'Uncas', slug: 'uncas' }] }] }),
    );
    click('Editar cobertura');
    http.expectOne(testNeighborhoodsUrl(API)).flush(ZONES);
    await flush();
    fixture.detectChanges();
    const radio = (name: string) =>
      [...el.querySelectorAll('label')]
        .find((l) => l.textContent?.trim() === name)!
        .querySelector('input')!;
    radio('Solo algunos barrios').click();
    fixture.detectChanges();
    // Los guardados vuelven como fichas ("Quitar Uncas") y se suma otro con el autocompletado.
    expect(el.querySelector('[aria-label="Quitar Uncas"]')).not.toBeNull();
    el.querySelector<HTMLInputElement>('input[role=combobox]')!.dispatchEvent(new Event('focus'));
    fixture.detectChanges();
    [...el.querySelectorAll<HTMLElement>('[role=option]')]
      .find((o) => o.textContent?.trim() === 'Centro')!
      .click();
    fixture.detectChanges();
    click('Guardar');
    const req = http.expectOne({ method: 'PATCH', url: `${API}/pro/profile` });
    expect(req.request.body).toEqual({
      primaryLocalityId: TEST_LOCALITY.id,
      coverage: [{ localityId: TEST_LOCALITY.id, coversEntireCity: false, zoneIds: [UNCAS, CENTRO] }],
    });
    const zones = [
      { id: CENTRO, name: 'Centro', slug: 'centro' },
      { id: UNCAS, name: 'Uncas', slug: 'uncas' },
    ];
    req.flush(
      own({
        coversEntireCity: false,
        zones,
        coverage: [{ locality: TANDIL_REF, coversEntireCity: false, zones }],
        savedCoverage: [{ locality: TANDIL_REF, coversEntireCity: false, zones }],
      }),
    );
    await flush();
    fixture.detectChanges();
    expect(el.textContent).toContain('Centro, Uncas');

    click('Editar cobertura');
    http.expectOne(testNeighborhoodsUrl(API)).flush(ZONES);
    await flush();
    fixture.detectChanges();
    radio('Todo Tandil').click();
    fixture.detectChanges();
    expect(el.textContent).toContain('Vas a aparecer en búsquedas de cualquier barrio de Tandil.');
    click('Guardar');
    // "Toda la ciudad" conserva los barrios guardados (se ignoran) para poder volver.
    expect(http.expectOne(`${API}/pro/profile`).request.body).toEqual({
      primaryLocalityId: TEST_LOCALITY.id,
      coverage: [{ localityId: TEST_LOCALITY.id, coversEntireCity: true, zoneIds: [CENTRO, UNCAS] }],
    });
  });

  it('cobertura multiciudad: suma otra localidad (sin barrios = toda la ciudad) y elige la principal', async () => {
    const { http, fixture, el, click } = await open();
    click('Editar cobertura');
    http.expectOne(testNeighborhoodsUrl(API)).flush(ZONES);
    await flush();
    fixture.detectChanges();
    click('+ Agregar otra localidad');
    // El buscador se carga diferido (@defer): se espera a que aparezca.
    for (let i = 0; i < 5 && !el.querySelector('dialog[open] input[role=combobox]'); i++) {
      await flush();
      fixture.detectChanges();
    }
    const input = el.querySelector<HTMLInputElement>('dialog[open] input[role=combobox]')!;
    input.value = 'rauch';
    input.dispatchEvent(new Event('input'));
    await new Promise((r) => setTimeout(r, 250));
    const search = http.expectOne((r) => r.url === `${API}/localities` && r.params.get('search') === 'rauch');
    search.flush({
      items: [
        {
          id: RAUCH.id,
          name: 'Rauch',
          slug: 'rauch',
          department: 'Rauch',
          province: { name: 'Buenos Aires', slug: 'buenos-aires' },
          label: 'Rauch, Buenos Aires',
          path: 'buenos-aires/rauch',
          hasProfessionals: false,
        },
      ],
    });
    fixture.detectChanges();
    [...el.querySelectorAll<HTMLElement>('dialog[open] [role=option]')].find((o) => o.textContent?.includes('Rauch'))!.click();
    fixture.detectChanges();
    // Rauch no tiene barrios cargados: se cubre la ciudad completa.
    http.expectOne(`${API}/localities/${RAUCH.id}/neighborhoods`).flush([]);
    await flush();
    fixture.detectChanges();
    expect(el.textContent).toContain('Trabajás en toda la ciudad. Vas a aparecer en búsquedas de Rauch.');
    const principal = [...el.querySelectorAll<HTMLInputElement>('input[type=radio]')].filter((r) =>
      r.closest('label')?.textContent?.includes('Ciudad principal'),
    );
    expect(principal).toHaveLength(2);
    principal[1].click();
    fixture.detectChanges();
    click('Guardar');
    expect(http.expectOne({ method: 'PATCH', url: `${API}/pro/profile` }).request.body).toEqual({
      primaryLocalityId: RAUCH.id,
      coverage: [
        { localityId: TEST_LOCALITY.id, coversEntireCity: true, zoneIds: [] },
        { localityId: RAUCH.id, coversEntireCity: true, zoneIds: [] },
      ],
    });
  });

  it('pausar pide confirmación y distingue perfil visible de "Tomo urgencias"', async () => {
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
    http
      .expectOne({ method: 'PATCH', url: `${API}/pro/availability` })
      .flush(own({ availableToday: true }));
    await flush();
    expect(store.available()).toBe(true);
    expect(store.ownProfile()?.availableToday).toBe(true);
  });

  it('los cambios se ven en el perfil público sin F5 (se invalida la caché)', async () => {
    const { http, click } = await open();
    const pros = TestBed.inject(ProfessionalsStore);
    pros.loadDetail(PROFILE_ID);
    http
      .expectOne(`${API}/professionals/${PROFILE_ID}`)
      .flush({ ...own(), workPhotos: [], reviews: [], ratingDistribution: [] });
    pros.loadDetail(PROFILE_ID);
    http.expectNone(`${API}/professionals/${PROFILE_ID}`); // cacheado
    click('Editar presentación');
    click('Guardar');
    http.expectOne(`${API}/pro/profile`).flush(own());
    await flush();
    pros.loadDetail(PROFILE_ID);
    http
      .expectOne(`${API}/professionals/${PROFILE_ID}`)
      .flush({ ...own(), workPhotos: [], reviews: [], ratingDistribution: [] });
  });
});

describe('verificaciones (UI)', () => {
  const states: [string, Partial<OwnProfessional>, string[], string | null][] = [
    [
      'sin enviar',
      {},
      ['Sin enviar', 'Es opcional: ya aparecés en este servicio.'],
      'Enviar matrícula',
    ],
    [
      'en revisión',
      {
        offeredServices: [
          {
            id: GAS,
            name: 'Gas',
            slug: 'gas',
            requiresLicense: true,
            licenseStatus: 'PENDING',
            public: true,
          },
        ],
        verificationRequests: [verification({})],
      },
      ['En revisión', 'Mat. 777', 'Hoy'],
      null,
    ],
    [
      'verificada',
      {
        offeredServices: [
          {
            id: GAS,
            name: 'Gas',
            slug: 'gas',
            requiresLicense: true,
            licenseStatus: 'VERIFIED',
            public: true,
          },
        ],
        verificationRequests: [
          verification({ status: 'VERIFIED', expiresAt: '2027-12-31T23:59:59.000Z' }),
        ],
      },
      ['Matrícula verificada', 'Esta matrícula fue revisada por Resuelve.', '31 dic 2027'],
      null,
    ],
    [
      'rechazada',
      {
        offeredServices: [
          {
            id: GAS,
            name: 'Gas',
            slug: 'gas',
            requiresLicense: true,
            licenseStatus: 'REJECTED',
            public: true,
          },
        ],
        verificationRequests: [
          verification({
            status: 'REJECTED',
            rejectionReason: 'La imagen no permite leer el número.',
          }),
        ],
      },
      ['No pudimos verificar la matrícula', 'Motivo:', 'La imagen no permite leer el número.'],
      'Volver a enviar',
    ],
    [
      'vencida',
      {
        offeredServices: [
          {
            id: GAS,
            name: 'Gas',
            slug: 'gas',
            requiresLicense: true,
            licenseStatus: 'EXPIRED',
            public: true,
          },
        ],
        verificationRequests: [verification({ status: 'EXPIRED' })],
      },
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
    const input = el.querySelector<HTMLInputElement>('input[type="file"][id^="doc-"]')!;
    expect(input.labels?.[0]?.textContent).toContain('Foto o PDF de la matrícula');
    expect(documentProblem(new File(['x'], 'a.exe', { type: 'application/x-msdownload' }))).toBe(
      LICENSE_MESSAGES.type,
    );
    expect(
      documentProblem(
        new File([new Uint8Array(11 * 1024 * 1024)], 'a.pdf', { type: 'application/pdf' }),
      ),
    ).toBe(LICENSE_MESSAGES.size);
    click('Enviar a revisión');
    await flush();
    fixture.detectChanges();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Ingresá el número');
    http.expectNone(`${API}/pro/verifications/upload`);
  });

  it('envío: firma → sube directo al almacenamiento → confirma con publicId; reenvío tras rechazo', async () => {
    const rejected = own({
      offeredServices: [
        {
          id: GAS,
          name: 'Gas',
          slug: 'gas',
          requiresLicense: true,
          licenseStatus: 'REJECTED',
          public: true,
        },
      ],
      verificationRequests: [verification({ status: 'REJECTED', rejectionReason: 'Ilegible.' })],
    });
    const { http, fixture, el, click, store } = await open(rejected);
    click('Volver a enviar');
    const ref = el.querySelector<HTMLInputElement>(`#ref-${GAS}`)!;
    expect(ref.value).toBe('Mat. 777'); // precarga la referencia anterior
    ref.value = 'Mat. N.º 4218';
    ref.dispatchEvent(new Event('input'));
    const file = new File(['%PDF-1.4'], 'matricula.pdf', { type: 'application/pdf' });
    const input = el.querySelector<HTMLInputElement>('input[type="file"][id^="doc-"]')!;
    Object.defineProperty(input, 'files', { value: [file] });
    input.dispatchEvent(new Event('change'));
    click('Enviar a revisión');

    http.expectOne({ method: 'POST', url: `${API}/pro/verifications/upload` }).flush({
      uploadUrl: 'https://upload.test/v1_1/demo/image/upload',
      fields: { public_id: PUBLIC_ID, type: 'private', signature: 'sig' },
      publicId: PUBLIC_ID,
      allowedFormats: ['pdf'],
      maxBytes: 10485760,
      expiresAt: '2026-09-26T13:00:00.000Z',
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
    expect(submit.request.body).toEqual({
      type: 'LICENSE',
      serviceId: GAS,
      reference: 'Mat. N.º 4218',
      documentPublicId: PUBLIC_ID,
    });
    submit.flush(
      own({
        offeredServices: [
          {
            id: GAS,
            name: 'Gas',
            slug: 'gas',
            requiresLicense: true,
            licenseStatus: 'PENDING',
            public: true,
          },
        ],
        verificationRequests: [
          verification({ id: 'v-2', reference: 'Mat. N.º 4218' }),
          verification({ status: 'REJECTED' }),
        ],
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
    expect(
      el.querySelector<HTMLInputElement>('input[type="file"][id^="doc-"]')?.labels?.[0]
        ?.textContent,
    ).toContain('(opcional)');
    const ref = el.querySelector<HTMLInputElement>(`#ref-${GAS}`)!;
    ref.value = 'Mat. N.º 4218';
    ref.dispatchEvent(new Event('input'));
    click('Enviar a revisión');
    http.expectNone(`${API}/pro/verifications/upload`);
    const submit = http.expectOne({ method: 'POST', url: `${API}/pro/verifications` });
    expect(submit.request.body).toEqual({
      type: 'LICENSE',
      serviceId: GAS,
      reference: 'Mat. N.º 4218',
    });
    submit.flush(
      own({
        offeredServices: [
          {
            id: GAS,
            name: 'Gas',
            slug: 'gas',
            requiresLicense: true,
            licenseStatus: 'PENDING',
            public: true,
          },
        ],
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
    const input = el.querySelector<HTMLInputElement>('input[type="file"][id^="doc-"]')!;
    Object.defineProperty(input, 'files', {
      value: [new File(['x'], 'm.png', { type: 'image/png' })],
    });
    input.dispatchEvent(new Event('change'));
    click('Enviar a revisión');
    http
      .expectOne(`${API}/pro/verifications/upload`)
      .flush({ code: 'UPLOADS_NOT_CONFIGURED' }, { status: 503, statusText: 'x' });
    await flush();
    fixture.detectChanges();
    expect(el.textContent).toContain(LICENSE_MESSAGES.unavailable);
  });
});

describe('/pro/perfil: plan', () => {
  const PRO_PLAN = {
    tier: 'PRO' as const,
    expiresAt: '2026-12-26T12:00:00.000Z',
    entitlements: {
      canSendUnlimitedQuotes: true,
      canBeFeatured: true,
      canUseAdvancedAnalytics: true,
      canSeeExposureAnalytics: true,
      canUseQuoteTemplates: false,
      portfolioPhotoLimit: 20 as const,
    },
  };

  it('Free: una sola invitación a PRO (más presencia), sin badge PRO', async () => {
    const { el } = await open();
    const section = el.querySelector('[data-testid="plan-status"]')!;
    expect(section.textContent).toContain('Hacé que tu perfil tenga más presencia.');
    expect(section.textContent).toContain(
      'Con PRO podés acceder a espacios destacados y métricas de exposición',
    );
    expect(section.querySelector('a[href="/pro/plan"]')!.textContent).toContain('Ver PRO');
    expect(el.querySelector('app-pro-badge')).toBeNull();
    expect(el.textContent).not.toContain('Perfil destacado activo');
  });

  it('PRO elegible: badge, "Perfil destacado activo" y "Ver cómo se muestra"; ningún aviso de venta', async () => {
    const { el } = await open(
      own({
        pro: true,
        planTier: 'PRO',
        plan: PRO_PLAN,
        featured: { eligible: true, reason: null },
      }),
    );
    const section = el.querySelector('[data-testid="plan-status"]')!;
    expect(section.textContent).toContain('Perfil destacado activo');
    expect(section.textContent).toContain('Resuelve PRO hasta el 26 de diciembre de 2026');
    expect(section.querySelector('a[href="/pro/plan#destacado"]')!.textContent).toContain(
      'Ver cómo se muestra',
    );
    expect(el.querySelectorAll('app-pro-badge').length).toBeGreaterThan(0);
    expect(el.textContent).not.toContain('Hacé que tu perfil tenga más presencia');
  });

  it('PRO que no cumple las reglas: no dice "destacado", explica qué falta', async () => {
    const { el } = await open(
      own({
        pro: true,
        planTier: 'PRO',
        plan: PRO_PLAN,
        featured: { eligible: false, reason: 'NO_PUBLIC_SERVICE' },
      }),
    );
    const section = el.querySelector('[data-testid="plan-status"]')!;
    expect(section.textContent).not.toContain('Perfil destacado activo');
    expect(section.textContent).toContain('Todavía no aparecés en destacados');
    expect(section.textContent).toContain('Necesitás al menos un servicio activo en Resuelve.');
  });
});

describe('foto de perfil (avatar)', () => {
  const AVATAR_ID = `resuelve/avatars/${PROFILE_ID}/abc`;
  const URL = `https://res.cloudinary.com/demo/image/upload/c_fill,g_auto,w_256,h_256,q_auto,f_auto/v2/${AVATAR_ID}`;
  const pickFile = (el: HTMLElement, file: File) => {
    const input = el.querySelector<HTMLInputElement>('#avatar-file')!;
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
  };

  it('sin foto: iniciales + "Subir foto" (input accesible); subir → firma → Cloudinary → confirma → se ve sin F5', async () => {
    const { http, fixture, el, store } = await open();
    const input = el.querySelector<HTMLInputElement>('#avatar-file')!;
    const uploadButton = [...el.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Subir foto',
    );
    expect(uploadButton).toBeTruthy();
    const pickSpy = vi.spyOn(input, 'click').mockImplementation(() => undefined);
    uploadButton!.click();
    expect(pickSpy).toHaveBeenCalled();
    expect(input.accept).toBe('image/jpeg,image/png,image/webp');
    expect(el.querySelector('[data-testid="own-avatar"] img')).toBeNull();

    const file = new File(['x'], 'yo.jpg', { type: 'image/jpeg' });
    pickFile(el, file);
    http.expectOne({ method: 'POST', url: `${API}/pro/profile/avatar/upload` }).flush({
      uploadUrl: 'https://upload.test/v1_1/demo/image/upload',
      fields: { public_id: AVATAR_ID, type: 'upload', signature: 'sig' },
      publicId: AVATAR_ID,
      allowedFormats: ['jpg', 'png', 'webp'],
      maxBytes: 5242880,
      expiresAt: '2026-09-26T13:00:00.000Z',
    });
    await flush();
    const upload = http.expectOne('https://upload.test/v1_1/demo/image/upload');
    expect((upload.request.body as FormData).get('file')).toBe(file);
    expect(upload.request.headers.has('Authorization')).toBe(false);
    fixture.detectChanges();
    expect(el.querySelector('[role="progressbar"][aria-label="Subida de la foto"]')).not.toBeNull();
    upload.flush({ public_id: AVATAR_ID });
    await flush();
    const confirm = http.expectOne({ method: 'PUT', url: `${API}/pro/profile/avatar` });
    expect(confirm.request.body).toEqual({ publicId: AVATAR_ID });
    confirm.flush(own({ avatarUrl: URL }));
    await flush();
    fixture.detectChanges();
    expect(el.querySelector<HTMLImageElement>('[data-testid="own-avatar"] img')?.src).toBe(URL);
    expect(el.querySelector('[data-testid="own-avatar"]')?.getAttribute('aria-label')).toBe(
      'Tu foto de perfil',
    );
    expect(TestBed.inject(AuthStore).user()?.avatarUrl).toBe(URL); // header y menú también
    expect(el.querySelector('button[aria-controls="avatar-menu"]')?.textContent).toContain(
      'Foto de perfil',
    ); // con foto: el botón de cámara abre "Cambiar / Eliminar"
    expect(store.avatarUpload()).toBeNull();
  });

  it('archivo inválido o pesado: aviso local y no sube nada', async () => {
    const { http, fixture, el } = await open();
    pickFile(el, new File(['x'], 'yo.gif', { type: 'image/gif' }));
    fixture.detectChanges();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('JPG, PNG o WebP');
    const big = new File(['x'], 'yo.jpg', { type: 'image/jpeg' });
    Object.defineProperty(big, 'size', { value: 6 * 1024 * 1024 });
    pickFile(el, big);
    fixture.detectChanges();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('más de 5 MB');
    http.expectNone(`${API}/pro/profile/avatar/upload`);
  });

  it('falla la subida → error con "Reintentar"', async () => {
    const { http, fixture, el, click } = await open();
    pickFile(el, new File(['x'], 'yo.png', { type: 'image/png' }));
    http.expectOne(`${API}/pro/profile/avatar/upload`).flush({
      uploadUrl: 'https://upload.test/up',
      fields: {},
      publicId: AVATAR_ID,
      allowedFormats: [],
      maxBytes: 1,
      expiresAt: '',
    });
    await flush();
    http.expectOne('https://upload.test/up').error(new ProgressEvent('network'));
    await flush();
    fixture.detectChanges();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('No pudimos subir la foto');
    click('Reintentar');
    http
      .expectOne(`${API}/pro/profile/avatar/upload`)
      .flush({ code: 'UPLOADS_NOT_CONFIGURED' }, { status: 503, statusText: 'x' });
    await flush();
    fixture.detectChanges();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('todavía no está disponible');
  });

  it('el proveedor rechaza la subida (p. ej. firma inválida) → no culpa a la conexión', async () => {
    const { http, fixture, el } = await open();
    pickFile(el, new File(['x'], 'yo.png', { type: 'image/png' }));
    http.expectOne(`${API}/pro/profile/avatar/upload`).flush({
      uploadUrl: 'https://upload.test/up',
      fields: {},
      publicId: AVATAR_ID,
      allowedFormats: [],
      maxBytes: 1,
      expiresAt: '',
    });
    await flush();
    http
      .expectOne('https://upload.test/up')
      .flush(
        { error: { message: 'Invalid Signature' } },
        { status: 401, statusText: 'Unauthorized' },
      );
    await flush();
    fixture.detectChanges();
    const alert = el.querySelector('[role="alert"]')?.textContent ?? '';
    expect(alert).toContain('rechazó la subida');
    expect(alert).not.toContain('conexión');
    http.expectNone(`${API}/pro/profile/avatar`);
  });

  it('con foto: "Eliminar foto" → vuelven las iniciales', async () => {
    const { http, fixture, el, click } = await open(own({ avatarUrl: URL }));
    TestBed.inject(AuthStore).setAvatarUrl(URL);
    fixture.detectChanges();
    expect(el.querySelector('#avatar-menu')).toBeNull();
    click('Foto de perfil');
    expect(el.querySelector('#avatar-menu')).not.toBeNull();
    click(/Eliminar foto/);
    expect(el.querySelector('#avatar-menu')).toBeNull();
    http
      .expectOne({ method: 'DELETE', url: `${API}/pro/profile/avatar` })
      .flush(own({ avatarUrl: null }));
    await flush();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="own-avatar"] img')).toBeNull();
    expect(TestBed.inject(AuthStore).user()?.avatarUrl).toBeNull();
    expect(el.textContent).toContain('Subir foto');
  });
});

describe('Mi perfil profesional — Trabajos realizados', () => {
  const WORK = `${API}/pro/profile/work-photos`;
  const photo = (i: number, caption: string | null = null): WorkPhoto => ({
    id: `00000000-0000-4000-8000-00000000000${i}`,
    url: `https://res.test/image/upload/c_limit,w_1600,h_1600,q_auto,f_auto/v1/resuelve/professional-work/p/${i}`,
    caption,
    sortOrder: i,
  });
  const list = (items: WorkPhoto[], max = 5) => ({
    items,
    max,
    activeCount: items.filter((p) => !p.archivedByPlan).length,
    maxStored: 20,
    maxBytes: 8 * 1024 * 1024,
  });
  const section = (el: HTMLElement) =>
    el.querySelector<HTMLElement>('[data-testid="work-photos-editor"]')!;
  const pick = (el: HTMLElement, file: File) => {
    const input = el.querySelector<HTMLInputElement>('[data-testid="work-file"]')!;
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
  };

  it('va justo después de Presentación; vacío: invita a subir la primera según el límite del backend', async () => {
    const { el } = await open();
    const headings = [...el.querySelectorAll('h2')].map((h) => h.textContent?.trim());
    const order = ['Presentación', 'Trabajos realizados', 'Servicios', 'Cobertura', 'Tu cuenta'];
    expect(order.map((h) => headings.indexOf(h))).toEqual(
      [...order.map((h) => headings.indexOf(h))].sort((a, b) => a - b),
    );
    expect(headings.indexOf('Trabajos realizados')).toBe(headings.indexOf('Presentación') + 1);
    expect(headings).not.toContain('Verificaciones');
    const empty = el.querySelector('[data-testid="work-empty"]')!;
    expect(empty.textContent).toContain('Mostrá algunos trabajos que hayas realizado.');
    expect(empty.textContent).toContain('Podés mostrar hasta 5 fotos activas.');
    expect(empty.querySelector('button')!.textContent).toContain('Agregar primera foto');
    expect(el.querySelector<HTMLInputElement>('[data-testid="work-file"]')!.accept).toBe(
      'image/jpeg,image/png,image/webp',
    );
  });

  it('subir: firma → Cloudinary (con progreso, sin Authorization) → confirma → "1 de 5"', async () => {
    const { http, fixture, el } = await open();
    const file = new File(['x'], 'bano.jpg', { type: 'image/jpeg' });
    pick(el, file);
    const publicId = 'resuelve/professional-work/p/nuevo';
    http.expectOne({ method: 'POST', url: `${WORK}/sign` }).flush({
      uploadUrl: 'https://upload.test/v1_1/demo/image/upload',
      fields: { public_id: publicId, signature: 'sig' },
      publicId,
      allowedFormats: ['jpg', 'png', 'webp'],
      maxBytes: 8388608,
      expiresAt: '2026-09-26T13:00:00.000Z',
    });
    await flush();
    const upload = http.expectOne('https://upload.test/v1_1/demo/image/upload');
    expect((upload.request.body as FormData).get('file')).toBe(file);
    expect(upload.request.headers.has('Authorization')).toBe(false);
    fixture.detectChanges();
    expect(section(el).querySelector('[role="progressbar"]')).not.toBeNull();
    expect(section(el).textContent).toContain('Subiendo foto…');
    upload.flush({ public_id: publicId });
    await flush();
    const confirm = http.expectOne({ method: 'POST', url: WORK });
    expect(confirm.request.body).toEqual({ publicId, caption: null });
    confirm.flush(list([photo(0)]));
    await flush();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="work-count"]')!.textContent).toContain('1 de 5');
    expect(section(el).querySelectorAll('[data-testid="work-list"] img')).toHaveLength(1);
    expect(section(el).querySelector('[role="progressbar"]')).toBeNull();
  });

  it('con 5 fotos Free: ofrece conocer PRO, sin agregar foto ni pedir firma', async () => {
    const { http, fixture, el } = await open(
      own(),
      [0, 1, 2, 3, 4].map((i) => photo(i)),
    );
    expect(el.querySelector('[data-testid="work-full"]')!.textContent).toContain(
      'Alcanzaste el límite de 5 fotos de Free. Con PRO podés mostrar hasta 20.',
    );
    expect(el.querySelector('[data-testid="work-full"] a')?.textContent).toContain('Conocer PRO');
    expect(el.querySelector('[data-testid="work-add"]')).toBeNull();
    expect(el.querySelector('[data-testid="work-count"]')!.textContent).toContain('5 de 5');
    pick(el, new File(['x'], 'sexta.jpg', { type: 'image/jpeg' }));
    fixture.detectChanges();
    http.expectNone(`${WORK}/sign`);
    expect(el.querySelector('[data-testid="work-error"]')!.textContent).toContain(
      'máximo de fotos permitidas',
    );
  });

  it('el backend rechaza la 6ª (otra pestaña) → mensaje claro y relee la lista', async () => {
    const { http, fixture, el } = await open(
      own(),
      [0, 1, 2, 3].map((i) => photo(i)),
    );
    pick(el, new File(['x'], 'quinta.jpg', { type: 'image/jpeg' }));
    http
      .expectOne(`${WORK}/sign`)
      .flush(
        { code: 'WORK_PHOTOS_LIMIT_REACHED', message: 'Ya alcanzaste el máximo de 5 fotos.' },
        { status: 409, statusText: 'Conflict' },
      );
    await flush();
    http.expectOne({ method: 'GET', url: WORK }).flush(list([0, 1, 2, 3, 4].map((i) => photo(i))));
    await flush();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="work-error"]')!.textContent).toContain(
      'máximo de fotos permitidas',
    );
    expect(el.querySelector('[data-testid="work-add"]')).toBeNull();
  });

  it('muestra archivadas guardadas y permite reactivarlas al volver a PRO', async () => {
    const archived = { ...photo(8, 'Obra anterior'), archivedByPlan: true };
    const { http, fixture, el, click } = await open(own({ planTier: 'PRO' }), [
      photo(0, 'Actual'),
      archived,
    ]);
    expect(section(el).textContent).toContain('1 foto sigue guardada y archivada por tu plan.');
    expect(section(el).textContent).toContain('Archivada por plan');
    click('Reactivar foto 2');
    const req = http.expectOne({ method: 'PATCH', url: `${WORK}/${archived.id}/restore` });
    expect(req.request.body).toEqual({});
    req.flush(list([photo(0, 'Actual'), { ...archived, archivedByPlan: false, sortOrder: 1 }], 20));
    await flush();
    fixture.detectChanges();
    expect(section(el).textContent).not.toContain('Archivada por plan');
    expect(section(el).querySelector('[data-testid="work-count"]')?.textContent).toContain(
      '2 de 20',
    );
  });

  it('archivo inválido o de más de 8 MB: aviso local, no sube nada', async () => {
    const { http, fixture, el } = await open();
    pick(el, new File(['x'], 'plano.pdf', { type: 'application/pdf' }));
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="work-error"]')!.textContent).toContain(
      'JPG, PNG o WebP',
    );
    const big = new File(['x'], 'grande.jpg', { type: 'image/jpeg' });
    Object.defineProperty(big, 'size', { value: 9 * 1024 * 1024 });
    pick(el, big);
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="work-error"]')!.textContent).toContain('8 MB');
    http.expectNone(`${WORK}/sign`);
  });

  it('borrar pide confirmación; confirmar → DELETE y la lista se actualiza', async () => {
    const { http, fixture, el, click } = await open(own(), [photo(0), photo(1)]);
    click('Borrar la foto 2');
    expect(el.textContent).toContain('¿Borrar esta foto?');
    http.expectNone((r) => r.method === 'DELETE');
    el.querySelector<HTMLButtonElement>('[data-testid="work-delete-confirm"]')!.click();
    fixture.detectChanges();
    http.expectOne({ method: 'DELETE', url: `${WORK}/${photo(1).id}` }).flush(list([photo(0)]));
    await flush();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="work-count"]')!.textContent).toContain('1 de 5');
    expect(el.textContent).not.toContain('¿Borrar esta foto?');
  });

  it('reordenar: mover la 2ª antes manda el orden completo; la primera no se puede mover antes', async () => {
    const { http, fixture, el, click } = await open(own(), [photo(0, 'A'), photo(1, 'B')]);
    const before = [...el.querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.getAttribute('aria-label') === 'Mover la foto 1 antes',
    )!;
    expect(before.disabled).toBe(true);
    click('Mover la foto 2 antes');
    const req = http.expectOne({ method: 'PUT', url: `${WORK}/order` });
    expect(req.request.body).toEqual({ ids: [photo(1).id, photo(0).id] });
    req.flush(
      list([
        { ...photo(1, 'B'), sortOrder: 0 },
        { ...photo(0, 'A'), sortOrder: 1 },
      ]),
    );
    await flush();
    fixture.detectChanges();
    expect(
      [...el.querySelectorAll('[data-testid="work-list"] img')].map((i) => i.getAttribute('alt')),
    ).toEqual(['B', 'A']);
  });

  it('descripción opcional: se edita con contador 0/80 y se guarda con PATCH; error del backend visible', async () => {
    const { http, fixture, el, click } = await open(own(), [photo(0)]);
    click('Agregar descripción de la foto 1');
    const input = el.querySelector<HTMLInputElement>(`#caption-${photo(0).id}`)!;
    expect(input.maxLength).toBe(80);
    input.value = 'Llamame 249 444 5566';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(el.textContent).toContain('20/80');
    click('Guardar');
    http
      .expectOne({ method: 'PATCH', url: `${WORK}/${photo(0).id}` })
      .flush(
        { code: 'INVALID_CAPTION', message: 'No incluyas teléfonos en la descripción.' },
        { status: 422, statusText: 'Unprocessable' },
      );
    await flush();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="work-error"]')!.textContent).toContain(
      'No incluyas teléfonos',
    );

    input.value = 'Baño completo';
    input.dispatchEvent(new Event('input'));
    click('Guardar');
    const ok = http.expectOne({ method: 'PATCH', url: `${WORK}/${photo(0).id}` });
    expect(ok.request.body).toEqual({ caption: 'Baño completo' });
    ok.flush(list([photo(0, 'Baño completo')]));
    await flush();
    fixture.detectChanges();
    expect(section(el).textContent).toContain('Baño completo');
    expect(el.querySelector(`#caption-${photo(0).id}`)).toBeNull();
  });
});
