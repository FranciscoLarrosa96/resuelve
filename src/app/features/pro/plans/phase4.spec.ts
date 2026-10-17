import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MonthAnalytics } from '../../../core/models/pro-analytics';
import { OwnProfessional } from '../../../core/models/pro-profile';
import { notificationCopy, weeklySummaryText } from '../../../core/models/notification';
import { demandFacts, proZeroDiagnosis } from '../../../core/utils/pro-value';
import { WorkCovers } from '../../../shared/components/work-covers/work-covers';
import { lossText } from '../pro-ui';
import { LocalDemandPanel } from './local-demand-panel';

function month(patch: Partial<MonthAnalytics> = {}): MonthAnalytics {
  return {
    period: { year: 2026, month: 10, start: '', end: '', isCurrent: true, earliest: { year: 2026, month: 9 } },
    plan: 'PRO',
    entitlements: {
      canSendUnlimitedQuotes: true,
      canBeFeatured: true,
      canUseAdvancedAnalytics: true,
      canSeeExposureAnalytics: true,
      canUseQuoteTemplates: true,
      portfolioWorkLimit: 10,
    },
    basic: {
      requestsReceived: 4, quotesSent: 0, quotesAccepted: 0, scheduledJobs: 0, completedJobs: 0,
      reviewsReceived: 0, currentRating: null, reviewCount: 0, acceptedQuotesValue: '0.00',
    },
    recentReviews: [],
    advanced: null,
    exposure: { impressions: 0, featuredImpressions: 0, profileViews: 0, whatsappClicks: 0, phoneClicks: 0 } as MonthAnalytics['exposure'],
    proPreview: null,
    demand: null,
    ...patch,
  };
}

const me = (patch: Partial<OwnProfessional> = {}) =>
  ({
    featured: { eligible: true, reason: null },
    avatarUrl: 'https://res.cloudinary.com/demo/a.jpg',
    coverage: [{ locality: { id: 'c1', name: 'Tandil', slug: 'tandil', province: null }, coversEntireCity: true, zones: [] }],
    primaryLocality: { id: 'c1', name: 'Tandil', slug: 'tandil', province: null },
    ...patch,
  }) as OwnProfessional;

const DEMAND = { locality: 'Tandil', services: ['Plomería'], requests: 12, received: 4, answeredBeforeFree: 3, otherProProfiles: 2 };

describe('Fase 4: la demanda en tu zona', () => {
  it('agregada, con lo que le llegó y sin datos de nadie; sin base no se muestra', () => {
    expect(demandFacts(month())).toBeNull();
    const free = demandFacts(month({ plan: 'FREE', demand: DEMAND }))!;
    expect(free.title).toBe('12 pedidos de Plomería en Tandil');
    expect(free.facts).toEqual([
      { value: '4', text: 'te llegaron a vos' },
      { value: '3', text: 'ya tenían presupuesto antes de que los perfiles Free pudieran verlos' },
      { value: '2', text: 'perfiles PRO ofrecen tus servicios en tu ciudad' },
    ]);
    const pro = demandFacts(month({ demand: { ...DEMAND, answeredBeforeFree: 0, otherProProfiles: 1 } }))!;
    expect(pro.facts.map((f) => f.text)).toEqual(['te llegaron a vos', 'perfil PRO más ofrece tus servicios en tu ciudad']);
  });

  it('compara solo pedidos de la misma ciudad, aunque el profesional reciba solicitudes de otras ciudades', () => {
    const d = month({ demand: { ...DEMAND, received: 2 }, basic: { ...month().basic, requestsReceived: 20 } });
    expect(demandFacts(d)!.facts[0]).toEqual({ value: '2', text: 'te llegaron a vos' });
    expect(demandFacts(month({ demand: { ...DEMAND, received: undefined } }))!.facts.some((f) => f.text.includes('te llegaron'))).toBe(false);
  });

  it('el panel muestra el título y aclara que es anónimo', () => {
    @Component({ imports: [LocalDemandPanel], template: `<app-local-demand-panel [data]="d()" />` })
    class Host {
      readonly d = signal(month({ demand: DEMAND }));
    }
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.textContent).toContain('La demanda en tu zona');
    expect(el.textContent).toContain('12 pedidos de Plomería en Tandil');
    expect(el.textContent).toContain('nunca mostramos quién pidió');
    f.componentInstance.d.set(month());
    f.detectChanges();
    expect(el.querySelector('[data-testid="local-demand"]')).toBeNull();
  });
});

describe('Fase 4: en vez de ceros, por qué', () => {
  it('elegible y sin Destacados: cuántos PRO rotan, barrios y foto; nunca un cero suelto', () => {
    const d = month({ demand: DEMAND });
    expect(proZeroDiagnosis(d, me()).map((z) => z.text)).toEqual([
      'Hay 2 perfiles PRO más de Plomería en Tandil: los espacios Destacados rotan día a día entre todos.',
    ]);
    const partial = proZeroDiagnosis(d, me({ avatarUrl: null, coverage: [{ ...me().coverage![0], coversEntireCity: false }] }));
    expect(partial.map((z) => z.cta?.label ?? null)).toEqual([null, 'Sumar barrios', 'Sumar mi foto']);
  });

  it('no elegible: la razón real primero, con su arreglo', () => {
    const z = proZeroDiagnosis(month({ demand: DEMAND }), me({ featured: { eligible: false, reason: 'PROFILE_PAUSED' } }));
    expect(z[0]).toEqual({
      text: 'Tu perfil está pausado: no aparece en búsquedas ni en Destacados.',
      cta: { label: 'Reactivar mi perfil', link: '/pro/perfil' },
    });
  });

  it('sin muestra no infiere demanda; con números reales no diagnostica; Free nunca', () => {
    expect(proZeroDiagnosis(month(), me()).map((z) => z.text)).toEqual([
      'Todavía no registramos solicitudes que te hayan llegado antes que a perfiles Free. Solo contamos esa ventaja cuando otro perfil recibió el mismo pedido más tarde.',
    ]);
    const busy = month({
      demand: DEMAND,
      exposure: { ...month().exposure!, featuredImpressions: 9 },
      advanced: { attribution: { earlyAccessOpportunities: 2 } } as MonthAnalytics['advanced'],
    });
    expect(proZeroDiagnosis(busy, me())).toEqual([]);
    expect(proZeroDiagnosis(month({ plan: 'FREE' }), me())).toEqual([]);
  });
});
