import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { CatalogApiService } from '../../../core/api/catalog-api.service';
import { CreateProfessionalProfile, OwnProfessional, ProProfileApiService } from '../../../core/api/pro-profile-api.service';
import { AuthUser } from '../../../core/models/auth';
import { AuthStore } from '../../../core/state/auth.store';
import { ProOnboardingPage } from './pro-onboarding-page';

@Component({ template: '' })
class Blank {}

const USER: AuthUser = {
  id: 'user-1', firstName: 'María', lastName: 'Pérez', email: 'maria@example.com', phone: null,
  phoneVerified: false, avatarUrl: null, defaultZoneId: null, professionalProfileId: null,
  createdAt: '2026-09-01T12:00:00.000Z',
};
const SERVICE_ID = '11111111-1111-4111-8111-111111111111';
const ZONE_ID = '22222222-2222-4222-8222-222222222222';
const PROFILE_ID = '33333333-3333-4333-8333-333333333333';

function setup(response: Observable<OwnProfessional> = of({ id: PROFILE_ID } as OwnProfessional)) {
  const user = signal<AuthUser | null>(USER);
  const auth = { user, displayName: signal('María Pérez'), loadMe: vi.fn(async () => {
    user.set({ ...USER, professionalProfileId: PROFILE_ID });
    return user();
  }) };
  const profileApi = { createProfile: vi.fn(() => response) };
  TestBed.configureTestingModule({ providers: [
    provideRouter([{ path: 'pro/dashboard', component: Blank }, { path: 'profesional/:id', component: Blank }]),
    { provide: AuthStore, useValue: auth },
    { provide: CatalogApiService, useValue: {
      getCategories: () => of([{ id: 'category-1', name: 'Oficios', slug: 'oficios', services: [
        { id: SERVICE_ID, name: 'Gas', slug: 'gas', categoryId: 'category-1', requiresLicense: true },
      ] }]),
      getZones: () => of([{ id: ZONE_ID, name: 'Centro', slug: 'centro', cityId: 'city-1' }]),
    } },
    { provide: ProProfileApiService, useValue: profileApi },
  ] });
  const fixture = TestBed.createComponent(ProOnboardingPage);
  fixture.detectChanges();
  return { fixture, profileApi, auth };
}

function button(host: HTMLElement, label: string): HTMLButtonElement {
  const found = [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === label);
  if (!found) throw new Error(`No se encontró el botón ${label}`);
  return found;
}

beforeEach(() => sessionStorage.clear());

describe('alta profesional', () => {
  it('usa catálogo real, revisa y publica con una sola llamada; refresca /auth/me', async () => {
    const { fixture, profileApi, auth } = setup();
    await fixture.whenStable();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    button(host, 'Crear mi perfil').click();
    fixture.detectChanges();
    expect(host.textContent).toContain('Gas');
    expect(host.textContent).toContain('Matrícula');
    (host.querySelector('input[type=checkbox]') as HTMLInputElement).click();
    button(host, 'Continuar').click();
    fixture.detectChanges();
    expect(host.textContent).toContain('Centro');
    (host.querySelector('input[type=checkbox]') as HTMLInputElement).click();
    button(host, 'Continuar').click();
    fixture.detectChanges();
    const headline = host.querySelector<HTMLInputElement>('#pro-headline')!;
    headline.value = 'Gasista en Tandil';
    headline.dispatchEvent(new Event('input'));
    button(host, 'Continuar').click();
    fixture.detectChanges();
    (host.querySelector('input[type=checkbox]') as HTMLInputElement).click();
    button(host, 'Continuar').click();
    fixture.detectChanges();
    expect(host.textContent).toContain('Gasista en Tandil');
    button(host, 'Publicar perfil').click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(profileApi.createProfile).toHaveBeenCalledOnce();
    expect(profileApi.createProfile).toHaveBeenCalledWith({
      headline: 'Gasista en Tandil', bio: undefined, yearsExperience: 0,
      serviceIds: [SERVICE_ID], zoneIds: [ZONE_ID], availableToday: true,
    } satisfies CreateProfessionalProfile);
    expect(auth.loadMe).toHaveBeenCalledOnce();
    expect(host.textContent).toContain('Tu perfil profesional está listo');
    expect(sessionStorage.getItem('resuelve:onboarding-pro:user-1')).toBeNull();
  });

  it('"Todo Tandil": no obliga a marcar barrios ni manda una zona falsa', async () => {
    const { fixture, profileApi } = setup();
    await fixture.whenStable();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    button(host, 'Crear mi perfil').click();
    fixture.detectChanges();
    (host.querySelector('input[type=checkbox]') as HTMLInputElement).click();
    button(host, 'Continuar').click();
    fixture.detectChanges();
    expect(host.textContent).toContain('¿Dónde trabajás?');
    const radio = (name: string) => [...host.querySelectorAll('label')].find((l) => l.textContent?.trim() === name)!.querySelector('input')!;
    radio('Todo Tandil').click();
    fixture.detectChanges();
    expect(host.textContent).toContain('Vas a aparecer en búsquedas de cualquier barrio de Tandil.');
    expect(host.textContent).not.toContain('Centro');
    button(host, 'Continuar').click();
    fixture.detectChanges();
    const headline = host.querySelector<HTMLInputElement>('#pro-headline')!;
    headline.value = 'Gasista en Tandil';
    headline.dispatchEvent(new Event('input'));
    button(host, 'Continuar').click();
    fixture.detectChanges();
    button(host, 'Continuar').click();
    fixture.detectChanges();
    expect(host.textContent).toContain('Todo Tandil');
    button(host, 'Publicar perfil').click();
    await fixture.whenStable();
    expect(profileApi.createProfile).toHaveBeenCalledWith(expect.objectContaining({ coversEntireCity: true }));
    expect((profileApi.createProfile.mock.calls[0] as unknown[])[0]).not.toHaveProperty('zoneIds');
  });

  it('conserva la selección al salir y volver en la misma pestaña', async () => {
    const { fixture } = setup();
    await fixture.whenStable();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    button(host, 'Crear mi perfil').click();
    fixture.detectChanges();
    (host.querySelector('input[type=checkbox]') as HTMLInputElement).click();
    fixture.detectChanges();
    expect(sessionStorage.getItem('resuelve:onboarding-pro:user-1')).toContain(SERVICE_ID);
    fixture.destroy();

    const again = TestBed.createComponent(ProOnboardingPage);
    again.detectChanges();
    await again.whenStable();
    again.detectChanges();
    const restored = again.nativeElement as HTMLElement;
    expect(restored.textContent).toContain('Paso 1 de 5');
    expect(restored.querySelector<HTMLInputElement>('input[type=checkbox]')?.checked).toBe(true);
  });

  it('bloquea el doble envío mientras la publicación está en curso', async () => {
    const pending = new Subject<OwnProfessional>();
    const { fixture, profileApi } = setup(pending.asObservable());
    await fixture.whenStable();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    button(host, 'Crear mi perfil').click(); fixture.detectChanges();
    (host.querySelector('input[type=checkbox]') as HTMLInputElement).click();
    button(host, 'Continuar').click(); fixture.detectChanges();
    (host.querySelector('input[type=checkbox]') as HTMLInputElement).click();
    button(host, 'Continuar').click(); fixture.detectChanges();
    const headline = host.querySelector<HTMLInputElement>('#pro-headline')!;
    headline.value = 'Gasista'; headline.dispatchEvent(new Event('input'));
    button(host, 'Continuar').click(); fixture.detectChanges();
    button(host, 'Continuar').click(); fixture.detectChanges();
    const publish = button(host, 'Publicar perfil');
    publish.click();
    publish.click();
    fixture.detectChanges();
    expect(publish.disabled).toBe(true);
    expect(profileApi.createProfile).toHaveBeenCalledOnce();
    pending.next({ id: PROFILE_ID } as OwnProfessional); pending.complete();
    await fixture.whenStable();
  });

  it('ante un error de red conserva el borrador para reintentar', async () => {
    const { fixture } = setup(throwError(() => new HttpErrorResponse({ status: 0, statusText: 'Network' })));
    await fixture.whenStable(); fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    button(host, 'Crear mi perfil').click(); fixture.detectChanges();
    (host.querySelector('input[type=checkbox]') as HTMLInputElement).click();
    button(host, 'Continuar').click(); fixture.detectChanges();
    (host.querySelector('input[type=checkbox]') as HTMLInputElement).click();
    button(host, 'Continuar').click(); fixture.detectChanges();
    const headline = host.querySelector<HTMLInputElement>('#pro-headline')!;
    headline.value = 'Gasista'; headline.dispatchEvent(new Event('input'));
    button(host, 'Continuar').click(); fixture.detectChanges();
    button(host, 'Continuar').click(); fixture.detectChanges();
    button(host, 'Publicar perfil').click();
    await fixture.whenStable(); fixture.detectChanges();
    expect(host.querySelector('[role=alert]')?.textContent).toContain('Tus datos siguen guardados');
    expect(sessionStorage.getItem('resuelve:onboarding-pro:user-1')).toContain('Gasista');
  });
});
