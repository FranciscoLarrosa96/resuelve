import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_URL } from '../../../core/api/api.config';
import { IncomingReferral, ReferralProgress } from './referral-progress';
import { ReferralsPanel } from './referrals-panel';

function render(referral: IncomingReferral | null) {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(ReferralProgress);
  fixture.componentRef.setInput('referral', referral);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return { el, fixture, text: () => el.textContent?.replace(/\s+/g, ' ').trim() ?? '' };
}

describe('Beneficio de la cuenta referida', () => {
  it('no muestra el bloque en cuentas sin referral o inválidas', () => {
    const { el, fixture } = render(null);
    expect(el.querySelector('section')).toBeNull();
    fixture.componentRef.setInput('referral', { status: 'INVALID', rewardDays: null });
    fixture.detectChanges();
    expect(el.querySelector('section')).toBeNull();
  });
  it('REWARDED: los días del backend, sin pasos ni botones', () => {
    const { el, text } = render({ status: 'REWARDED', rewardDays: 21 });
    expect(text()).toContain('Activaste 21 días de Resuelve PRO');
    expect(text()).toContain('La prueba es única por persona.');
    expect(el.querySelector('ul, a, button')).toBeNull();
  });
  it('ACTIVATED: lleva a Mi plan para preparar y activar la prueba', () => {
    const { el, text } = render({ status: 'ACTIVATED', rewardDays: 21 });
    expect(text()).toContain('Prepará tu perfil y activá tu prueba desde Mi plan.');
    expect(el.querySelector('button')).toBeNull();
  });
  it('REGISTERED (invitación anterior): un solo botón para activar', () => {
    const { el, text } = render({ status: 'REGISTERED', rewardDays: 7 });
    expect(text()).toContain('Tenés 7 días de PRO esperándote');
    expect(el.querySelector('[data-testid="referral-claim"]')?.getAttribute('href')).toBe('/pro/plan');
    expect(el.querySelector('button')).toBeNull();
  });
  it('el panel no activa días al mostrar una invitación pendiente', () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_URL, useValue: '/api' },
      ],
    });
    const fixture = TestBed.createComponent(ReferralsPanel);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    const summary = {
      enabled: false,
      code: null,
      rewardsEnabled: true,
      rewardDays: 21,
      maxRewards: 3,
      rewardsLeft: 3,
      counts: { registered: 0, activated: 0, rewarded: 0 },
      items: [],
      incoming: { status: 'REGISTERED', rewardDays: 21 },
    };
    http.expectOne('/api/pro/acquisition/referrals').flush(summary);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="referral-claim"]')?.getAttribute('href')).toBe('/pro/plan');
    http.expectNone('/api/pro/acquisition/referrals/claim');
    http.verify();
  });
});
