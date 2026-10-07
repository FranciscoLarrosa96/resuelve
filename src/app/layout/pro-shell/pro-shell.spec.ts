import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { vi } from 'vitest';
import { CurrentRoute } from '../../core/services/current-route.service';
import { AuthStore } from '../../core/state/auth.store';
import { NotificationsStore } from '../../core/state/notifications.store';
import { ProRequestsStore } from '../../core/state/pro-requests.store';
import { ProStore } from '../../core/state/pro.store';
import { ProShell } from './pro-shell';

describe('momento comercial del primer éxito', () => {
  const ownProfile = signal<{ showFirstSuccessCelebration: boolean } | null>({
    showFirstSuccessCelebration: true,
  });
  const acknowledge = vi.fn(async () => {
    ownProfile.set({ showFirstSuccessCelebration: false });
    return true;
  });
  const navigate = vi.fn(async () => true);

  beforeEach(() => {
    ownProfile.set({ showFirstSuccessCelebration: true });
    acknowledge.mockClear();
    navigate.mockClear();
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthStore, useValue: { authenticated: signal(true) } },
        { provide: CurrentRoute, useValue: { data: signal({}) } },
        { provide: ProRequestsStore, useValue: { hasProfile: signal(false), loadPendingCount: vi.fn() } },
        {
          provide: NotificationsStore,
          useValue: {
            proRequestsNews: signal(0),
            proAgendaBadge: signal(0),
            proAgendaNews: signal(0),
            proCompletionDue: signal(false),
          },
        },
        { provide: ProStore, useValue: { ownProfile, acknowledgeFirstSuccess: acknowledge } },
        { provide: Router, useValue: { navigate } },
      ],
    });
  });

  const create = () => TestBed.runInInjectionContext(() => new ProShell()) as unknown as {
    showFirstSuccess(): boolean;
    continueFree(): Promise<void>;
    continuePro(): Promise<void>;
  };

  it('se muestra hasta elegir Seguir con Free y se reconoce en backend', async () => {
    const shell = create();
    expect(shell.showFirstSuccess()).toBe(true);
    await shell.continueFree();
    expect(acknowledge).toHaveBeenCalledOnce();
    expect(shell.showFirstSuccess()).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('Continuar con PRO reconoce la celebración y abre Mi Plan', async () => {
    const shell = create();
    await shell.continuePro();
    expect(acknowledge).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith(['/pro/plan'], { queryParams: { quiero: '1' } });
  });
});

describe('festejo de referidos', () => {
  const celebration = {
    rewardId: 'rw1',
    role: 'REFERRER' as const,
    friendName: 'Pepe',
    days: 15,
    accessUntil: '2026-10-22T12:00:00.000Z',
    rewardsLeft: 2,
  };
  type Own = { showFirstSuccessCelebration: boolean; referralCelebration: typeof celebration | null };
  const ownProfile = signal<Own | null>(null);
  const ackReferral = vi.fn(async () => {
    ownProfile.update((p) => (p ? { ...p, referralCelebration: null } : p));
  });
  const navigate = vi.fn(async () => true);

  beforeEach(() => {
    ownProfile.set({ showFirstSuccessCelebration: false, referralCelebration: celebration });
    ackReferral.mockClear();
    navigate.mockClear();
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthStore, useValue: { authenticated: signal(true) } },
        { provide: CurrentRoute, useValue: { data: signal({}) } },
        { provide: ProRequestsStore, useValue: { hasProfile: signal(false), loadPendingCount: vi.fn() } },
        { provide: NotificationsStore, useValue: { proRequestsNews: signal(0) } },
        {
          provide: ProStore,
          useValue: { ownProfile, acknowledgeFirstSuccess: vi.fn(), acknowledgeReferralCelebration: ackReferral },
        },
        { provide: Router, useValue: { navigate } },
      ],
    });
  });

  const create = () => TestBed.runInInjectionContext(() => new ProShell()) as unknown as {
    referral(): typeof celebration | null;
    until(iso: string): string;
    closeReferral(): void;
    inviteMore(): void;
  };

  it('se muestra con el nombre del amigo y se cierra una vez en el backend', async () => {
    const shell = create();
    expect(shell.referral()).toMatchObject({ friendName: 'Pepe', role: 'REFERRER' });
    expect(shell.until(celebration.accessUntil)).toBe('22 de octubre');
    shell.closeReferral();
    await Promise.resolve();
    expect(ackReferral).toHaveBeenCalledOnce();
    expect(shell.referral()).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('"Invitar a otro colega" lo cierra y lleva al enlace en Mi plan', () => {
    create().inviteMore();
    expect(ackReferral).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith(['/pro/plan'], { fragment: 'invitar' });
  });

  it('nunca encima del festejo del primer cliente', () => {
    ownProfile.set({ showFirstSuccessCelebration: true, referralCelebration: celebration });
    expect(create().referral()).toBeNull();
  });
});
