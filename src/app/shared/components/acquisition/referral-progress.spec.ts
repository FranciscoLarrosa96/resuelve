import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_URL } from '../../../core/api/api.config';
import { IncomingReferral, ReferralProgress } from './referral-progress';
import { ReferralsPanel } from './referrals-panel';

const complete = {
  accountCreated: true,
  profileCompleted: true,
  serviceConfigured: true,
  coverageConfigured: true,
  licenseValid: null,
  firstValidQuoteSent: false,
};
const pending = (
  patch: Partial<NonNullable<IncomingReferral['steps']>> = {},
): IncomingReferral => ({
  status: 'REGISTERED',
  rewardDays: 15,
  steps: { ...complete, ...patch },
});
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
    fixture.componentRef.setInput('referral', { status: 'INVALID', rewardDays: null, steps: null });
    fixture.detectChanges();
    expect(el.querySelector('section')).toBeNull();
  });
  it('REGISTERED muestra los pasos reales y solo una acción contextual', () => {
    const { el, text } = render(pending({ profileCompleted: false, serviceConfigured: false }));
    expect(text()).toContain('Tenés 15 días de PRO esperándote');
    expect(text()).toContain('Te faltan 3 pasos para activar tu beneficio');
    expect(el.querySelectorAll('li')).toHaveLength(5);
    expect(el.querySelectorAll('li.complete')).toHaveLength(2);
    expect(el.querySelector('a')?.textContent).toContain('Completar perfil');
    expect(el.querySelector('a')?.getAttribute('href')).toBe('/pro/perfil?editar=presentation');
  });
  it.each([
    ['serviceConfigured', 'Agregar servicio', '/pro/perfil?editar=services'],
    ['coverageConfigured', 'Configurar zona', '/pro/perfil?editar=coverage'],
    ['licenseValid', 'Completar matrícula', '/pro/perfil#sec-verifications'],
  ] as const)('lleva a la sección correcta si falta %s', (key, label, href) => {
    const { el } = render(pending({ [key]: false }));
    expect(el.querySelector('a')?.textContent).toContain(label);
    expect(el.querySelector('a')?.getAttribute('href')).toBe(href);
  });
  it('si solo falta el presupuesto muestra 1 paso y oportunidades', () => {
    const { el, text } = render(pending());
    expect(text()).toContain('1 paso para activar tu beneficio');
    expect(el.querySelector('a')?.textContent).toContain('Ver oportunidades');
    expect(el.querySelector('a')?.getAttribute('href')).toBe('/pro/solicitudes');
    expect(text()).not.toContain('matrícula');
  });
  it('no hace pasar una matrícula pendiente por válida', () => {
    const { el, text } = render(pending({ licenseValid: false }));
    expect(el.querySelectorAll('li')).toHaveLength(6);
    expect(text()).toContain('Te faltan 2 pasos');
    expect(text()).toContain('Completá la matrícula de tu servicio · Pendiente');
  });
  it('REWARDED usa los días del backend y reemplaza el checklist', () => {
    const { el, text } = render({ status: 'REWARDED', rewardDays: 21, steps: null });
    expect(text()).toContain('¡Listo! Activaste 21 días de Resuelve PRO');
    expect(text()).toContain('también le dio 21 días de PRO');
    expect(el.querySelector('ul, a')).toBeNull();
  });
  it('ACTIVATED sin recompensa comunica pendiente sin pedir pasos otra vez', () => {
    const { el, text } = render({ status: 'ACTIVATED', rewardDays: 21, steps: null });
    expect(text()).toContain('Cumpliste los requisitos');
    expect(text()).toContain('Tu beneficio está pendiente de activación.');
    expect(text()).not.toContain('Activaste 21 días');
    expect(el.querySelector('ul, a')).toBeNull();
  });
  it('actualiza el progreso sin repetir solicitudes pendientes ni inventar pasos', () => {
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
      counts: { registered: 0, activated: 0, rewarded: 0 },
      items: [],
      incoming: pending(),
    };
    http.expectOne('/api/pro/acquisition/referrals').flush(summary);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    el.querySelector<HTMLButtonElement>('button')!.click();
    fixture.detectChanges();
    expect(el.querySelector<HTMLButtonElement>('button')!.disabled).toBe(true);
    http
      .expectOne('/api/pro/acquisition/referrals')
      .flush({ ...summary, incoming: { status: 'REWARDED', rewardDays: 21, steps: null } });
    fixture.detectChanges();
    expect(el.textContent).toContain('Activaste 21 días');
    expect(el.querySelector('.referral-checklist')).toBeNull();
    http.verify();
  });
});
