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
  counts: { registered: 2, activated: 1, rewarded: 0 },
  items: [{ id: '1', firstName: 'Ana', lastInitial: 'P', status: 'REGISTERED', rewardDays: null }],
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
    expect(el.textContent).toContain('Ver mis invitaciones (2)');
    expect(el.querySelector('ul')).toBeNull();
  });

  it('completo: ancla #invitar y listado de invitaciones', () => {
    const el = render(false, SUMMARY);
    expect(el.querySelector('#invitar')).not.toBeNull();
    expect(el.querySelector('ul')?.textContent).toContain('Ana P.');
  });

  it('referidos apagados: no muestra nada', () => {
    const el = render(true, { ...SUMMARY, enabled: false, code: null });
    expect(el.querySelector('#invitar')).toBeNull();
  });
});
