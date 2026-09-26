import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CatalogStore } from '../../../core/state/catalog.store';
import { ProStore } from '../../../core/state/pro.store';
import { ProProfilePage } from './pro-profile-page';

describe('perfil del profesional existente', () => {
  it('muestra datos propios y verificaciones reales, sin el perfil demo', () => {
    TestBed.configureTestingModule({ providers: [
      provideRouter([]),
      { provide: CatalogStore, useValue: {} },
      { provide: ProStore, useValue: {
        publicProfileId: signal('profile-1'),
        ownProfile: signal({
          id: 'profile-1', displayName: 'María Pérez', headline: 'Plomería en Tandil',
          bio: 'Trabajo en Tandil.', yearsExperience: 4,
          services: [{ id: 'service-1', name: 'Plomería' }], zones: [{ id: 'zone-1', name: 'Centro' }],
          verifications: { identity: false, phone: false, license: false, licenses: [] },
          verificationRequests: [{ id: 'verification-1', type: 'LICENSE', status: 'PENDING' }],
        }),
        ownProfileError: signal(false), available: signal(false), savingAvailability: signal(false), settings: signal({}),
        plan: signal('free'), me: signal({ name: 'María Pérez' }),
      } },
    ] });
    const fixture = TestBed.createComponent(ProProfilePage);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('María Pérez');
    expect(text).toContain('Plomería en Tandil');
    expect(text).toContain('Centro');
    expect(text).toContain('Matrícula: Pendiente');
    expect(text).not.toContain('Identidad y matrícula verificadas');
    expect(text).not.toContain('Juan Martín');
  });
});
