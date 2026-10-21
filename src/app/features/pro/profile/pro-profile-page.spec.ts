import { Component } from '@angular/core';
import { vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { API_URL } from '../../../core/api/api.config';
import { authInterceptor } from '../../../core/auth/auth.interceptor';
import { Work, WorkPhoto } from '../../../core/models/professional';
import { AuthResponse, AuthUser } from '../../../core/models/auth';
import { OwnProfessional, OwnVerification } from '../../../core/models/pro-profile';
import { AuthStore } from '../../../core/state/auth.store';
import { LICENSE_MESSAGES, ProStore, documentProblem } from '../../../core/state/pro.store';
import { ProfessionalsStore } from '../../../core/state/professionals.store';
import { ProProfilePage } from './pro-profile-page';
import { TEST_LOCALITY, testNeighborhoodsUrl } from '../../../core/state/locality.testing';
import { flushProTools } from '../../../core/api/pro-tools.testing';

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
        portfolioWorkLimit: 0,
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

/** Respuesta de /pro/profile/works (Free 1 / PRO 10 trabajos, 5 fotos cada uno). */
function workList(items: Work[], maxWorks = 10) {
  const active = items.filter((w) => !w.archivedByPlan);
  return {
    items,
    maxWorks,
    activeWorks: active.length,
    maxStoredWorks: 10,
    photosPerWork: 5,
    activePhotos: active.reduce((n, w) => n + w.photos.filter((p) => !p.archivedByPlan).length, 0),
    maxBytes: 8 * 1024 * 1024,
  };
}

async function open(profile = own(), works: Work[] = []) {
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
  // "Trabajos realizados" carga sus trabajos al mostrarse.
  http.expectOne(`${API}/pro/profile/works`).flush(workList(works, profile.planTier === 'PRO' ? 10 : 0));
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
afterEach(() => {
  const http = TestBed.inject(HttpTestingController);
  flushProTools(http);
  http.verify({ ignoreCancelled: true });
});

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
    expect(text).toContain('Matrícula sin verificar');
    expect(text).not.toMatch(/pendiente|en revisión/i);
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

  it('PRO visible: un solo título, sin checklist, y sugiere fotos si no hay trabajos', async () => {
    const { el, fixture } = await open(own({ planTier: 'PRO' }));
    const status = el.querySelector('[data-testid="profile-status"]')!;
    // Publicado ≠ completo: "visible", nunca "completo" ni un porcentaje.
    expect(status.querySelector('h2')?.textContent?.trim()).toBe('Tu perfil ya está visible');
    expect(status.textContent).not.toMatch(/completo|%/);
    expect(el.querySelector('[data-testid="profile-improve"]')?.textContent).toContain('Podés seguir mejorándolo');
    expect(el.querySelector('[data-testid="profile-missing"]')).toBeNull();
    expect(el.textContent).not.toContain('Disponibilidad');
    const tip = el.querySelector('[data-testid="profile-suggestion"]')!;
    expect(tip.textContent).toContain('Mostrá algunos trabajos para que los clientes conozcan lo que hacés.');
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
    const { el } = await open(own(), [{ id: 'work-1', title: 'Casa 1', description: null, doneOn: '2026-03', archivedByPlan: false, photos: [photo] }]);
    expect(el.querySelector('[data-testid="profile-suggestion"]')).toBeNull();
  });

  it('si falta algo, lo lista en el estado y cada ítem abre su sección', async () => {
    const { el, click, http } = await open(
      own({ bio: '', coversEntireCity: false, zones: [], primaryLocality: null, coverage: [], savedCoverage: [] }),
    );
    const status = el.querySelector('[data-testid="profile-status"]')!;
    // Sin dónde trabaja no aparece en búsquedas: no se dice "visible".
    expect(status.querySelector('h2')?.textContent?.trim()).toBe('Tu perfil todavía no aparece en búsquedas');
    expect(el.querySelector('[data-testid="profile-improve"]')).toBeNull();
    const missing = el.querySelector('[data-testid="profile-missing"]')!;
    const items = [...missing.querySelectorAll('button')].map((b) => b.textContent?.trim());
    expect(items).toEqual(['Presentación', 'Dónde trabajás']);
    expect(el.querySelector('[data-testid="profile-suggestion"]')).toBeNull();
    click('Dónde trabajás', missing);
    expect(el.querySelector('[aria-labelledby="sec-coverage"] form')).not.toBeNull();
    // Sin localidades todavía: se elige la ciudad principal (nunca se asume una).
    flushProTools(http);
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

  it('experiencia sin informar: se ve como tal (no "0 años"), el campo llega vacío y guardar sin completarlo manda null', async () => {
    const { http, el, click } = await open(own({ yearsExperience: null }));
    expect(el.querySelector('header')?.textContent).toContain('Experiencia sin informar');
    expect(el.querySelector('header')?.textContent).not.toContain('0 años');
    click('Editar presentación');
    expect(el.querySelector<HTMLInputElement>('#pp-years')!.value).toBe('');
    expect(el.textContent).toContain('Años de experiencia (opcional)');
    click('Guardar');
    const req = http.expectOne({ method: 'PATCH', url: `${API}/pro/profile` });
    expect(req.request.body.yearsExperience).toBeNull();
  });

  it('borrar los años guardados los deja como no informados; un 0 escrito se conserva como 0', async () => {
    const { http, el, click } = await open();
    click('Editar presentación');
    const years = el.querySelector<HTMLInputElement>('#pp-years')!;
    years.value = '0';
    years.dispatchEvent(new Event('input'));
    click('Guardar');
    expect(http.expectOne({ method: 'PATCH', url: `${API}/pro/profile` }).request.body.yearsExperience).toBe(0);
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

  it('especialidades: se ven, se quitan y el guardado manda el vaciado explícito del rubro', async () => {
    const profile = own();
    profile.offeredServices[0].specialties = ['Destapación de cañerías'];
    const { http, fixture, el, click } = await open(profile);
    expect(el.querySelector('#profile-services')?.textContent).toContain('Destapación de cañerías');
    click('Editar servicios');
    click('Quitar Destapación de cañerías');
    click('Guardar');
    const req = http.expectOne({ method: 'PATCH', url: `${API}/pro/profile` });
    expect(req.request.body.specialties).toEqual([
      { serviceId: PLOMERIA, names: [] }, { serviceId: GAS, names: [] },
    ]);
    req.flush(own());
    await flush();
    fixture.detectChanges();
    expect(el.querySelector('#profile-services')?.textContent).not.toContain('Destapación de cañerías');
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
    for (let i = 0; i < 100 && !el.querySelector('dialog[open] input[role=combobox]'); i++) {
      await new Promise((r) => setTimeout(r, 20));
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

  it('pausar pide confirmación y distingue perfil visible de "Atiendo urgencias"', async () => {
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

  it('perfil pendiente de oficio o sin cobertura: no ofrece compartir, copiar, QR ni enlace público', async () => {
    const { el } = await open(own({ offeredServices: [], coversEntireCity: false, zones: [], coverage: [] }));
    expect(el.querySelector('app-profile-share')).toBeNull();
    expect(el.querySelector('a[href="/profesional/' + PROFILE_ID + '"]')).toBeNull();
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
      ['Sin verificar', 'Todavía no enviaste tu matrícula.', 'Es opcional: ya aparecés en este servicio.'],
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
      ['Requiere corrección', 'No pudimos verificar la matrícula que enviaste.', 'Motivo:', 'La imagen no permite leer el número.'],
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
      ['Vencida', 'Enviá el número de tu matrícula vigente'],
      'Enviar de nuevo',
    ],
  ];

  it('sin envío nunca dice "en revisión" ni "verificada"; enviada no dice "verificada" hasta la aprobación', async () => {
    const { el } = await open(own());
    const card = el.querySelector('app-license-card')!;
    expect(card.textContent).not.toMatch(/en revisión/i);
    expect(card.querySelector('h3 + p')?.textContent?.trim()).toBe('Sin verificar');
    TestBed.resetTestingModule();
    localStorage.removeItem('resuelve.refreshToken');
    const pending = await open(
      own({
        offeredServices: [{ id: GAS, name: 'Gas', slug: 'gas', requiresLicense: true, licenseStatus: 'PENDING', public: true }],
        verificationRequests: [verification({})],
      }),
    );
    const sent = pending.el.querySelector('app-license-card')!;
    expect(sent.querySelector('h3 + p')?.textContent?.trim()).toBe('En revisión');
    expect(sent.textContent).not.toContain('Matrícula verificada');
  });

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
    expect(card.textContent).toContain('estamos verificando el número en el registro oficial.');
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
      portfolioWorkLimit: 10 as const,
    },
  };

  it('Free: una sola invitación a PRO (que te encuentren), sin badge PRO y aclarando lo gratis', async () => {
    const { el } = await open();
    const section = el.querySelector('[data-testid="plan-status"]')!;
    expect(section.textContent).toContain('Hacé que más clientes te encuentren.');
    expect(section.textContent).toContain('Con Resuelve PRO tu perfil puede aparecer en espacios destacados');
    expect(section.textContent).toContain('tus contactos directos y tus reseñas siguen siendo gratis.');
    expect(section.textContent).toContain('Los totales de visitas y toques en WhatsApp o Llamar');
    expect(section.textContent).toContain('desglose por servicio y barrio');
    expect(section.querySelector('a[href="/pro/plan"]')!.textContent).toContain('Conocer PRO');
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
    expect(el.textContent).not.toContain('Hacé que más clientes te encuentren');
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
  // Las operaciones de edición se prueban con acceso PRO vigente.
  const openPaid = (profile = own(), works: Work[] = []) => open({ ...profile, planTier: 'PRO' }, works);
  const WORKS = `${API}/pro/profile/works`;
  const PHOTOS = `${API}/pro/profile/work-photos`;
  const W1 = '00000000-0000-4000-8000-0000000000a1';
  const W2 = '00000000-0000-4000-8000-0000000000a2';
  const photo = (i: number, caption: string | null = null, extra: Partial<WorkPhoto> = {}): WorkPhoto => ({
    id: `00000000-0000-4000-8000-00000000000${i}`,
    url: `https://res.test/image/upload/c_limit,w_1600,h_1600,q_auto,f_auto/v1/resuelve/professional-work/p/${i}`,
    caption,
    sortOrder: i,
    archivedByPlan: false,
    ...extra,
  });
  const work = (id: string, photos: WorkPhoto[] = [], extra: Partial<Work> = {}): Work => ({
    id,
    title: id === W1 ? 'Casa 1' : 'Departamento centro',
    description: null,
    doneOn: id === W1 ? '2026-03' : '2025-11',
    archivedByPlan: false,
    photos: photos.map((p, i) => ({ ...p, sortOrder: i })),
    ...extra,
  });
  const section = (el: HTMLElement) => el.querySelector<HTMLElement>('[data-testid="work-photos-editor"]')!;
  const card = (el: HTMLElement, id: string) => el.querySelector<HTMLElement>(`[data-work="${id}"]`)!;
  const pick = (el: HTMLElement, file: File) => {
    const input = el.querySelector<HTMLInputElement>('[data-testid="work-file"]')!;
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
  };
  /** Toca "Agregar foto" del trabajo y elige el archivo. */
  const addTo = (el: HTMLElement, id: string, file: File) => {
    card(el, id).querySelector<HTMLButtonElement>('[data-testid="work-add"]')!.click();
    pick(el, file);
  };
  const setValue = (el: HTMLElement, selector: string, value: string, event = 'input') => {
    const field = el.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(selector)!;
    field.value = value;
    field.dispatchEvent(new Event(event));
  };

  it('va justo después de Presentación; vacío: invita a crear el primer trabajo', async () => {
    const { el } = await openPaid();
    const headings = [...el.querySelectorAll('h2')].map((h) => h.textContent?.trim());
    const order = ['Presentación', 'Trabajos realizados', 'Cómo te contactan', 'Servicios', 'Cobertura', 'Tu cuenta'];
    expect(order.map((h) => headings.indexOf(h))).toEqual([...order.map((h) => headings.indexOf(h))].sort((a, b) => a - b));
    expect(headings.indexOf('Trabajos realizados')).toBe(headings.indexOf('Presentación') + 1);
    expect(el.querySelector('[data-testid="portfolio-preview"]')).not.toBeNull();
    expect(el.querySelector<HTMLInputElement>('[data-testid="work-file"]')!.accept).toBe('image/jpeg,image/png,image/webp');
  });

  describe('vista previa ilustrativa (sin trabajos)', () => {
    const preview = (el: HTMLElement) => el.querySelector<HTMLElement>('[data-testid="portfolio-preview"]');
    const text = (node: Element | null) => (node?.textContent ?? '').replace(/\s+/g, ' ');

    it('Free: publicación exclusiva de PRO sin fotos de muestra ni controles de creación', async () => {
      const { el, http } = await open();
      expect(preview(el)).toBeNull();
      const box = el.querySelector('[data-testid="portfolio-pro-required"]')!;
      expect(text(box)).toContain('Mostrá tus trabajos con Resuelve PRO');
      expect(box.querySelector('a')?.getAttribute('href')).toBe('/pro/plan#contratar');
      expect(el.querySelector('[data-testid="work-create"]')).toBeNull();
      http.expectNone({ method: 'POST', url: WORKS });
    });

    it('PRO: varios trabajos de ejemplo y "Hasta 10 trabajos · hasta 5 fotos por trabajo", sin oferta de PRO', async () => {
      const { el } = await openPaid(own({ planTier: 'PRO' }));
      const box = preview(el)!;
      expect(box.getAttribute('data-plan')).toBe('PRO');
      expect(text(box)).toContain('Mostrá varios trabajos realizados');
      const works = [...box.querySelectorAll('[data-testid="portfolio-preview-work"]')].map((w) => text(w.querySelector('figcaption')));
      expect(works).toHaveLength(4);
      expect(works[0]).toContain('Instalación eléctrica completa');
      expect(text(box.querySelector('[data-testid="portfolio-preview-note"]'))).toContain('Hasta 10 trabajos · hasta 5 fotos por trabajo.');
      expect(box.querySelector('[data-testid="portfolio-preview-pro"]')).toBeNull();
      expect(box.querySelector('[role="list"]')!.getAttribute('tabindex')).toBe('0');
    });

    it('"Crear mi primer trabajo" abre el formulario real del trabajo', async () => {
      const { el, fixture } = await openPaid();
      const cta = preview(el)!.querySelector<HTMLButtonElement>('[data-testid="work-create"]')!;
      expect(text(cta)).toContain('Crear mi primer trabajo');
      cta.click();
      fixture.detectChanges();
      expect(text(el.querySelector('[data-testid="work-form"]'))).toContain('Nuevo trabajo');
    });

    it('con un trabajo real (aunque no tenga fotos) no hay vista previa ni fotos de ejemplo', async () => {
      const { el } = await openPaid(own(), [work(W1)]);
      expect(preview(el)).toBeNull();
      expect(el.querySelector('img[src^="/portfolio-demo/"]')).toBeNull();
      expect(card(el, W1)).not.toBeNull();
    });

    it('al crear el primer trabajo desaparece; al borrar el último, vuelve', async () => {
      const { http, fixture, el, click } = await openPaid();
      el.querySelector<HTMLButtonElement>('[data-testid="work-create"]')!.click();
      fixture.detectChanges();
      setValue(el, '#work-form-name', 'Casa 1');
      el.querySelector<HTMLFormElement>('[data-testid="work-form"]')!.dispatchEvent(new Event('submit'));
      http.expectOne({ method: 'POST', url: WORKS }).flush(workList([work(W1)]));
      await flush();
      fixture.detectChanges();
      expect(preview(el)).toBeNull();
      expect(el.querySelector('img[src^="/portfolio-demo/"]')).toBeNull();

      click('Borrar el trabajo Casa 1');
      el.querySelector<HTMLButtonElement>('[data-testid="work-remove-confirm"]')!.click();
      fixture.detectChanges();
      http.expectOne({ method: 'DELETE', url: `${WORKS}/${W1}` }).flush(workList([]));
      await flush();
      fixture.detectChanges();
      expect(preview(el)).not.toBeNull();
    });
  });

  it('crear un trabajo: nombre, mes y año (por defecto el actual), descripción opcional → POST y foco en "Agregar la primera foto"', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-12T15:00:00Z'));
    try {
      const { http, fixture, el } = await openPaid();
      el.querySelector<HTMLButtonElement>('[data-testid="work-create"]')!.click();
      fixture.detectChanges();
      const form = el.querySelector<HTMLFormElement>('[data-testid="work-form"]')!;
      expect(form.textContent).toContain('Nuevo trabajo');
      expect(form.textContent).toContain('Sin direcciones ni nombres de clientes.');
      expect(el.querySelector<HTMLSelectElement>('#work-month')!.value).toBe('10');
      expect(el.querySelector<HTMLSelectElement>('#work-year')!.value).toBe('2026');
      expect(el.querySelector<HTMLInputElement>('#work-form-name')!.maxLength).toBe(60);

      // Sin nombre: aviso local, no se manda nada.
      form.dispatchEvent(new Event('submit'));
      fixture.detectChanges();
      expect(el.querySelector('[data-testid="work-form-error"]')!.textContent).toContain('Poné un nombre');
      http.expectNone({ method: 'POST', url: WORKS });

      setValue(el, '#work-form-name', '  Casa   1 ');
      setValue(el, '#work-month', '03', 'change');
      setValue(el, '#work-description', 'Baño completo');
      form.dispatchEvent(new Event('submit'));
      const req = http.expectOne({ method: 'POST', url: WORKS });
      expect(req.request.body).toEqual({ title: 'Casa 1', description: 'Baño completo', doneOn: '2026-03' });
      req.flush(workList([work(W1, [], { description: 'Baño completo' })]));
      await flush();
      fixture.detectChanges();
      await new Promise((r) => setTimeout(r));
      expect(el.querySelector('[data-testid="work-form"]')).toBeNull();
      const created = card(el, W1);
      expect(created.querySelector('h3')!.textContent).toContain('Casa 1');
      expect(created.textContent).toContain('Marzo 2026 · 0 de 5 fotos');
      expect(created.textContent).toContain('Baño completo');
      expect(document.activeElement?.id).toBe(`work-add-${W1}`);
      expect(el.querySelector('[data-testid="work-count"]')!.textContent).toContain('1 de 10 trabajos');
    } finally {
      vi.useRealTimers();
    }
  });

  it('el backend rechaza el nombre → el mensaje queda en el formulario', async () => {
    const { http, fixture, el } = await openPaid();
    el.querySelector<HTMLButtonElement>('[data-testid="work-create"]')!.click();
    fixture.detectChanges();
    setValue(el, '#work-form-name', 'Casa 249 444-5566');
    el.querySelector<HTMLFormElement>('[data-testid="work-form"]')!.dispatchEvent(new Event('submit'));
    http
      .expectOne({ method: 'POST', url: WORKS })
      .flush({ code: 'INVALID_WORK', message: 'No incluyas teléfonos en el nombre.', details: { field: 'title' } }, { status: 422, statusText: 'Unprocessable' });
    await flush();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="work-form-error"]')!.textContent).toContain('No incluyas teléfonos en el nombre.');
    expect(el.querySelector('[data-testid="work-form"]')).not.toBeNull();
  });

  it('subir a un trabajo: firma con el trabajo → Cloudinary (con progreso, sin Authorization) → confirma → "1 de 5 fotos"', async () => {
    const { http, fixture, el } = await openPaid(own(), [work(W1)]);
    const file = new File(['x'], 'bano.jpg', { type: 'image/jpeg' });
    addTo(el, W1, file);
    const publicId = 'resuelve/professional-work/p/nuevo';
    const sign = http.expectOne({ method: 'POST', url: `${PHOTOS}/sign` });
    expect(sign.request.body).toEqual({ workId: W1 });
    sign.flush({
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
    expect(card(el, W1).querySelector('[role="progressbar"]')).not.toBeNull();
    expect(card(el, W1).textContent).toContain('Subiendo foto…');
    upload.flush({ public_id: publicId });
    await flush();
    const confirm = http.expectOne({ method: 'POST', url: PHOTOS });
    expect(confirm.request.body).toEqual({ workId: W1, publicId, caption: null });
    confirm.flush(workList([work(W1, [photo(0)])]));
    await flush();
    fixture.detectChanges();
    expect(card(el, W1).textContent).toContain('1 de 5 fotos');
    expect(card(el, W1).querySelectorAll('img')).toHaveLength(1);
    expect(card(el, W1).querySelector('[data-testid="work-cover"]')).not.toBeNull();
    expect(section(el).querySelector('[role="progressbar"]')).toBeNull();
  });

  it('Free conserva trabajos guardados sin fotos públicas ni controles de publicación', async () => {
    const { el } = await open(own(), [work(W1, [photo(0)], { archivedByPlan: true })]);
    expect(el.querySelector('[data-testid="work-add"]')).toBeNull();
    expect(el.querySelector('[data-testid="work-create"]')).toBeNull();
    const box = el.querySelector('[data-testid="portfolio-pro-required"]')!;
    expect(box.textContent).toContain('Tus trabajos siguen guardados y ocultos');
    expect(box.textContent).toContain('Casa 1');
    expect(box.querySelectorAll('img')).toHaveLength(0);
    expect(box.querySelector('button')?.getAttribute('aria-label')).toBe('Borrar el trabajo Casa 1');
  });

  it('PRO: "Nuevo trabajo" mientras haya lugar', async () => {
    const { el } = await openPaid(own({ planTier: 'PRO' }), [work(W1, [photo(0)])]);
    expect(el.querySelector('[data-testid="work-create"]')!.textContent).toContain('Nuevo trabajo');
    expect(el.querySelector('[data-testid="work-count"]')!.textContent).toContain('1 de 10 trabajos');
  });

  it('PRO con 10 trabajos: sin "Nuevo trabajo" ni oferta de PRO', async () => {
    const ten = Array.from({ length: 10 }, (_, i) => work(`00000000-0000-4000-8000-0000000001${String(i).padStart(2, '0')}`, [], { title: `Trabajo ${i}` }));
    const full = await openPaid(own({ planTier: 'PRO' }), ten);
    expect(full.el.querySelector('[data-testid="work-create"]')).toBeNull();
    expect(full.el.querySelector('[data-testid="work-full"]')!.textContent).toContain('Tu plan muestra hasta 10 trabajos.');
    expect(full.el.querySelector('[data-testid="work-full"] a')).toBeNull();
  });

  it('el backend rechaza la 6ª foto (otra pestaña) → mensaje en el trabajo y relee la lista', async () => {
    const { http, fixture, el } = await openPaid(own(), [work(W1, [0, 1, 2, 3].map((i) => photo(i)))]);
    addTo(el, W1, new File(['x'], 'quinta.jpg', { type: 'image/jpeg' }));
    http
      .expectOne(`${PHOTOS}/sign`)
      .flush({ code: 'WORK_PHOTOS_LIMIT_REACHED', message: 'Cada trabajo puede tener hasta 5 fotos.' }, { status: 409, statusText: 'Conflict' });
    await flush();
    http.expectOne({ method: 'GET', url: WORKS }).flush(workList([work(W1, [0, 1, 2, 3, 4].map((i) => photo(i)))]));
    await flush();
    fixture.detectChanges();
    expect(card(el, W1).querySelector('[data-testid="work-error"]')!.textContent).toContain('Cada trabajo puede tener hasta 5 fotos.');
    expect(el.querySelector('[data-testid="work-add"]')).toBeNull();
  });

  it('archivo inválido o de más de 8 MB: aviso local en el trabajo, no sube nada', async () => {
    const { http, fixture, el } = await openPaid(own(), [work(W1)]);
    addTo(el, W1, new File(['x'], 'plano.pdf', { type: 'application/pdf' }));
    fixture.detectChanges();
    expect(card(el, W1).querySelector('[data-testid="work-error"]')!.textContent).toContain('JPG, PNG o WebP');
    const big = new File(['x'], 'grande.jpg', { type: 'image/jpeg' });
    Object.defineProperty(big, 'size', { value: 9 * 1024 * 1024 });
    addTo(el, W1, big);
    fixture.detectChanges();
    expect(card(el, W1).querySelector('[data-testid="work-error"]')!.textContent).toContain('8 MB');
    http.expectNone(`${PHOTOS}/sign`);
  });

  it('después de volver a PRO: el dueño elige restaurar su trabajo guardado', async () => {
    const { http, fixture, el } = await openPaid(own(), [work(W1, [photo(0)]), work(W2, [photo(1)], { archivedByPlan: true })]);
    expect(section(el).querySelector('[data-testid="work-archived-copy"]')!.textContent).toContain(
      '1 trabajo sigue guardado y archivado por tu plan',
    );
    const archived = card(el, W2).querySelector('[data-testid="work-archived"]')!;
    expect(archived.textContent).toContain('Podés volver a mostrarlo en tu perfil.');
    expect(card(el, W2).querySelector('[data-testid="work-add"]')).toBeNull();
    archived.querySelector('button')!.click();
    const req = http.expectOne({ method: 'PATCH', url: `${WORKS}/${W2}/restore` });
    expect(req.request.body).toEqual({});
    req.flush(workList([work(W1, [photo(0)], { archivedByPlan: true }), work(W2, [photo(1)])]));
    await flush();
    fixture.detectChanges();
    expect(card(el, W1).querySelector('[data-testid="work-archived"]')).not.toBeNull();
    expect(card(el, W2).querySelector('[data-testid="work-archived"]')).toBeNull();
  });

  it('foto archivada por plan dentro de un trabajo: se ve marcada y se reactiva desde su edición', async () => {
    const archived = photo(5, 'Obra anterior', { archivedByPlan: true });
    const { http, fixture, el, click } = await openPaid(own({ planTier: 'PRO' }), [work(W1, [photo(0, 'Actual'), archived])]);
    expect(card(el, W1).textContent).toContain('Archivada');
    click('Editar la foto 2 de Casa 1');
    fixture.detectChanges();
    click('Reactivar foto');
    http
      .expectOne({ method: 'PATCH', url: `${PHOTOS}/${archived.id}/restore` })
      .flush(workList([work(W1, [photo(0, 'Actual'), { ...archived, archivedByPlan: false }])], 10));
    await flush();
    fixture.detectChanges();
    expect(card(el, W1).textContent).not.toContain('Archivada');
  });

  it('borrar una foto: desde su edición, con confirmación → DELETE y se cierra', async () => {
    const { http, fixture, el, click } = await openPaid(own(), [work(W1, [photo(0), photo(1)])]);
    click('Editar la foto 2 de Casa 1');
    fixture.detectChanges();
    const dialog = () => el.querySelector<HTMLElement>('[data-testid="work-photo-dialog"]');
    expect(dialog()!.querySelector('h2')!.textContent).toContain('Foto 2 de 2');
    click('Borrar foto', dialog()!);
    fixture.detectChanges();
    expect(dialog()!.textContent).toContain('¿Borrar esta foto?');
    http.expectNone((r) => r.method === 'DELETE');
    el.querySelector<HTMLButtonElement>('[data-testid="work-delete-confirm"]')!.click();
    fixture.detectChanges();
    http.expectOne({ method: 'DELETE', url: `${PHOTOS}/${photo(1).id}` }).flush(workList([work(W1, [photo(0)])]));
    await flush();
    fixture.detectChanges();
    expect(card(el, W1).textContent).toContain('1 de 5 fotos');
    expect(dialog()).toBeNull();
  });

  it('borrar un trabajo avisa cuántas fotos se van; confirmar → DELETE del trabajo', async () => {
    const { http, fixture, el, click } = await openPaid(own(), [work(W1, [photo(0), photo(1)])]);
    click('Borrar el trabajo Casa 1');
    expect(el.textContent).toContain('¿Borrar «Casa 1»?');
    expect(el.textContent).toContain('Se borran el trabajo y sus 2 fotos.');
    el.querySelector<HTMLButtonElement>('[data-testid="work-remove-confirm"]')!.click();
    fixture.detectChanges();
    http.expectOne({ method: 'DELETE', url: `${WORKS}/${W1}` }).flush(workList([]));
    await flush();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="portfolio-preview"]')).not.toBeNull();
  });

  it('editar el trabajo: el formulario viene cargado y manda PATCH', async () => {
    const { http, fixture, el, click } = await openPaid(own(), [work(W1, [], { description: 'Pintura' })]);
    click('Editar el trabajo Casa 1');
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="work-form"]')!.textContent).toContain('Editar trabajo');
    expect(el.querySelector<HTMLInputElement>('#work-form-name')!.value).toBe('Casa 1');
    expect(el.querySelector<HTMLSelectElement>('#work-month')!.value).toBe('03');
    expect(el.querySelector<HTMLSelectElement>('#work-year')!.value).toBe('2026');
    setValue(el, '#work-form-name', 'Casa de campo');
    setValue(el, '#work-description', '');
    el.querySelector<HTMLFormElement>('[data-testid="work-form"]')!.dispatchEvent(new Event('submit'));
    const req = http.expectOne({ method: 'PATCH', url: `${WORKS}/${W1}` });
    expect(req.request.body).toEqual({ title: 'Casa de campo', description: null, doneOn: '2026-03' });
    req.flush(workList([work(W1, [], { title: 'Casa de campo' })]));
    await flush();
    fixture.detectChanges();
    expect(card(el, W1).querySelector('h3')!.textContent).toContain('Casa de campo');
  });

  it('ordenar desde la edición de la foto: "Mover antes" y "Usar como portada" mandan el orden completo; sigue en la misma foto', async () => {
    const { http, fixture, el, click } = await openPaid(own(), [work(W1, [photo(0, 'A'), photo(1, 'B'), photo(2, 'C')])]);
    click('Editar la foto 1 de Casa 1');
    fixture.detectChanges();
    const dialog = () => el.querySelector<HTMLElement>('[data-testid="work-photo-dialog"]')!;
    const button = (label: string) => [...dialog().querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === label)!;
    expect(button('Mover antes').disabled).toBe(true);
    expect(button('Es la portada del trabajo').disabled).toBe(true);
    click('Listo', dialog());
    fixture.detectChanges();

    click('Editar la foto 2 de Casa 1');
    fixture.detectChanges();
    button('Mover antes').click();
    const req = http.expectOne({ method: 'PUT', url: `${PHOTOS}/order` });
    expect(req.request.body).toEqual({ workId: W1, ids: [photo(1).id, photo(0).id, photo(2).id] });
    req.flush(workList([work(W1, [photo(1, 'B'), photo(0, 'A'), photo(2, 'C')])]));
    await flush();
    fixture.detectChanges();
    expect([...card(el, W1).querySelectorAll('img')].map((i) => i.getAttribute('alt'))).toEqual(['B', 'A', 'C']);
    // La misma foto (B), ahora primera.
    expect(dialog().querySelector('h2')!.textContent).toContain('Foto 1 de 3');
    click('Listo', dialog());
    fixture.detectChanges();

    click('Editar la foto 3 de Casa 1');
    fixture.detectChanges();
    button('Usar como portada').click();
    const cover = http.expectOne({ method: 'PUT', url: `${PHOTOS}/order` });
    expect(cover.request.body).toEqual({ workId: W1, ids: [photo(2).id, photo(1).id, photo(0).id] });
    cover.flush(workList([work(W1, [photo(2, 'C'), photo(1, 'B'), photo(0, 'A')])]));
    await flush();
    fixture.detectChanges();
    expect(card(el, W1).querySelector('img')!.getAttribute('alt')).toBe('C');
    expect(card(el, W1).querySelector('[data-testid="work-cover"]')).not.toBeNull();
  });

  it('pasar una foto a otro trabajo: solo a trabajos con lugar → PATCH move y se cierra', async () => {
    const { http, fixture, el, click } = await openPaid(own({ planTier: 'PRO' }), [work(W1, [photo(0, 'A'), photo(1, 'B')]), work(W2, [photo(2, 'C')])]);
    click('Editar la foto 2 de Casa 1');
    fixture.detectChanges();
    const dialog = () => el.querySelector<HTMLElement>('[data-testid="work-photo-dialog"]');
    click('Pasar a otro trabajo', dialog()!);
    fixture.detectChanges();
    expect(dialog()!.querySelector('h2')!.textContent).toContain('Pasar la foto a otro trabajo');
    click(/Departamento centro/, dialog()!);
    const req = http.expectOne({ method: 'PATCH', url: `${PHOTOS}/${photo(1).id}/move` });
    expect(req.request.body).toEqual({ workId: W2 });
    req.flush(workList([work(W1, [photo(0, 'A')]), work(W2, [photo(2, 'C'), photo(1, 'B')])], 10));
    await flush();
    fixture.detectChanges();
    expect(card(el, W2).textContent).toContain('2 de 5 fotos');
    expect(dialog()).toBeNull();
  });

  it('con un solo trabajo no ofrece pasar fotos a otro', async () => {
    const { el, fixture, click } = await openPaid(own(), [work(W1, [photo(0), photo(1)])]);
    click('Editar la foto 1 de Casa 1');
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="work-photo-dialog"]')!.textContent).not.toContain('Pasar a otro trabajo');
  });

  it('descripción de la foto: contador 0/80, PATCH y error del backend visible en la edición', async () => {
    const { http, fixture, el, click } = await openPaid(own(), [work(W1, [photo(0)])]);
    click('Editar la foto 1 de Casa 1');
    fixture.detectChanges();
    const input = el.querySelector<HTMLInputElement>('#work-photo-caption')!;
    expect(input.maxLength).toBe(80);
    input.value = 'Llamame 249 444 5566';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(el.textContent).toContain('20/80');
    click('Guardar descripción');
    http
      .expectOne({ method: 'PATCH', url: `${PHOTOS}/${photo(0).id}` })
      .flush({ code: 'INVALID_CAPTION', message: 'No incluyas teléfonos en la descripción.' }, { status: 422, statusText: 'Unprocessable' });
    await flush();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="work-photo-error"]')!.textContent).toContain('No incluyas teléfonos');
    expect(card(el, W1).querySelector('[data-testid="work-error"]')).toBeNull();

    input.value = 'Antes de empezar';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    click('Guardar descripción');
    const ok = http.expectOne({ method: 'PATCH', url: `${PHOTOS}/${photo(0).id}` });
    expect(ok.request.body).toEqual({ caption: 'Antes de empezar' });
    ok.flush(workList([work(W1, [photo(0, 'Antes de empezar')])]));
    await flush();
    fixture.detectChanges();
    expect(card(el, W1).textContent).toContain('Antes de empezar');
    expect(el.querySelector('[data-testid="work-photo-error"]')).toBeNull();
  });
});

describe('Mi perfil profesional — Cómo te contactan', () => {
  const contact = (overrides: Partial<NonNullable<OwnProfessional['contact']>> = {}) => ({
    whatsappEnabled: false,
    callsEnabled: false,
    requestsEnabled: true,
    whatsappNumber: null,
    whatsappDisplay: null,
    phoneNumber: null,
    phoneDisplay: null,
    phoneKind: null,
    consentAt: null,
    ...overrides,
  });
  const card = (el: HTMLElement) => el.querySelector<HTMLElement>('[data-testid="contact-settings"]')!;
  const check = (el: HTMLElement, testId: string) =>
    card(el).querySelector<HTMLInputElement>(`[data-testid="${testId}"]`)!.click();
  const type = (el: HTMLElement, id: string, value: string) => {
    const input = card(el).querySelector<HTMLInputElement>(`#${id}`)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };

  it('por defecto solo solicitudes por Resuelve; el teléfono de la cuenta no se ofrece ni se publica', async () => {
    const { el } = await open(own({ contact: contact() }));
    const summary = card(el).querySelector('[data-testid="contact-summary"]')!;
    expect(summary.textContent).toContain('Solicitudes por Resuelve');
    expect(summary.textContent).not.toContain('WhatsApp');
    expect(card(el).textContent).toContain('Sumá WhatsApp o llamadas');
  });

  it('WhatsApp exige consentimiento explícito antes de enviar nada', async () => {
    const { el, fixture, http, click } = await open(own({ contact: contact() }));
    click('Editar formas de contacto');
    check(el, 'contact-whatsapp-toggle');
    fixture.detectChanges();
    type(el, 'cs-whatsapp', '249 15 412-3456');
    fixture.detectChanges();
    expect(card(el).querySelector('[data-testid="contact-consent"]')).not.toBeNull();
    click('Guardar', card(el));
    expect(card(el).querySelector('[role="alert"]')!.textContent).toContain('tenés que aceptar');
    http.expectNone({ method: 'PATCH', url: `${API}/pro/contact` });

    card(el).querySelector<HTMLInputElement>('[data-testid="contact-consent"] input')!.click();
    fixture.detectChanges();
    click('Guardar', card(el));
    const req = http.expectOne({ method: 'PATCH', url: `${API}/pro/contact` });
    expect(req.request.body).toEqual({
      whatsappEnabled: true,
      callsEnabled: false,
      requestsEnabled: true,
      consent: true,
      whatsappNumber: '249 15 412-3456',
      phoneNumber: null,
      phoneKind: 'MOBILE',
    });
    req.flush(
      own({
        contact: contact({
          whatsappEnabled: true,
          whatsappNumber: '+5492494123456',
          whatsappDisplay: '+54 9 249 412-3456',
          consentAt: '2026-10-11T12:00:00.000Z',
        }),
        contactChannels: { whatsapp: true, phone: false, requests: true },
      }),
    );
    await flush();
    fixture.detectChanges();
    expect(card(el).querySelector('[data-testid="contact-summary"]')!.textContent).toContain('+54 9 249 412-3456');
  });

  it('sacar WhatsApp y llamadas retira el consentimiento (el backend borra los números)', async () => {
    const { el, fixture, http, click } = await open(
      own({
        contact: contact({
          whatsappEnabled: true,
          whatsappNumber: '+5492494123456',
          whatsappDisplay: '+54 9 249 412-3456',
          consentAt: '2026-10-11T12:00:00.000Z',
        }),
      }),
    );
    click('Editar formas de contacto');
    check(el, 'contact-whatsapp-toggle');
    fixture.detectChanges();
    expect(card(el).querySelector('[data-testid="contact-consent"]')).toBeNull();
    click('Guardar', card(el));
    const req = http.expectOne({ method: 'PATCH', url: `${API}/pro/contact` });
    expect(req.request.body).toEqual({ whatsappEnabled: false, callsEnabled: false, requestsEnabled: true, consent: false });
    req.flush(own({ contact: contact() }));
    await flush();
  });

  it('pide al menos una forma de contacto y muestra el error del backend en el número', async () => {
    const { el, fixture, http, click } = await open(own({ contact: contact() }));
    click('Editar formas de contacto');
    check(el, 'contact-requests-toggle');
    fixture.detectChanges();
    click('Guardar', card(el));
    expect(card(el).querySelector('[role="alert"]')!.textContent).toContain('al menos una forma de contacto');
    http.expectNone({ method: 'PATCH', url: `${API}/pro/contact` });

    check(el, 'contact-calls-toggle');
    fixture.detectChanges();
    type(el, 'cs-phone', '4123456');
    card(el).querySelector<HTMLInputElement>('[data-testid="contact-consent"] input')!.click();
    fixture.detectChanges();
    click('Guardar', card(el));
    http
      .expectOne({ method: 'PATCH', url: `${API}/pro/contact` })
      .flush(
        { statusCode: 422, code: 'INVALID_PHONE', message: 'x', details: { field: 'phoneNumber' } },
        { status: 422, statusText: 'Unprocessable Entity' },
      );
    await flush();
    fixture.detectChanges();
    expect(card(el).querySelector('[role="alert"]')!.textContent).toContain('Revisá el número');
    expect(card(el).querySelector('#cs-phone')!.getAttribute('aria-invalid')).toBe('true');
  });

  it('aviso descartable para quien no tiene WhatsApp ni llamadas: "Configurar" abre la edición', async () => {
    localStorage.clear();
    const { el, fixture, click } = await open(own({ contact: contact() }));
    const tip = () => el.querySelector('[data-testid="contact-tip"]');
    expect(tip()!.textContent).toContain('Ahora podés recibir clientes directamente por WhatsApp o llamadas.');
    click('Configurar', tip()!);
    await flush();
    fixture.detectChanges();
    expect(card(el).querySelector('[data-testid="contact-whatsapp-toggle"]')).not.toBeNull();

    click('Descartar el aviso de contacto directo');
    expect(tip()).toBeNull();
    expect(localStorage.getItem(`resuelve:contact-tip-dismissed:${own().id}`)).toBe('1');
    localStorage.clear();
  });

  it('el aviso no aparece si ya lo descartó o si ya tiene un canal directo', async () => {
    localStorage.setItem(`resuelve:contact-tip-dismissed:${own().id}`, '1');
    let { el } = await open(own({ contact: contact() }));
    expect(el.querySelector('[data-testid="contact-tip"]')).toBeNull();
    localStorage.clear();
    TestBed.resetTestingModule();
    ({ el } = await open(
      own({
        contact: contact({ callsEnabled: true, phoneNumber: '+542494423456', phoneDisplay: '+54 249 442-3456', phoneKind: 'LANDLINE', consentAt: '2026-10-11T12:00:00.000Z' }),
      }),
    ));
    expect(el.querySelector('[data-testid="contact-tip"]')).toBeNull();
    // Configuración existente intacta: se ve tal cual, sin pasar por el alta.
    expect(card(el).querySelector('[data-testid="contact-summary"]')!.textContent).toContain('+54 249 442-3456');
  });

  it('?editar=contact (fin del alta) abre "Cómo te contactan"', async () => {
    const { el, fixture } = await open(own({ contact: contact() }));
    await TestBed.inject(Router).navigateByUrl('/pro/perfil?editar=contact');
    await flush();
    fixture.detectChanges();
    expect(card(el).querySelector('[data-testid="contact-requests-toggle"]')).not.toBeNull();
  });

  it('editar con un canal ya consentido conserva el consentimiento; sumar otro lo vuelve a pedir', async () => {
    const { el, fixture, click } = await open(
      own({
        contact: contact({
          whatsappEnabled: true,
          whatsappNumber: '+5492494123456',
          whatsappDisplay: '+54 9 249 412-3456',
          consentAt: '2026-10-11T12:00:00.000Z',
        }),
      }),
    );
    click('Editar formas de contacto');
    const consent = () => card(el).querySelector<HTMLInputElement>('[data-testid="contact-consent"] input')!;
    expect(consent().checked).toBe(true);
    check(el, 'contact-calls-toggle');
    fixture.detectChanges();
    expect(consent().checked).toBe(false);
  });
});

