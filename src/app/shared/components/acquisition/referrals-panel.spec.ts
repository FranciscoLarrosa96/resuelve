import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { API_URL } from '../../../core/api/api.config';
import { ReferralsPanel } from './referrals-panel';

const SUMMARY = {
  incoming: null,
  enabled: true,
  code: 'ABC123',
  rewardDays: 15,
  rewardsEnabled: true,
  maxRewards: 3,
  rewardsLeft: 2,
  counts: { registered: 3, activated: 2, rewarded: 2 },
  items: [
    { id: '1', firstName: 'Ana', lastInitial: 'P', status: 'REGISTERED', rewardDays: null },
    { id: '2', firstName: 'Beto', lastInitial: 'R', status: 'REWARDED', rewardDays: 15 },
    { id: '3', firstName: 'Caro', lastInitial: 'S', status: 'REWARDED', rewardDays: null },
  ],
};

function render(compact: boolean, body: object) {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), { provide: API_URL, useValue: '/api' }],
  });
  const fixture = TestBed.createComponent(ReferralsPanel);
  fixture.componentRef.setInput('compact', compact);
  fixture.detectChanges();
  TestBed.inject(HttpTestingController).expectOne('/api/pro/acquisition/referrals').flush(body);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('ReferralsPanel', () => {
  it('compacto: invitación con los 15 días, WhatsApp y copiar, sin listado', () => {
    const el = render(true, SUMMARY);
    expect(el.querySelector('h2')?.textContent).toContain('Regalá 15 días de PRO a un colega');
    expect(el.querySelector('a[href*="wa.me"]')).not.toBeNull();
    expect(el.textContent).toContain('Copiar enlace');
    expect(el.textContent).toContain('apenas arme su perfil profesional, los dos tienen 15 días de PRO');
    expect(el.textContent).not.toContain('presupuesto');
    expect(el.querySelector('[data-testid="referral-allowance"]')?.textContent).toContain('Te quedan 2 colegas');
    expect(el.textContent).toContain('Ver mis invitaciones (3)');
    expect(el.querySelector('ul')).toBeNull();
  });

  it('completo: ancla #invitar y listado de invitaciones', () => {
    const el = render(false, SUMMARY);
    expect(el.querySelector('#invitar')).not.toBeNull();
    const list = el.querySelector('ul')?.textContent ?? '';
    expect(list).toContain('Ana P.');
    expect(list).toContain('todavía no armó su perfil');
    expect(list).toContain('+15 días PRO para vos');
    expect(list).toContain('sin días para vos (llegaste al máximo)');
  });

  it('tope alcanzado: lo dice y aclara que los colegas igual reciben sus días', () => {
    const el = render(true, { ...SUMMARY, rewardsLeft: 0 });
    expect(el.querySelector('[data-testid="referral-allowance"]')?.textContent).toContain(
      'Ya sumaste el máximo de días por invitar (3 colegas)',
    );
  });

  it('referidos apagados: no muestra nada', () => {
    const el = render(true, { ...SUMMARY, enabled: false, code: null });
    expect(el.querySelector('#invitar')).toBeNull();
  });
});
