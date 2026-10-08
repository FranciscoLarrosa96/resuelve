import { Component } from '@angular/core';
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
  canSendUnlimitedQuotes: pro, canBeFeatured: pro, canUseAdvancedAnalytics: pro, canSeeExposureAnalytics: pro, canUseQuoteTemplates: false, portfolioPhotoLimit: pro ? 20 : 5,
});

const me = (pro: boolean, eligible: boolean) =>
  ({
    id: 'profile-1', displayName: 'Marta Gómez', firstName: 'Marta', lastName: 'Gómez', avatarUrl: null, headline: 'Electricista',
    averageRating: 4.5, reviewsCount: 2, status: 'ACTIVE', availableToday: false, pro,
    plan: { tier: pro ? 'PRO' : 'FREE', expiresAt: null, entitlements: ent(pro) },
    quoteUsage: { used: 3, limit: pro ? null : 5, remaining: pro ? null : 2 },
    featured: { eligible, reason: eligible ? null : pro ? 'NO_COVERAGE' : 'NOT_PRO' },
    proInterestAt: null,
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
) {
  sessionStorage.clear();
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
      if (url.endsWith('/pro/me')) req.flush(me(pro, eligible));
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
    expect(state).toContain('Aparecés en búsquedas de Tandil');
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

  it('próximo trabajo: Lo próximo lo muestra con "Ver en la agenda" y no se repite abajo', async () => {
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
    expect(el.querySelector('[data-testid="next-up"] a[href="/pro/agenda"]')).not.toBeNull();
    expect(el.querySelector('[aria-labelledby="dash-next"]')).toBeNull();
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
  });
});
