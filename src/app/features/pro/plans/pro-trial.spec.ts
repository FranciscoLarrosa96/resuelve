import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { Router } from '@angular/router';
import { vi } from 'vitest';
import { ProTrial, ProTrialSummary } from '../../../core/models/pro-profile';
import { notificationCopy, notificationToast } from '../../../core/models/notification';
import { ProStore } from '../../../core/state/pro.store';
import { AuthStore } from '../../../core/state/auth.store';
import { CurrentRoute } from '../../../core/services/current-route.service';
import { ProRequestsStore } from '../../../core/state/pro-requests.store';
import { NotificationsStore } from '../../../core/state/notifications.store';
import { FunnelTracker } from '../../../core/analytics/funnel-tracker';
import { trialSummaryFacts } from '../../../core/utils/pro-value';
import { ProShell } from '../../../layout/pro-shell/pro-shell';
import { ProTrialOffer } from './pro-trial-offer';
import { ProTrialSummaryView } from './pro-trial-summary';

const summary = (patch: Partial<ProTrialSummary> = {}): ProTrialSummary => ({
  startedAt: '2026-09-20T15:00:00.000Z',
  endsAt: '2026-10-04T15:00:00.000Z',
  days: 14,
  featuredImpressions: 0,
  earlyOpportunities: 0,
  profileViews: 0,
  quotesAboveFreeLimit: 0,
  ...patch,
});

describe('prueba de PRO: resumen con sus números', () => {
  it('solo lo que pasó (sin ceros), con singular y plural', () => {
    expect(trialSummaryFacts(summary())).toEqual([]);
    expect(
      trialSummaryFacts(summary({ featuredImpressions: 12, earlyOpportunities: 1, profileViews: 0, quotesAboveFreeLimit: 2 })),
    ).toEqual([
      { value: '12', text: 'apariciones en Destacados' },
      { value: '1', text: 'solicitud nueva que viste antes que los perfiles Free' },
      { value: '2', text: 'presupuestos que mandaste por encima del cupo Free' },
    ]);
    expect(trialSummaryFacts(summary({ profileViews: 1 }))).toEqual([{ value: '1', text: 'visita a tu perfil' }]);
  });

  it('nunca promete ni dice que PRO lo causó', () => {
    const all = trialSummaryFacts(summary({ featuredImpressions: 3, earlyOpportunities: 3, profileViews: 3, quotesAboveFreeLimit: 3 }));
    const text = all.map((f) => f.text).join(' ');
    expect(text).not.toMatch(/gracias a|por PRO|vas a|garantiz|clientes/i);
  });

  it('la vista muestra el período y, sin hechos, lo dice sin inventar números', async () => {
    @Component({ imports: [ProTrialSummaryView], template: `<app-pro-trial-summary [summary]="s()" />` })
    class Host {
      readonly s = signal(summary());
    }
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.textContent).toContain('del 20 de septiembre al 4 de octubre');
    expect(el.textContent).toContain('no registramos');
    expect(el.querySelectorAll('[data-testid="pro-trial-fact"]')).toHaveLength(0);
    f.componentInstance.s.set(summary({ profileViews: 8 }));
    f.detectChanges();
    expect(el.querySelectorAll('[data-testid="pro-trial-fact"]')).toHaveLength(1);
    expect(el.textContent).toContain('sin decir que PRO lo causó');
  });
});

describe('prueba de PRO: oferta en Tu mes', () => {
  function render(trial: ProTrial | null, start = vi.fn(async () => true)) {
    TestBed.configureTestingModule({
      providers: [{ provide: ProStore, useValue: { proTrial: signal(trial), startingTrial: signal(false), startProTrial: start } }],
    });
    const f = TestBed.createComponent(ProTrialOffer);
    f.detectChanges();
    return { f, el: f.nativeElement as HTMLElement, start };
  }

  it('solo si el backend dice AVAILABLE', () => {
    expect(render({ state: 'UNAVAILABLE', reason: 'BEFORE_FIRST_SUCCESS' }).el.textContent?.trim()).toBe('');
    TestBed.resetTestingModule();
    expect(render(null).el.textContent?.trim()).toBe('');
    TestBed.resetTestingModule();
    const { el } = render({ state: 'AVAILABLE', days: 14 });
    expect(el.textContent).toContain('Probá Resuelve PRO 14 días gratis.');
    expect(el.textContent).toContain('Sin tarjeta y sin cobros');
  });

  it('opt-in: el botón abre la confirmación y recién "Empezar prueba" la activa', async () => {
    const { f, el, start } = render({ state: 'AVAILABLE', days: 14 });
    const emitted = vi.fn();
    f.componentInstance.started.subscribe(emitted);
    (el.querySelector('[data-testid="pro-trial-open"]') as HTMLButtonElement).click();
    f.detectChanges();
    expect(start).not.toHaveBeenCalled();
    const dialog = el.querySelector('dialog') as HTMLElement;
    expect(dialog.textContent).toContain('Es gratis y sin tarjeta.');
    expect(dialog.textContent).toContain('una sola vez');
    (el.querySelector('[data-testid="pro-trial-start"]') as HTMLButtonElement).click();
    await f.whenStable();
    expect(start).toHaveBeenCalledTimes(1);
    expect(emitted).toHaveBeenCalledTimes(1);
  });
});

describe('prueba de PRO: resumen al terminar en el panel', () => {
  function shell(trial: ProTrial, opts: { hasPro?: boolean; celebration?: boolean } = {}) {
    const navigate = vi.fn();
    const track = vi.fn();
    const acknowledge = vi.fn(async () => undefined);
    const trialSummary = signal<ProTrialSummary | null>(null);
    const load = vi.fn(async () => {
      trialSummary.set(summary({ profileViews: 5 }));
      return trialSummary();
    });
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthStore, useValue: { authenticated: signal(true), user: signal(null) } },
        { provide: CurrentRoute, useValue: { data: signal({}) } },
        { provide: ProRequestsStore, useValue: { hasProfile: signal(false), loadPendingCount: vi.fn() } },
        { provide: NotificationsStore, useValue: { proRequestsNews: signal(0) } },
        {
          provide: ProStore,
          useValue: {
            ownProfile: signal({ showFirstSuccessCelebration: !!opts.celebration, referralCelebration: null }),
            proTrial: signal(trial),
            trialSummary,
            loadTrialSummary: load,
            acknowledgeTrialSummary: acknowledge,
            hasPro: signal(!!opts.hasPro),
          },
        },
        { provide: Router, useValue: { navigate } },
        { provide: FunnelTracker, useValue: { track } },
      ],
    });
    const s = TestBed.runInInjectionContext(() => new ProShell()) as unknown as {
      trialSummary(): ProTrialSummary | null;
      contractAfterTrial(): void;
      closeTrialSummary(): void;
    };
    TestBed.tick();
    return { s, navigate, track, acknowledge, load };
  }
  const ended = (summaryPending: boolean): ProTrial => ({
    state: 'ENDED',
    days: 14,
    startedAt: '2026-09-20T15:00:00.000Z',
    endsAt: '2026-10-04T15:00:00.000Z',
    summaryPending,
  });

  it('terminada y sin ver: carga el resumen y lo muestra una vez', async () => {
    const { s, load, acknowledge } = shell(ended(true));
    await Promise.resolve();
    expect(load).toHaveBeenCalled();
    expect(s.trialSummary()?.profileViews).toBe(5);
    s.closeTrialSummary();
    expect(acknowledge).toHaveBeenCalledTimes(1);
  });

  it('ya visto, en curso o con el festejo del primer cliente abierto: no se abre', () => {
    expect(shell(ended(false)).load).not.toHaveBeenCalled();
    TestBed.resetTestingModule();
    expect(
      shell({ state: 'ACTIVE', days: 14, startedAt: '', endsAt: '', summaryPending: false }).load,
    ).not.toHaveBeenCalled();
    TestBed.resetTestingModule();
    expect(shell(ended(true), { celebration: true }).load).not.toHaveBeenCalled();
  });

  it('"Contratar" lleva a la contratación de Mi plan, lo mide y no lo vuelve a mostrar', () => {
    const { s, navigate, track, acknowledge } = shell(ended(true));
    s.contractAfterTrial();
    expect(track).toHaveBeenCalledWith('PRO_CTA_CLICKED', 'TRIAL_SUMMARY');
    expect(acknowledge).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/pro/plan'], { fragment: 'contratar' });
  });
});

describe('aviso in-app "antes que Free"', () => {
  const base = { type: 'PRO_REQUEST_RECEIVED' as const, professionalName: null, requestTitle: 'Pierde la canilla' };
  it('solo con la marca del backend', () => {
    expect(notificationCopy({ ...base, aheadOfFree: true }).detail).toBe(
      'Un cliente pidió presupuesto. Te llegó antes que a los perfiles Free.',
    );
    expect(notificationCopy(base).detail).toBe('Un cliente te pidió presupuesto.');
    expect(notificationToast({ ...base, aheadOfFree: true })).toBe(
      'Nueva solicitud: “Pierde la canilla”. Te llegó antes que a los perfiles Free.',
    );
    expect(notificationToast(base)).toBe('Nueva solicitud: “Pierde la canilla”.');
  });
});
