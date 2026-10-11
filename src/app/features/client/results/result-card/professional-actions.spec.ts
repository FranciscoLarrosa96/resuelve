import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { API_URL } from '../../../../core/api/api.config';
import { ProfessionalSummary } from '../../../../core/models/professional';
import { ProfessionalActions } from './professional-actions';

const pro = (contactChannels?: ProfessionalSummary['contactChannels']): ProfessionalSummary => ({
  id: 'pro-1',
  firstName: 'Juan',
  lastName: 'Pérez',
  displayName: 'Juan Pérez',
  avatarUrl: null,
  headline: 'Electricista',
  bio: null,
  yearsExperience: 5,
  availableToday: true,
  contactChannels,
  averageResponseMinutes: null,
  averageRating: null,
  reviewsCount: 0,
  completedJobsCount: 0,
  services: [],
  coversEntireCity: true,
  zones: [],
  verifications: { identity: false, phone: false, license: false, licenses: [] },
  pro: false,
});

function render(p: ProfessionalSummary) {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), { provide: API_URL, useValue: 'http://api.test' }],
  });
  const fixture = TestBed.createComponent(ProfessionalActions);
  fixture.componentRef.setInput('pro', p);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

const text = (el: HTMLElement) => el.textContent ?? '';

describe('ProfessionalActions: mismas acciones en búsqueda, destacados y urgencias', () => {
  it('con los tres canales: Pedir presupuesto (principal) + WhatsApp + Llamar', () => {
    const el = render(pro({ whatsapp: true, phone: true, requests: true }));
    expect(text(el)).toContain('Pedir presupuesto');
    expect(el.querySelector('[data-testid="contact-whatsapp"]')!.className).toContain('button-secondary');
    expect(el.querySelector('[data-testid="contact-phone"]')).not.toBeNull();
  });

  it('sin solicitudes por Resuelve: no ofrece "Pedir presupuesto" y WhatsApp pasa a ser la acción principal', () => {
    const el = render(pro({ whatsapp: true, phone: false, requests: false }));
    expect(text(el)).not.toContain('Pedir presupuesto');
    expect(el.querySelector('[data-testid="contact-whatsapp"]')!.className).toContain('button-primary');
    expect(el.querySelector('[data-testid="contact-phone"]')).toBeNull();
  });

  it('backend anterior (sin canales): solo el pedido de siempre', () => {
    const el = render(pro(undefined));
    expect(text(el)).toContain('Pedir presupuesto');
    expect(el.querySelector('[data-testid="contact-actions"]')).toBeNull();
  });
});
