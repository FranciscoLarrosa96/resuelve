import { ApplicationRef, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { API_URL } from '../../../core/api/api.config';
import { authInterceptor } from '../../../core/auth/auth.interceptor';
import { AuthResponse, AuthUser } from '../../../core/models/auth';
import { Entitlements, MonthAnalytics } from '../../../core/models/pro-analytics';
import { OwnProfessional } from '../../../core/models/pro-profile';
import { AuthStore } from '../../../core/state/auth.store';
import { businessDay, shiftDay } from '../../../core/utils/business-time';
import { ProDashboardPage } from './pro-dashboard-page';

// HTTP mockeado: nunca se llama a Render.
const API = 'http://api.test/api/v1';
const USER: AuthUser = {
  id: 'u-pro', firstName: 'Marta', lastName: 'Gómez', email: 'marta@example.com', phone: null,
  phoneVerified: false,
  emailVerifiedAt: '2026-01-01T00:00:00.000Z',
  emailVerified: true, avatarUrl: null, defaultZoneId: null, professionalProfileId: 'profile-1',
  createdAt: '2026-09-01T12:00:00.000Z',
};
const tokens: AuthResponse = { accessToken: 'a.1.s', refreshToken: 'r.1.s', expiresIn: 900, tokenType: 'Bearer' };
const ent = (pro: boolean): Entitlements => ({
  canSendUnlimitedQuotes: pro, canBeFeatured: pro, canUseAdvancedAnalytics: pro, canSeeExposureAnalytics: pro, canUseQuoteTemplates: false, portfolioWorkLimit: pro ? 10 : 1,
});

const me = (pro: boolean, eligible: boolean, extra: Partial<OwnProfessional> = {}) =>
  ({
    id: 'profile-1', slug: 'marta-gomez', displayName: 'Marta Gómez', firstName: 'Marta', lastName: 'Gómez', avatarUrl: null, headline: 'Electricista',
    averageRating: 4.5, reviewsCount: 2, invitedReviewsCount: 0, status: 'ACTIVE', availableToday: false, pro,
    firstSuccessAt: '2026-08-01T12:00:00.000Z',
    offeredServices: [{ id: 's-1', name: 'Electricidad', slug: 'electricidad', requiresLicense: false, licenseStatus: 'NOT_REQUIRED', public: true }],
    coverage: [{ locality: { id: 'l-1', name: 'Tandil' }, coversEntireCity: true, zones: [] }],
    coversEntireCity: true, zones: [],
    contact: { whatsappEnabled: true, callsEnabled: false, requestsEnabled: true, whatsappNumber: null, whatsappDisplay: null, phoneNumber: null, phoneDisplay: null, phoneKind: null, consentAt: null },
    plan: { tier: pro ? 'PRO' : 'FREE', expiresAt: null, entitlements: ent(pro) },
    quoteUsage: { used: 3, limit: pro ? null : 5, remaining: pro ? null : 2 },
    featured: { eligible, reason: eligible ? null : pro ? 'NO_COVERAGE' : 'NOT_PRO' },
    proInterestAt: null,
    ...extra,
  }) as unknown as OwnProfessional;

const month = (pro: boolean): MonthAnalytics => ({
  period: { year: 2026, month: 9, start: '', end: '', isCurrent: true, earliest: { year: 2026, month: 9 } },
  plan: pro ? 'PRO' : 'FREE',
  entitlements: ent(pro),
  basic: { requestsReceived: 18, quotesSent: 12, quotesAccepted: 5, scheduledJobs: 4, completedJobs: 3, reviewsReceived: 1, currentRating: 4.5, reviewCount: 2 },
  recentReviews: [],
  advanced: pro
    ? { acceptedQuotesValue: '1840000.00', acceptance: { sent: 12, accepted: 5, rate: 41.7 }, previous: null, weekly: [{ fromDay: 1, toDay: 7, requestsReceived: 4, quotesSent: 2, completedJobs: 1 }], byService: [], byZone: [] }
    : null,
  exposure: pro
    ? { impressions: 1284, featuredImpressions: 310, profileViews: 87, rates: { viewsPerImpression: 6.8, requestsPerView: 20.7, acceptance: 41.7 }, previous: null }
    : null,
});

@Component({ template: '' })
class Blank {}

const flush = () => new Promise((r) => setTimeout(r));

async function open(
  pro: boolean,
  eligible = pro,
  requestResponse: object = { items: [], total: 0, page: 1, pageSize: 50, actionableCount: 0 },
  jobsResponse: object = { items: [], counts: { toCoordinate: 0, today: 0, inProgress: 0, completed: 0 } },
  extra: Partial<OwnProfessional> = {},
  photos = 0,
  /** Primeros pasos ya mostrados o salteados en esta sesión (`ActivationSession`). */
  skipped: string[] = [],
  worksResponse?: object | 'error',
) {
  sessionStorage.clear();
  if (skipped.length) sessionStorage.setItem('resuelve:activation-session', JSON.stringify({ userId: USER.id, tips: skipped }));
  // Cada apertura inicia sesión de cero (lo demás de localStorage, como "Ocultar", se conserva).
  localStorage.removeItem('resuelve.refreshToken');
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

  const fixture = TestBed.createComponent(ProDashboardPage);
  fixture.detectChanges();
  // Responde todo lo que pide el panel con datos reales mínimos (las listas, vacías).
  for (let round = 0; round < 3; round++) {
    await flush();
    for (const req of http.match(() => true) as TestRequest[]) {
      if (req.cancelled) continue;
      const url = req.request.url;
      if (url.endsWith('/pro/me')) req.flush(me(pro, eligible, extra));
      else if (url.endsWith('/pro/profile/works')) {
        if (worksResponse === 'error') req.flush({}, { status: 500, statusText: 'Server Error' });
        else req.flush(worksResponse ?? {
          items: photos ? [{ id: 'work-1', title: 'Casa 1', description: null, doneOn: '2026-03', archivedByPlan: false, photos: Array.from({ length: photos }, (_, i) => ({ id: `w-${i}`, url: `https://images.test/work-${i}.webp`, caption: null, sortOrder: i, archivedByPlan: false })) }] : [],
          maxWorks: pro ? 10 : 1, activeWorks: photos ? 1 : 0, maxStoredWorks: 30, photosPerWork: 5, activePhotos: photos, maxBytes: 1,
        });
      }
      else if (url.endsWith('/pro/analytics/month')) req.flush(month(pro));
      else if (url.includes('/pro/requests')) req.flush(requestResponse);
      else if (url.includes('/pro/jobs')) req.flush(jobsResponse);
      else if (url.includes('/notifications')) req.flush({ client: { unread: 0, byRequest: [] }, professional: { unread: 0, byRequest: [], completionDue: 0 } });
      else req.flush({ items: [], total: 0, page: 1, pageSize: 20 });
    }
    fixture.detectChanges();
  }
  return fixture.nativeElement as HTMLElement;
}

const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ');

describe('dashboard profesional: Free vs. PRO', () => {
  it('Free: sin badge PRO, cupo en el estado del día, reputación real en Tu mes y sin banners de venta', async () => {
    const el = await open(false);
    const quota = text(el.querySelector('[aria-label="Tu día"] a[href="/pro/plan"]'));
    expect(quota).toContain('Oportunidades Free');
    expect(quota).toContain('3 de 5');
    expect(el.querySelector('app-pro-badge')).toBeNull();
    const state = text(el.querySelector('[data-testid="profile-state"]'));
    expect(state).toContain('Perfil activo');
    expect(state).toContain('Aparecés en las búsquedas de tus localidades');
    expect(el.textContent).not.toContain('destacados');
    const month = text(el.querySelector('[data-testid="dash-month"]'));
    expect(month).toContain('4,5');
    expect(month).not.toContain('Apariciones');
    // El dashboard no es uno de los lugares de upsell (cupo, Tu mes y perfil).
    expect(el.textContent).not.toMatch(/Conocer Resuelve PRO|Más oportunidades, más información|Desbloquear/);
  });

  it('PRO elegible: chip "Apto para destacados", sin "Sin límite" y un solo embudo con un solo "Ver rendimiento"', async () => {
    const el = await open(true);
    expect(el.querySelector('app-pro-badge')).not.toBeNull();
    expect(text(el.querySelector('[data-testid="profile-state"]'))).toContain('Apto para destacados');
    expect(el.textContent).not.toContain('Sin límite');
    expect(el.querySelector('[aria-label="Tu día"] a[href="/pro/plan"]')).toBeNull();
    const month = text(el.querySelector('[data-testid="dash-month"]'));
    expect(month).toMatch(/Apariciones\s*1\.284/);
    expect(month).toMatch(/Visitas al perfil\s*87/);
    expect(month).toMatch(/Solicitudes\s*18/);
    expect(month).toMatch(/Aceptados\s*5/);
    expect(month).toContain('$ 1.840.000');
    expect(el.textContent!.match(/Ver rendimiento/g)).toHaveLength(1);
  });

  it('PRO que no cumple las reglas: badge sí, "destacado" no', async () => {
    const el = await open(true, false);
    expect(el.querySelector('app-pro-badge')).not.toBeNull();
    expect(text(el.querySelector('[data-testid="profile-state"]'))).not.toContain('destacados');
  });

  it('todo en cero: "Al día" en una frase y Lo próximo sin trabajos', async () => {
    const el = await open(true);
    expect(el.querySelector('[data-testid="all-clear"]')).not.toBeNull();
    expect(text(el.querySelector('[data-testid="next-up"]'))).toContain('No tenés trabajos agendados');
  });

  it('Free nuevo y publicado: presenta PRO en lugar de una agenda vacía, sin ocultar tareas reales', async () => {
    const el = await open(false, false, undefined, undefined, { firstSuccessAt: null });
    const card = el.querySelector('[data-testid="pro-start"]');
    expect(text(card)).toContain('Hacé que más clientes te encuentren con PRO');
    expect(card?.querySelector('a')?.getAttribute('href')).toBe('/pro/plan#contratar');
    expect(text(el.querySelector('[data-testid="next-up"]'))).not.toContain('No tenés trabajos agendados');
    expect(el.querySelector('[data-testid="all-clear"]')).toBeNull();
  });

  it('próximo trabajo: Lo próximo lo muestra con "Ver en la agenda" y no se repite abajo; día tranquilo, crecer sube', async () => {
    const job = {
      id: 'job-1', requestId: 'req-1', status: 'SCHEDULED', scheduledDate: shiftDay(businessDay(), 1), scheduledTime: '12:00',
      durationMinutes: 60, startedAt: null, completedAt: null, cancelledAt: null, title: 'Cambiar enchufes',
      service: { name: 'Electricidad' }, zone: { name: 'Centro' }, client: { firstName: 'Ana', lastInitial: 'R' },
    };
    const el = await open(true, true, undefined, { items: [job], counts: { toCoordinate: 0, today: 0, inProgress: 0, completed: 0 } });
    const next = text(el.querySelector('[data-testid="next-up"]'));
    expect(next).toContain('Mañana');
    expect(next).toContain('12:00');
    expect(next).toContain('Cambiar enchufes');
    const agenda = el.querySelector('[data-testid="next-up"] a[href="/pro/agenda"]');
    expect(agenda?.className).toContain('button-secondary');
    expect(el.querySelector('[data-testid="next-up"] .button-primary')).toBeNull();
    expect(el.querySelector('[aria-labelledby="dash-next"]')).toBeNull();
    const grow = el.querySelector('[data-testid="dash-grow"]')!;
    expect(grow.getAttribute('data-highlight')).toBe('true');
    expect(grow.className).toContain('order-1');
    expect(el.querySelector('[data-testid="dash-queue"]')?.className).toContain('order-3');
    expect(text(grow)).toContain('Más reseñas y colegas, más clientes.');
    expect(text(grow)).not.toContain('Opcional');
  });

  it('solicitud para responder: va a Lo próximo, con la cantidad del backend, y oculta demoradas', async () => {
    const base = {
      description: 'Trabajo pendiente', urgency: 'FLEXIBLE', status: 'WAITING_QUOTES', desiredDate: null,
      desiredTimeRange: null, service: { id: 's', name: 'Plomería' }, zone: { id: 'z', name: 'Centro' }, photos: [],
      createdAt: '2026-09-28T12:00:00.000Z', updatedAt: '2026-09-28T12:00:00.000Z',
      invitationStatus: 'PENDING', otherInvitedCount: 0, selectedByClient: false, completedAt: null, completedBy: null,
      appointment: null, completionDue: false, canComplete: false, client: { firstName: 'Ana', lastInitial: 'R' }, contact: null,
      opportunity: { blocked: false, targeted: false, delayed: false, availableToProfessionalAt: null, activeQuoteCount: 0, maxActiveQuotes: 5, remainingQuoteSlots: 5, slotsFull: false, attributionSource: 'MULTI_SELECT' },
    };
    const el = await open(false, false, {
      items: [
        { ...base, id: 'available', title: 'Disponible', opportunity: { ...base.opportunity, actionable: true } },
        { ...base, id: 'delayed', title: 'Demorada', opportunity: { ...base.opportunity, actionable: false, delayed: true } },
      ],
      total: 2, page: 1, pageSize: 50, actionableCount: 1,
    });
    expect(text(el.querySelector('[aria-label="Tu día"]'))).toContain('1 solicitud nueva');
    const next = text(el.querySelector('[data-testid="next-up"]'));
    expect(next).toContain('Disponible');
    expect(next).toContain('Enviar presupuesto');
    const section = text(el.querySelector('[aria-labelledby="dash-real-requests"]'));
    expect(section).toContain('No hay otras solicitudes nuevas');
    expect(el.textContent).not.toContain('Demorada');
    // Con algo urgente, crecer queda abajo y sin rellenos.
    const grow = el.querySelector('[data-testid="dash-grow"]')!;
    expect(grow.getAttribute('data-highlight')).toBe('false');
    expect(grow.className).toContain('order-3');
  });
});

// Profesional recién registrado: sin primer cliente, sin fotos y sin reseñas.
const NEW_PRO: Partial<OwnProfessional> = {
  firstSuccessAt: null, reviewsCount: 0, averageRating: null, invitedReviewsCount: 0,
  contact: { whatsappEnabled: false, callsEnabled: false, requestsEnabled: true, whatsappNumber: null, whatsappDisplay: null, phoneNumber: null, phoneDisplay: null, phoneKind: null, consentAt: null },
};
const WITH_AVATAR = { ...NEW_PRO, avatarUrl: 'https://res.cloudinary.test/avatar.jpg' };
const tips = (el: HTMLElement) => [...el.querySelectorAll('[data-testid="activation"] [data-tip]')].map((t) => t.getAttribute('data-tip'));

describe('dashboard profesional: fotos de tus trabajos', () => {
  beforeEach(() => localStorage.clear());

  it('sigue visible después del primer cliente y con la bienvenida oculta; abre el editor existente', async () => {
    localStorage.setItem('resuelve:activation-dismissed:profile-1', '1');
    const el = await open(false);
    const section = el.querySelector('[data-testid="dashboard-portfolio"]');
    expect(text(section)).toContain('Mostrá lo que sabés hacer.');
    expect(text(section)).toContain('también por fuera de Resuelve');
    expect(text(section)).toContain('0 de 1 trabajo de tu plan');
    expect(text(section)).toContain('Subir mi primer trabajo');
    expect(section?.querySelector('a')?.getAttribute('href')).toBe('/pro/perfil?editar=portfolio');
    expect(el.querySelector('[data-testid="activation"]')).toBeNull();
    expect(el.querySelector('[data-testid="next-up"]')!.compareDocumentPosition(section!))
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('Free con el cupo completo conserva sus fotos y puede administrarlas', async () => {
    const el = await open(false, false, undefined, undefined, {}, 1);
    const section = el.querySelector('[data-testid="dashboard-portfolio"]');
    expect(text(section)).toContain('1 de 1 trabajo de tu plan');
    expect(text(section)).toContain('Administrar trabajos');
    expect(text(section)).not.toContain('Agregar trabajo');
    expect(section?.querySelector('img')?.getAttribute('src')).toBe('https://images.test/work-0.webp');
  });

  it('Plus usa el límite recibido, muestra hasta tres portadas reales y excluye archivadas', async () => {
    const items = Array.from({ length: 5 }, (_, i) => ({
      id: `work-${i}`, title: `Trabajo ${i}`, description: null, doneOn: '2026-10', archivedByPlan: i === 0,
      photos: [
        { id: `archived-${i}`, url: `https://images.test/archived-${i}.webp`, sortOrder: 0, archivedByPlan: true },
        { id: `cover-${i}`, url: `https://images.test/cover-${i}.webp`, sortOrder: 1, archivedByPlan: false },
      ],
    }));
    const el = await open(true, true, undefined, undefined, {
      plan: { tier: 'PRO_PLUS', expiresAt: null, entitlements: { ...ent(true), portfolioWorkLimit: 30 } },
    }, 0, [], { items, maxWorks: 30, maxStoredWorks: 30, photosPerWork: 5 });
    const section = el.querySelector('[data-testid="dashboard-portfolio"]');
    expect(text(section)).toContain('4 de 30 trabajos de tu plan');
    expect(text(section)).toContain('Agregar trabajo');
    expect([...section!.querySelectorAll('img')].map((img) => img.getAttribute('src'))).toEqual([
      'https://images.test/cover-1.webp', 'https://images.test/cover-2.webp', 'https://images.test/cover-3.webp',
    ]);
  });

  it('un error no se presenta como portfolio vacío y permite reintentar', async () => {
    const el = await open(false, false, undefined, undefined, {}, 0, [], 'error');
    const section = el.querySelector('[data-testid="dashboard-portfolio"]');
    expect(text(section)).toContain('No pudimos cargar tus trabajos.');
    expect(text(section)).not.toContain('0 de 1');
    expect(text(section)).not.toContain('Subir mi primer trabajo');
    section!.querySelector<HTMLButtonElement>('button')!.click();
    TestBed.inject(ApplicationRef).tick();
    expect(text(section)).toContain('Cargando tus trabajos');
    TestBed.inject(HttpTestingController).expectOne(`${API}/pro/profile/works`).flush({
      items: [], maxWorks: 1, maxStoredWorks: 10, photosPerWork: 5,
    });
    await flush();
    TestBed.inject(ApplicationRef).tick();
    expect(text(section)).toContain('Subir mi primer trabajo');
  });
});

describe('dashboard profesional: primeros pasos', () => {
  beforeEach(() => localStorage.clear());

  it('perfil incompleto: primero completarlo (foto, trabajos, WhatsApp); compartir todavía no entra', async () => {
    const el = await open(false, false, undefined, undefined, { ...NEW_PRO, avatarUrl: null }, 0);
    expect(tips(el)).toEqual(['AVATAR', 'CONTACT', 'REVIEW']);
    expect(text(el.querySelector('[data-tip="AVATAR"]'))).toContain('Sumá tu foto');
    // Los trabajos tienen una sección permanente; "Sumá reseñas" sigue abajo.
    expect(el.querySelectorAll('#pedir-resenas')).toHaveLength(1);
  });

  it('profesional nuevo: bienvenida con compartir (enlace público real), fotos y primera reseña; sin PRO', async () => {
    const el = await open(false, false, undefined, undefined, WITH_AVATAR, 0);
    const card = el.querySelector('[data-testid="activation"]');
    expect(text(card)).toContain('¡Te damos la bienvenida a Resuelve!');
    expect(text(card)).toContain('Tu perfil ya está publicado.');
    // Tres como máximo: compartir queda para cuando el perfil esté completo.
    expect(tips(el)).toEqual(['CONTACT', 'REVIEW']);
    expect(text(card)).not.toContain('Compartí tu perfil');
    expect(card?.querySelector('a[href="/pro/perfil?editar=portfolio"]')).toBeNull();
    expect(el.querySelector('[data-testid="dashboard-work-action"]')?.getAttribute('href')).toBe('/pro/perfil?editar=portfolio');
    expect(text(card)).toContain('Pedí tu primera reseña');
    expect(text(card)).not.toMatch(/PRO|Plan|suscrip/);
    // Una sola tarjeta de bienvenida; "Pedir una reseña" lleva a "Sumá reseñas", que sigue abajo.
    expect(el.querySelectorAll('[data-testid="activation"]')).toHaveLength(1);
    expect(el.querySelectorAll('#pedir-resenas')).toHaveLength(1);
    const target = el.querySelector<HTMLElement>('#pedir-resenas')!;
    const scroll = vi.fn();
    target.scrollIntoView = scroll;
    [...el.querySelectorAll<HTMLButtonElement>('[data-tip="REVIEW"] button')]
      .find((b) => b.textContent?.includes('Pedir una reseña'))!
      .click();
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(target.querySelector('[data-testid="review-invite-whatsapp"]'));
    // Invitar colegas sigue en el panel, sin protagonismo.
    expect(el.querySelector('app-referrals-panel')).not.toBeNull();
  });

  it('compartir usa el enlace público del perfil y la Web Share API cuando existe', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    try {
      const el = await open(false, false, undefined, undefined, { ...WITH_AVATAR, contact: { ...NEW_PRO.contact!, whatsappEnabled: true } }, 2);
      expect(tips(el)).toEqual(['REVIEW', 'SHARE']);
      const button = [...el.querySelectorAll<HTMLButtonElement>('[data-tip="SHARE"] button')].find((b) => b.textContent?.includes('Compartir mi perfil'));
      button!.click();
      await flush();
      expect(share).toHaveBeenCalledTimes(1);
      expect(share.mock.calls[0][0].url).toMatch(/\/p\/marta-gomez\?src=share$/);
    } finally {
      delete (navigator as { share?: unknown }).share;
    }
  });

  it('con fotos no insiste con fotos; con reseñas no habla de "primera reseña"; sin WhatsApp lo sugiere', async () => {
    const el = await open(false, false, undefined, undefined, { ...WITH_AVATAR, invitedReviewsCount: 1 }, 0);
    expect(tips(el)).toEqual(['CONTACT']);
    expect(el.textContent).not.toContain('Pedí tu primera reseña');
    TestBed.resetTestingModule();
    const el2 = await open(false, false, undefined, undefined, WITH_AVATAR, 2);
    expect(tips(el2)).toEqual(['CONTACT', 'REVIEW', 'SHARE']);
    expect(el2.textContent).not.toContain('Mostrá tus trabajos');
  });

  it('perfil pausado o un primer cliente ya conseguido: Inicio de siempre, sin bienvenida', async () => {
    const cases: [Partial<OwnProfessional>, number][] = [
      [{ ...NEW_PRO, status: 'PAUSED' }, 0],
      [{ ...NEW_PRO, firstSuccessAt: '2026-09-01T00:00:00.000Z' }, 0],
      [{ ...NEW_PRO, coverage: [] }, 0],
    ];
    for (const [extra, photos] of cases) {
      TestBed.resetTestingModule();
      const el = await open(false, false, undefined, undefined, extra, photos);
      expect(el.querySelector('[data-testid="activation"]')).toBeNull();
      expect(el.querySelector('[data-testid="next-up"]')).not.toBeNull();
    }
  });

  it('no se saltea la foto personal ni el contacto aunque ya haya fotos y reseñas; compartir queda último', async () => {
    const el = await open(false, false, undefined, undefined, { ...NEW_PRO, avatarUrl: null, reviewsCount: 1 }, 3);
    expect(tips(el)).toEqual(['AVATAR', 'CONTACT']);
    TestBed.resetTestingModule();
    const ready = await open(false, false, undefined, undefined, { ...WITH_AVATAR, reviewsCount: 1, contact: { ...NEW_PRO.contact!, whatsappEnabled: true } }, 3);
    expect(tips(ready)).toEqual(['SHARE']);
  });

  it('se puede ocultar y queda oculta para ese perfil en este navegador', async () => {
    const el = await open(false, false, undefined, undefined, NEW_PRO, 0);
    el.querySelector<HTMLButtonElement>('[data-testid="activation-dismiss"]')!.click();
    TestBed.inject(ApplicationRef).tick();
    expect(el.querySelector('[data-testid="activation"]')).toBeNull();
    expect(localStorage.getItem('resuelve:activation-dismissed:profile-1')).toBe('1');
    TestBed.resetTestingModule();
    const again = await open(false, false, undefined, undefined, NEW_PRO, 0);
    expect(again.querySelector('[data-testid="activation"]')).toBeNull();
    // Nada más se bloquea: reseñas y crecer siguen ahí.
    expect(again.querySelector('#pedir-resenas')).not.toBeNull();
  });

  it('mostrar o saltear pasos durante el alta no oculta tareas pendientes en el panel', async () => {
    const el = await open(false, false, undefined, undefined, { ...NEW_PRO, avatarUrl: null }, 0, ['AVATAR', 'CONTACT']);
    expect(tips(el)).toEqual(['AVATAR', 'CONTACT', 'REVIEW']);
    // Salteada no es hecha: su configuración sigue en Mi perfil y en una sesión nueva vuelve a sugerirse.
    TestBed.resetTestingModule();
    const nextSession = await open(false, false, undefined, undefined, { ...NEW_PRO, avatarUrl: null }, 0);
    expect(tips(nextSession)).toEqual(['AVATAR', 'CONTACT', 'REVIEW']);
  });

  it('las sugerencias pendientes siguen disponibles aunque todas se hayan mostrado en el alta', async () => {
    const el = await open(false, false, undefined, undefined, WITH_AVATAR, 2, ['CONTACT', 'REVIEW', 'SHARE']);
    expect(tips(el)).toEqual(['CONTACT', 'REVIEW', 'SHARE']);
  });

  it('solo solicitudes por Resuelve: saltear el contacto directo no impide llegar a compartir, que sigue al final', async () => {
    const el = await open(false, false, undefined, undefined, { ...WITH_AVATAR, reviewsCount: 1 }, 2, ['CONTACT']);
    expect(tips(el)).toEqual(['CONTACT', 'SHARE']);
    TestBed.resetTestingModule();
    const sinPublicar = await open(false, false, undefined, undefined, { ...WITH_AVATAR, reviewsCount: 1, coverage: [] }, 2);
    expect(sinPublicar.querySelector('[data-tip="SHARE"]')).toBeNull();
  });
});

describe('dashboard profesional: perfil todavía sin publicar', () => {
  beforeEach(() => localStorage.clear());

  it('sin dónde trabajar (o sin oficio) no ofrece reseñas ni invitar colegas ni compartir', async () => {
    const el = await open(false, false, undefined, undefined, { ...NEW_PRO, coverage: [], coversEntireCity: false, zones: [] }, 0);
    expect(el.querySelector('[data-testid="dash-grow"]')).toBeNull();
    expect(el.querySelector('app-referrals-panel')).toBeNull();
    expect(el.querySelector('#pedir-resenas')).toBeNull();
    expect(el.querySelector('[data-testid="activation"]')).toBeNull();
    expect(el.querySelector('[data-testid="profile-share-button"]')).toBeNull();
  });

  it('con oficio y cobertura (publicable) se ofrece como siempre', async () => {
    const el = await open(false, false, undefined, undefined, NEW_PRO, 0);
    expect(el.querySelector('[data-testid="dash-grow"]')).not.toBeNull();
    expect(el.querySelector('app-referrals-panel')).not.toBeNull();
  });
});
